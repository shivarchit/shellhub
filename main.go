package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/sarchitt/shellhub/internal/api"
	"github.com/sarchitt/shellhub/internal/auth"
	"github.com/sarchitt/shellhub/internal/config"
	sshpkg "github.com/sarchitt/shellhub/internal/ssh"
	"github.com/sarchitt/shellhub/internal/terminal"
	"github.com/sarchitt/shellhub/internal/tray"
)

//go:embed all:frontend/dist
var frontendFS embed.FS

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// runServer starts the HTTP server. It blocks until the server stops or
// returns an error. This is called directly in dev mode, or from inside
// a goroutine when running with the system tray.
func runServer(port int, dbPath string, dev bool) error {
	store, err := config.NewStore(dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	defer store.Close()

	// Auto-import from YAML if present (look next to the DB file)
	yamlPath := filepath.Join(filepath.Dir(dbPath), "servers.yaml")
	if n, importErr := config.ImportFromYAML(store, yamlPath); importErr != nil {
		log.Printf("Warning: failed to import from %s: %v", yamlPath, importErr)
	} else if n > 0 {
		log.Printf("Imported %d servers from %s", n, yamlPath)
	}

	// Initialize auth store
	authStore, err := auth.NewAuthStore(store.DB())
	if err != nil {
		return fmt.Errorf("failed to initialize auth: %w", err)
	}

	sshClient := sshpkg.NewClient()
	apiHandler := api.NewHandler(store, sshClient, sshClient, authStore)
	authHandler := api.NewAuthHandler(authStore)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	// Auth routes (no auth required)
	authHandler.RegisterRoutes(mux)

	apiHandler.RegisterRoutes(mux)

	termHandler := terminal.NewHandlerWithAuth(store, sshClient, authStore)
	mux.Handle("/api/terminal/{id}", termHandler)

	// Serve embedded frontend (production mode)
	if !dev {
		dist, err := fs.Sub(frontendFS, "frontend/dist")
		if err != nil {
			return fmt.Errorf("failed to access embedded frontend: %w", err)
		}
		fileServer := http.FileServer(http.FS(dist))

		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}
			// Try to open the file in the embedded FS
			if f, err := dist.Open(path); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
			// SPA fallback: serve index.html for any unmatched path
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
		})
	}

	addr := fmt.Sprintf(":%d", port)
	log.Printf("ShellHub server listening on %s", addr)

	// Wrap the mux with auth middleware
	handler := cors(authStore.SetupOrAuthMiddleware(mux))
	return http.ListenAndServe(addr, handler)
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	cmd.Run()
}

func main() {
	port := flag.Int("port", 8080, "server port")
	dbFlag := flag.String("db", "shellhub.db", "database file path")
	dev := flag.Bool("dev", false, "development mode (console, no tray)")
	flag.Parse()

	if *dev {
		fmt.Println()
		fmt.Println("  ShellHub is running! (dev mode)")
		fmt.Println()
		fmt.Printf("  Open in browser:  http://localhost:%d\n", *port)
		fmt.Printf("  Database:         %s\n", *dbFlag)
		fmt.Println()
		fmt.Println("  Press Ctrl+C to stop.")
		fmt.Println()

		if err := runServer(*port, *dbFlag, true); err != nil {
			log.Fatal(err)
		}
	} else {
		// Production: tray handles DB path resolution (saved settings or folder picker)
		tray.Run(*port, *dbFlag, runServer, openBrowser)
	}
}
