package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"

	"github.com/sarchitt/shellhub/internal/api"
	"github.com/sarchitt/shellhub/internal/config"
)

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func run() error {
	port := flag.Int("port", 8080, "server port")
	configPath := flag.String("config", "servers.yaml", "config file path")
	flag.Parse()

	store := config.NewStore(*configPath)
	apiHandler := api.NewHandler(store, nil, nil) // nil pinger/executor for now

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	apiHandler.RegisterRoutes(mux)

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("ShellHub starting on %s", addr)
	return http.ListenAndServe(addr, cors(mux))
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
