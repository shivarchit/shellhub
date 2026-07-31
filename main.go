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
	"strconv"
	"strings"
	"time"

	"github.com/shivarchit/shellhub/internal/api"
	"github.com/shivarchit/shellhub/internal/auth"
	"github.com/shivarchit/shellhub/internal/config"
	"github.com/shivarchit/shellhub/internal/settings"
	sshpkg "github.com/shivarchit/shellhub/internal/ssh"
	"github.com/shivarchit/shellhub/internal/terminal"
	"github.com/shivarchit/shellhub/internal/tray"
)

//go:embed all:frontend/dist
var frontendFS embed.FS

// version is injected at build time via -ldflags "-X main.version=...".
var version = "dev"

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

	authStore.LoadEncryptionKey()

	if err := authStore.EnsureDefaultAdmin(); err != nil {
		log.Printf("Warning: could not seed default admin: %v", err)
	}

	sshClient := sshpkg.NewClient()
	apiHandler := api.NewHandler(store, sshClient, sshClient, authStore)
	authHandler := api.NewAuthHandler(authStore, store)

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

	// Startup banner. Console (dev) mode prints plainly; tray/background
	// mode goes through log so it lands in whatever log sink is attached.
	mode := "tray active"
	if dev {
		mode = "dev mode (no tray)"
	}
	servers, _ := store.GetServers()
	line1 := fmt.Sprintf("ShellHub %s — serving on http://localhost:%d", version, port)
	line2 := fmt.Sprintf("database: %s · %d servers loaded · %s", dbPath, len(servers), mode)
	if dev {
		fmt.Println(line1)
		fmt.Println(line2)
		fmt.Println("ready")
	} else {
		log.Println(line1)
		log.Println(line2)
		log.Println("ready")
	}

	// Background ping job for uptime metrics
	go func() {
		for {
			settings, _ := store.GetAllSettings()
			intervalMin := 30
			if v, ok := settings["ping_interval"]; ok {
				if n, err := strconv.Atoi(v); err == nil && n > 0 {
					intervalMin = n
				}
			}
			time.Sleep(time.Duration(intervalMin) * time.Minute)
			servers, _ := store.GetServers()
			for _, srv := range servers {
				start := time.Now()
				online, _ := sshClient.Ping(srv.Host, srv.Port, 5*time.Second)
				latencyMs := int(time.Since(start).Milliseconds())
				store.LogPing(srv.ID, online, latencyMs)
			}
		}
	}()

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
	port := flag.Int("port", settings.DefaultPort, "server port")
	dbFlag := flag.String("db", "shellhub.db", "database file path")
	dev := flag.Bool("dev", false, "development mode (console, no tray)")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("ShellHub %s\n", version)
		return
	}

	// Detect whether -port was explicitly passed (flag.Visit only visits set flags).
	// 0 = no override; any positive value (including DefaultPort) = explicit.
	portOverride := 0
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "port" {
			portOverride = *port
		}
	})

	if *dev {
		// Same port-resolution rules as the tray build: explicit flag >
		// saved setting > default, with auto-fallback only when no explicit
		// -port was given. An explicit busy port is a hard error.
		boundPort, err := settings.ResolvePort(portOverride)
		if err != nil {
			log.Fatalf("Cannot start server: %v", err)
		}

		if err := runServer(boundPort, *dbFlag, true); err != nil {
			log.Fatal(err)
		}
	} else {
		// Production: tray handles DB path resolution (saved settings or folder picker)
		tray.Run(portOverride, *dbFlag, runServer, openBrowser)
	}
}
