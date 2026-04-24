# ShellHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ShellHub — a web-based SSH client with Go backend and React frontend that supports server management, interactive terminal sessions, and quick command execution.

**Architecture:** Go backend on :8080 serves REST API (server CRUD, ping, exec), WebSocket terminal bridge (xterm.js ↔ SSH pty), and embedded React frontend. YAML file stores server configs. Single binary for production via go:embed.

**Tech Stack:** Go (net/http, gorilla/websocket, golang.org/x/crypto/ssh, gopkg.in/yaml.v3), React 19 (Vite, TypeScript, Tailwind CSS, xterm.js, React Router)

---

## Dependency Graph

```
Task 1 (Go scaffolding)
  └── Task 2 (Config layer)
        └── Task 3 (REST API)
              └── Task 4 (SSH client)
                    └── Task 5 (WebSocket terminal)

Task 6 (Frontend scaffolding)  [parallel with Tasks 2-5]
  └── Task 7 (API client + types)
        ├── Task 8 (Dashboard page)
        └── Task 9 (Terminal page)

Task 10 (Production build)  [depends on all previous tasks]
```

---

### Task 1: Go Project Scaffolding

**Files:**
- Create: `go.mod`
- Create: `main.go`
- Create: `internal/config/config.go` (placeholder)
- Create: `internal/ssh/ssh.go` (placeholder)
- Create: `internal/api/api.go` (placeholder)
- Create: `internal/terminal/terminal.go` (placeholder)
- Create: `.gitignore`
- Create: `servers.yaml`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Build
shellhub
shellhub.exe

# Frontend
frontend/node_modules/
frontend/dist/*
!frontend/dist/.gitkeep

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Env
.env
tmp/
```

- [ ] **Step 2: Create `go.mod`**

```bash
cd D:/Code_Personal/shellhub && go mod init github.com/sarchitt/shellhub
```

- [ ] **Step 3: Create placeholder packages**

Create each file with only the package declaration:

`internal/config/config.go`: `package config`
`internal/ssh/ssh.go`: `package ssh`
`internal/api/api.go`: `package api`
`internal/terminal/terminal.go`: `package terminal`

- [ ] **Step 4: Create `main.go` with health endpoint and CORS**

```go
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
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
	flag.Parse()

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("ShellHub starting on %s", addr)
	return http.ListenAndServe(addr, cors(mux))
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 5: Create seed `servers.yaml`**

```yaml
servers:
  - name: "Production AEM"
    host: "10.0.1.50"
    port: 22
    username: "admin"
    password: "mypassword123"
    group: "Production"
    quick_commands:
      - name: "Flush Cache"
        command: "sudo /opt/aem/crx-quickstart/bin/flush-cache.sh"
        tag: "cache"
      - name: "Restart Apache"
        command: "sudo systemctl restart apache2"
        tag: "service"
      - name: "Restart AEM"
        command: "sudo systemctl restart aem"
        tag: "service"
```

- [ ] **Step 6: Verify build and health endpoint**

```bash
cd D:/Code_Personal/shellhub && go build -o shellhub.exe .
# Expected: no errors, produces shellhub.exe
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore go.mod main.go servers.yaml internal/
git commit -m "feat: scaffold Go project with module, directory structure, and health endpoint"
```

---

### Task 2: Config Layer (YAML Model, Read/Write, Tests)

**Files:**
- Create: `internal/config/config.go`
- Create: `internal/config/config_test.go`

- [ ] **Step 1: Write config tests**

```go
package config

import (
	"os"
	"path/filepath"
	"testing"
)

func tempStore(t *testing.T) *Store {
	t.Helper()
	return NewStore(filepath.Join(t.TempDir(), "servers.yaml"))
}

func tempStoreWithData(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "servers.yaml")
	data := `servers:
  - name: "Server A"
    host: "10.0.0.1"
    port: 22
    username: "admin"
    password: "pass"
    group: "Production"
    quick_commands:
      - name: "Deploy"
        command: "deploy.sh"
        tag: "deploy"
`
	os.WriteFile(path, []byte(data), 0644)
	return NewStore(path)
}

func TestLoad_NonexistentFile(t *testing.T) {
	s := tempStore(t)
	cfg, err := s.Load()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(cfg.Servers) != 0 {
		t.Fatalf("expected 0 servers, got %d", len(cfg.Servers))
	}
}

func TestLoad_ValidYAML(t *testing.T) {
	s := tempStoreWithData(t)
	cfg, err := s.Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cfg.Servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(cfg.Servers))
	}
	srv := cfg.Servers[0]
	if srv.Name != "Server A" || srv.Host != "10.0.0.1" || srv.Port != 22 {
		t.Fatalf("unexpected server data: %+v", srv)
	}
	if len(srv.QuickCommands) != 1 || srv.QuickCommands[0].Name != "Deploy" {
		t.Fatalf("unexpected quick commands: %+v", srv.QuickCommands)
	}
}

func TestSave_RoundTrip(t *testing.T) {
	s := tempStore(t)
	cfg := &Config{Servers: []Server{{Name: "Test", Host: "1.2.3.4", Port: 22, Username: "u", Password: "p", Group: "Dev"}}}
	if err := s.Save(cfg); err != nil {
		t.Fatalf("save error: %v", err)
	}
	loaded, err := s.Load()
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	if len(loaded.Servers) != 1 || loaded.Servers[0].Name != "Test" {
		t.Fatalf("round-trip failed: %+v", loaded)
	}
}

func TestAddServer(t *testing.T) {
	s := tempStoreWithData(t)
	id, err := s.AddServer(Server{Name: "New", Host: "2.3.4.5", Username: "root", Password: "pw", Group: "Staging"})
	if err != nil {
		t.Fatalf("add error: %v", err)
	}
	if id != 1 {
		t.Fatalf("expected id 1, got %d", id)
	}
	srv, err := s.GetServer(1)
	if err != nil {
		t.Fatalf("get error: %v", err)
	}
	if srv.Name != "New" || srv.Port != 22 {
		t.Fatalf("unexpected server: %+v", srv)
	}
}

func TestAddServer_DefaultPort(t *testing.T) {
	s := tempStore(t)
	_, err := s.AddServer(Server{Name: "NoPort", Host: "1.1.1.1", Username: "u", Password: "p"})
	if err != nil {
		t.Fatalf("add error: %v", err)
	}
	srv, _ := s.GetServer(0)
	if srv.Port != 22 {
		t.Fatalf("expected default port 22, got %d", srv.Port)
	}
}

func TestGetServer_OutOfBounds(t *testing.T) {
	s := tempStore(t)
	_, err := s.GetServer(0)
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	_, err = s.GetServer(-1)
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for -1, got %v", err)
	}
}

func TestUpdateServer(t *testing.T) {
	s := tempStoreWithData(t)
	err := s.UpdateServer(0, Server{Name: "Updated", Host: "9.9.9.9", Port: 2222, Username: "new", Password: "new", Group: "Dev"})
	if err != nil {
		t.Fatalf("update error: %v", err)
	}
	srv, _ := s.GetServer(0)
	if srv.Name != "Updated" || srv.Port != 2222 {
		t.Fatalf("update failed: %+v", srv)
	}
}

func TestUpdateServer_OutOfBounds(t *testing.T) {
	s := tempStore(t)
	err := s.UpdateServer(0, Server{Name: "X"})
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteServer(t *testing.T) {
	s := tempStoreWithData(t)
	s.AddServer(Server{Name: "B", Host: "2.2.2.2", Port: 22, Username: "u", Password: "p", Group: "Dev"})
	err := s.DeleteServer(0)
	if err != nil {
		t.Fatalf("delete error: %v", err)
	}
	servers, _ := s.GetServers()
	if len(servers) != 1 || servers[0].Name != "B" {
		t.Fatalf("delete failed, remaining: %+v", servers)
	}
}

func TestDeleteServer_OutOfBounds(t *testing.T) {
	s := tempStore(t)
	err := s.DeleteServer(0)
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
go test ./internal/config/ -v -count=1
# Expected: compilation errors (types not defined yet)
```

- [ ] **Step 3: Implement `internal/config/config.go`**

```go
package config

import (
	"errors"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

var ErrNotFound = errors.New("server not found")

type QuickCommand struct {
	Name    string `yaml:"name"    json:"name"`
	Command string `yaml:"command" json:"command"`
	Tag     string `yaml:"tag"     json:"tag"`
}

type Server struct {
	Name          string         `yaml:"name"           json:"name"`
	Host          string         `yaml:"host"           json:"host"`
	Port          int            `yaml:"port"           json:"port"`
	Username      string         `yaml:"username"       json:"username"`
	Password      string         `yaml:"password"       json:"password"`
	Group         string         `yaml:"group"          json:"group"`
	QuickCommands []QuickCommand `yaml:"quick_commands" json:"quick_commands"`
}

type Config struct {
	Servers []Server `yaml:"servers" json:"servers"`
}

type Store struct {
	path string
	mu   sync.Mutex
}

func NewStore(path string) *Store {
	return &Store{path: path}
}

func (s *Store) Load() (*Config, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadUnsafe()
}

func (s *Store) loadUnsafe() (*Config, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{}, nil
		}
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (s *Store) Save(cfg *Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveUnsafe(cfg)
}

func (s *Store) saveUnsafe(cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	dir := filepath.Dir(s.path)
	tmp, err := os.CreateTemp(dir, "servers-*.yaml")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	tmp.Close()
	return os.Rename(tmpPath, s.path)
}

func (s *Store) GetServers() ([]Server, error) {
	cfg, err := s.Load()
	if err != nil {
		return nil, err
	}
	return cfg.Servers, nil
}

func (s *Store) GetServer(id int) (*Server, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, err := s.loadUnsafe()
	if err != nil {
		return nil, err
	}
	if id < 0 || id >= len(cfg.Servers) {
		return nil, ErrNotFound
	}
	return &cfg.Servers[id], nil
}

func (s *Store) AddServer(srv Server) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, err := s.loadUnsafe()
	if err != nil {
		return 0, err
	}
	if srv.Port == 0 {
		srv.Port = 22
	}
	cfg.Servers = append(cfg.Servers, srv)
	if err := s.saveUnsafe(cfg); err != nil {
		return 0, err
	}
	return len(cfg.Servers) - 1, nil
}

func (s *Store) UpdateServer(id int, srv Server) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, err := s.loadUnsafe()
	if err != nil {
		return err
	}
	if id < 0 || id >= len(cfg.Servers) {
		return ErrNotFound
	}
	cfg.Servers[id] = srv
	return s.saveUnsafe(cfg)
}

func (s *Store) DeleteServer(id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, err := s.loadUnsafe()
	if err != nil {
		return err
	}
	if id < 0 || id >= len(cfg.Servers) {
		return ErrNotFound
	}
	cfg.Servers = append(cfg.Servers[:id], cfg.Servers[id+1:]...)
	return s.saveUnsafe(cfg)
}
```

- [ ] **Step 4: Add yaml.v3 dependency and run tests**

```bash
cd D:/Code_Personal/shellhub && go get gopkg.in/yaml.v3 && go test ./internal/config/ -v -count=1
# Expected: all 10 tests pass
```

- [ ] **Step 5: Commit**

```bash
git add internal/config/ go.mod go.sum
git commit -m "feat: implement YAML config store with Server CRUD and full test coverage"
```

---

### Task 3: REST API Handlers

**Files:**
- Create: `internal/api/api.go`
- Create: `internal/api/api_test.go`
- Modify: `main.go`

- [ ] **Step 1: Write API tests**

```go
package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/sarchitt/shellhub/internal/config"
)

type mockPinger struct{ online bool }

func (m *mockPinger) Ping(host string, port int, timeout time.Duration) (bool, error) {
	return m.online, nil
}

type mockExecutor struct {
	output   string
	exitCode int
}

func (m *mockExecutor) Execute(srv config.Server, cmd string) (string, int, error) {
	return m.output, m.exitCode, nil
}

func setupHandler(t *testing.T) (*Handler, *http.ServeMux) {
	t.Helper()
	store := config.NewStore(filepath.Join(t.TempDir(), "servers.yaml"))
	h := NewHandler(store, &mockPinger{online: true}, &mockExecutor{output: "hello\n", exitCode: 0})
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)
	return h, mux
}

func TestListServers_Empty(t *testing.T) {
	_, mux := setupHandler(t)
	req := httptest.NewRequest("GET", "/api/servers", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var servers []json.RawMessage
	json.Unmarshal(rec.Body.Bytes(), &servers)
	if len(servers) != 0 {
		t.Fatalf("expected empty list, got %d", len(servers))
	}
}

func TestCreateAndListServer(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"name":"Test","host":"1.2.3.4","port":22,"username":"root","password":"pw","group":"Dev","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 201 {
		t.Fatalf("create: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest("GET", "/api/servers", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var servers []ServerResponse
	json.Unmarshal(rec.Body.Bytes(), &servers)
	if len(servers) != 1 || servers[0].ID != 0 || servers[0].Name != "Test" {
		t.Fatalf("unexpected servers: %+v", servers)
	}
}

func TestUpdateServer(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	update := `{"name":"Updated","host":"2.2.2.2","port":2222,"username":"u2","password":"p2","group":"G2","quick_commands":[]}`
	req = httptest.NewRequest("PUT", "/api/servers/0", bytes.NewBufferString(update))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("update: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestUpdateServer_NotFound(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"name":"X"}`
	req := httptest.NewRequest("PUT", "/api/servers/99", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 404 {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestDeleteServer(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	req = httptest.NewRequest("DELETE", "/api/servers/0", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 204 {
		t.Fatalf("delete: expected 204, got %d", rec.Code)
	}
}

func TestPingServer(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	req = httptest.NewRequest("POST", "/api/servers/0/ping", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("ping: expected 200, got %d", rec.Code)
	}
	var result map[string]bool
	json.Unmarshal(rec.Body.Bytes(), &result)
	if !result["online"] {
		t.Fatalf("expected online=true")
	}
}

func TestExecCommand(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	execBody := `{"command":"echo hello"}`
	req = httptest.NewRequest("POST", "/api/servers/0/exec", bytes.NewBufferString(execBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("exec: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var result map[string]any
	json.Unmarshal(rec.Body.Bytes(), &result)
	if result["output"] != "hello\n" {
		t.Fatalf("unexpected output: %v", result["output"])
	}
}
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
go test ./internal/api/ -v -count=1
# Expected: compilation errors
```

- [ ] **Step 3: Implement `internal/api/api.go`**

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/sarchitt/shellhub/internal/config"
)

type Pinger interface {
	Ping(host string, port int, timeout time.Duration) (bool, error)
}

type Executor interface {
	Execute(server config.Server, command string) (string, int, error)
}

type ServerResponse struct {
	ID int `json:"id"`
	config.Server
}

type Handler struct {
	store    *config.Store
	pinger   Pinger
	executor Executor
}

func NewHandler(store *config.Store, pinger Pinger, executor Executor) *Handler {
	return &Handler{store: store, pinger: pinger, executor: executor}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/servers", h.listServers)
	mux.HandleFunc("POST /api/servers", h.createServer)
	mux.HandleFunc("PUT /api/servers/{id}", h.updateServer)
	mux.HandleFunc("DELETE /api/servers/{id}", h.deleteServer)
	mux.HandleFunc("POST /api/servers/{id}/ping", h.pingServer)
	mux.HandleFunc("POST /api/servers/{id}/exec", h.execCommand)
}

func (h *Handler) listServers(w http.ResponseWriter, r *http.Request) {
	servers, err := h.store.GetServers()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	resp := make([]ServerResponse, len(servers))
	for i, s := range servers {
		resp[i] = ServerResponse{ID: i, Server: s}
	}
	writeJSON(w, 200, resp)
}

func (h *Handler) createServer(w http.ResponseWriter, r *http.Request) {
	var srv config.Server
	if err := readJSON(r, &srv); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	id, err := h.store.AddServer(srv)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	created, _ := h.store.GetServer(id)
	writeJSON(w, 201, ServerResponse{ID: id, Server: *created})
}

func (h *Handler) updateServer(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	var srv config.Server
	if err := readJSON(r, &srv); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err := h.store.UpdateServer(id, srv); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	updated, _ := h.store.GetServer(id)
	writeJSON(w, 200, ServerResponse{ID: id, Server: *updated})
}

func (h *Handler) deleteServer(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	if err := h.store.DeleteServer(id); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) pingServer(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	srv, err := h.store.GetServer(id)
	if err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	online, _ := h.pinger.Ping(srv.Host, srv.Port, 5*time.Second)
	writeJSON(w, 200, map[string]bool{"online": online})
}

func (h *Handler) execCommand(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	srv, err := h.store.GetServer(id)
	if err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	var body struct {
		Command string `json:"command"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	output, exitCode, err := h.executor.Execute(*srv, body.Command)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"output": output, "exit_code": exitCode})
}

func parseID(r *http.Request) (int, error) {
	return strconv.Atoi(r.PathValue("id"))
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func readJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	return dec.Decode(dst)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
go test ./internal/api/ -v -count=1
# Expected: all 7 tests pass
```

- [ ] **Step 5: Wire API routes into `main.go`**

Update the `run()` function in `main.go` to create the `config.Store` and `api.Handler`, and register routes. Pass nil for pinger/executor temporarily (they'll be replaced in Task 4).

- [ ] **Step 6: Commit**

```bash
git add internal/api/ main.go
git commit -m "feat: implement REST API handlers for server CRUD, ping, and exec"
```

---

### Task 4: SSH Client Wrapper

**Files:**
- Create: `internal/ssh/client.go`
- Create: `internal/ssh/session.go`
- Modify: `main.go`

- [ ] **Step 1: Implement `internal/ssh/client.go`**

```go
package ssh

import (
	"fmt"
	"net"
	"time"

	"github.com/sarchitt/shellhub/internal/config"
	gossh "golang.org/x/crypto/ssh"
)

type Client struct{}

func NewClient() *Client {
	return &Client{}
}

func (c *Client) Ping(host string, port int, timeout time.Duration) (bool, error) {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", host, port), timeout)
	if err != nil {
		return false, nil
	}
	conn.Close()
	return true, nil
}

func (c *Client) Execute(server config.Server, command string) (string, int, error) {
	client, err := c.Connect(server)
	if err != nil {
		return "", -1, err
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return "", -1, err
	}
	defer session.Close()

	output, err := session.CombinedOutput(command)
	if err != nil {
		if exitErr, ok := err.(*gossh.ExitError); ok {
			return string(output), exitErr.ExitStatus(), nil
		}
		return string(output), -1, err
	}
	return string(output), 0, nil
}

func (c *Client) Connect(server config.Server) (*gossh.Client, error) {
	cfg := &gossh.ClientConfig{
		User: server.Username,
		Auth: []gossh.AuthMethod{
			gossh.Password(server.Password),
		},
		HostKeyCallback: gossh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	addr := fmt.Sprintf("%s:%d", server.Host, server.Port)
	return gossh.Dial("tcp", addr, cfg)
}
```

- [ ] **Step 2: Implement `internal/ssh/session.go`**

```go
package ssh

import (
	"io"

	gossh "golang.org/x/crypto/ssh"
)

type Session struct {
	client  *gossh.Client
	session *gossh.Session
	stdin   io.WriteCloser
	stdout  io.Reader
}

func NewSession(client *gossh.Client) (*Session, error) {
	sess, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		sess.Close()
		return nil, err
	}
	stdout, err := sess.StdoutPipe()
	if err != nil {
		sess.Close()
		return nil, err
	}
	return &Session{
		client:  client,
		session: sess,
		stdin:   stdin,
		stdout:  stdout,
	}, nil
}

func (s *Session) RequestPty(cols, rows int) error {
	modes := gossh.TerminalModes{
		gossh.ECHO:          1,
		gossh.TTY_OP_ISPEED: 14400,
		gossh.TTY_OP_OSPEED: 14400,
	}
	return s.session.RequestPty("xterm-256color", rows, cols, modes)
}

func (s *Session) StartShell() error {
	return s.session.Shell()
}

func (s *Session) Resize(cols, rows int) error {
	return s.session.WindowChange(rows, cols)
}

func (s *Session) Write(p []byte) (int, error) {
	return s.stdin.Write(p)
}

func (s *Session) Read(p []byte) (int, error) {
	return s.stdout.Read(p)
}

func (s *Session) Close() error {
	if s.stdin != nil {
		s.stdin.Close()
	}
	if s.session != nil {
		s.session.Close()
	}
	if s.client != nil {
		s.client.Close()
	}
	return nil
}
```

- [ ] **Step 3: Add dependencies, wire into main.go**

```bash
go get github.com/gorilla/websocket golang.org/x/crypto/ssh
```

Update `main.go` to use `ssh.NewClient()` as both the `Pinger` and `Executor` for the API handler.

- [ ] **Step 4: Verify build**

```bash
go build ./...
# Expected: no errors
```

- [ ] **Step 5: Commit**

```bash
git add internal/ssh/ main.go go.mod go.sum
git commit -m "feat: implement SSH client with ping, command execution, and interactive session support"
```

---

### Task 5: WebSocket Terminal Handler

**Files:**
- Create: `internal/terminal/terminal.go`
- Modify: `main.go`

- [ ] **Step 1: Implement `internal/terminal/terminal.go`**

```go
package terminal

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/sarchitt/shellhub/internal/config"
	sshpkg "github.com/sarchitt/shellhub/internal/ssh"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type resizeMessage struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

type Handler struct {
	store     *config.Store
	sshClient *sshpkg.Client
}

func NewHandler(store *config.Store, sshClient *sshpkg.Client) *Handler {
	return &Handler{store: store, sshClient: sshClient}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, 400)
		return
	}

	srv, err := h.store.GetServer(id)
	if err != nil {
		http.Error(w, `{"error":"server not found"}`, 404)
		return
	}

	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}
	defer wsConn.Close()

	sshClient, err := h.sshClient.Connect(*srv)
	if err != nil {
		wsConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "SSH connection failed: "+err.Error()))
		return
	}

	session, err := sshpkg.NewSession(sshClient)
	if err != nil {
		sshClient.Close()
		wsConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "SSH session failed: "+err.Error()))
		return
	}
	defer session.Close()

	if err := session.RequestPty(80, 24); err != nil {
		return
	}
	if err := session.StartShell(); err != nil {
		return
	}

	var once sync.Once
	done := make(chan struct{})
	closeDone := func() { once.Do(func() { close(done) }) }

	// SSH stdout → WebSocket
	go func() {
		defer closeDone()
		buf := make([]byte, 8192)
		for {
			n, err := session.Read(buf)
			if n > 0 {
				if writeErr := wsConn.WriteMessage(websocket.BinaryMessage, buf[:n]); writeErr != nil {
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					log.Printf("ssh read error: %v", err)
				}
				return
			}
		}
	}()

	// WebSocket → SSH stdin
	go func() {
		defer closeDone()
		for {
			msgType, msg, err := wsConn.ReadMessage()
			if err != nil {
				return
			}
			if msgType == websocket.TextMessage {
				var resize resizeMessage
				if json.Unmarshal(msg, &resize) == nil && resize.Type == "resize" && resize.Cols > 0 && resize.Rows > 0 {
					session.Resize(resize.Cols, resize.Rows)
					continue
				}
			}
			session.Write(msg)
		}
	}()

	<-done
}
```

- [ ] **Step 2: Wire terminal handler into `main.go`**

Add to `run()`:

```go
termHandler := terminal.NewHandler(store, sshClient)
mux.Handle("/api/terminal/{id}", termHandler)
```

- [ ] **Step 3: Verify build**

```bash
go build ./...
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add internal/terminal/ main.go
git commit -m "feat: implement WebSocket terminal handler bridging xterm.js to SSH pty"
```

---

### Task 6: Frontend Scaffolding

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/src/pages/Dashboard.tsx` (placeholder)
- Create: `frontend/src/pages/Terminal.tsx` (placeholder)
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/dist/.gitkeep`

- [ ] **Step 1: Initialize frontend with Vite**

```bash
cd D:/Code_Personal/shellhub && mkdir -p frontend/dist && touch frontend/dist/.gitkeep
cd frontend && npm create vite@latest . -- --template react-ts
```

Note: If Vite prompts about existing files, allow overwrite. Then overwrite the generated files with our config.

- [ ] **Step 2: Install dependencies**

```bash
cd D:/Code_Personal/shellhub/frontend
npm install react-router-dom @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: Configure `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 4: Configure `tailwind.config.js` with custom design tokens**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 900: '#06090f', 800: '#0b1120', 700: '#111827', 600: '#1a2332', 500: '#1e2d3f' },
        border: { DEFAULT: '#1c2a3a', medium: '#253345' },
        accent: {
          green: '#22c55e', 'green-dim': '#064e3b', 'green-bg': '#052e16',
          red: '#ef4444', 'red-dim': '#7f1d1d', 'red-bg': '#450a0a',
          amber: '#f59e0b', 'amber-dim': '#451a03', 'amber-bg': '#271704',
          blue: '#3b82f6', 'blue-dim': '#1d3f7a',
        },
        text: { primary: '#e8edf5', secondary: '#8b97a8', muted: '#4f5d6e', dimmed: '#2d3848' },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 15px rgba(34, 197, 94, 0.25)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.25)',
        'glow-amber': '0 0 15px rgba(245, 158, 11, 0.25)',
        'glow-blue': '0 0 15px rgba(59, 130, 246, 0.25)',
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 5: Configure `index.html` with fonts**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ShellHub</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body class="bg-surface-900 text-text-primary font-sans">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: Write `src/index.css` with Tailwind directives and animations**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * { scrollbar-width: thin; scrollbar-color: #253345 #0b1120; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0b1120; }
  ::-webkit-scrollbar-thumb { background: #253345; border-radius: 3px; }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 currentColor; }
  50% { opacity: 0.4; box-shadow: 0 0 0 4px transparent; }
}
.animate-pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }

@keyframes progress-slide {
  0% { transform: scaleX(0); transform-origin: left; }
  50% { transform: scaleX(1); transform-origin: left; }
  50.1% { transform: scaleX(1); transform-origin: right; }
  100% { transform: scaleX(0); transform-origin: right; }
}
.animate-progress { animation: progress-slide 1.5s ease-in-out infinite; }
```

- [ ] **Step 7: Write `src/App.tsx` with routes and `src/lib/utils.ts`**

`src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Terminal from './pages/Terminal'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/terminal/:id" element={<Terminal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

`src/lib/utils.ts`:
```typescript
export function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}
```

Placeholder pages return a simple `<div>` with the page name.

- [ ] **Step 8: Verify dev server starts**

```bash
cd D:/Code_Personal/shellhub/frontend && npm run dev
# Expected: Vite starts on :5173, page renders
```

- [ ] **Step 9: Commit**

```bash
cd D:/Code_Personal/shellhub && git add frontend/ .gitignore
git commit -m "feat: scaffold React frontend with Vite, Tailwind, React Router, and design system"
```

---

### Task 7: Frontend API Client + Types

**Files:**
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/ws.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```typescript
export interface QuickCommand {
  name: string
  command: string
  tag: string
}

export interface Server {
  id: number
  name: string
  host: string
  port: number
  username: string
  password: string
  group: string
  quick_commands: QuickCommand[]
}

export type ServerInput = Omit<Server, 'id'>

export interface PingResult {
  online: boolean
}

export interface ExecResult {
  output: string
  exit_code: number
}
```

- [ ] **Step 2: Create `src/lib/api.ts`**

```typescript
import type { Server, ServerInput, PingResult, ExecResult } from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const getServers = () => request<Server[]>('/servers')

export const createServer = (s: ServerInput) =>
  request<Server>('/servers', { method: 'POST', body: JSON.stringify(s) })

export const updateServer = (id: number, s: ServerInput) =>
  request<Server>(`/servers/${id}`, { method: 'PUT', body: JSON.stringify(s) })

export const deleteServer = (id: number) =>
  request<void>(`/servers/${id}`, { method: 'DELETE' })

export const pingServer = (id: number) =>
  request<PingResult>(`/servers/${id}/ping`, { method: 'POST' })

export const execCommand = (id: number, command: string) =>
  request<ExecResult>(`/servers/${id}/exec`, {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
```

- [ ] **Step 3: Create `src/lib/ws.ts`**

```typescript
export function createTerminalSocket(serverId: number): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${window.location.host}/api/terminal/${serverId}`
  return new WebSocket(url)
}

export function sendResize(ws: WebSocket, cols: number, rows: number) {
  ws.send(JSON.stringify({ type: 'resize', cols, rows }))
}
```

- [ ] **Step 4: Type-check**

```bash
cd D:/Code_Personal/shellhub/frontend && npx tsc --noEmit
# Expected: no type errors
```

- [ ] **Step 5: Commit**

```bash
cd D:/Code_Personal/shellhub && git add frontend/src/lib/
git commit -m "feat: add TypeScript types, REST API client, and WebSocket helpers"
```

---

### Task 8: Frontend Dashboard Page

**Files:**
- Create: `frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/ServerDetail.tsx`
- Create: `frontend/src/components/CommandCard.tsx`
- Create: `frontend/src/components/ExecModal.tsx`
- Create: `frontend/src/components/AddEditServerModal.tsx`
- Create: `frontend/src/components/StatusDot.tsx`

This is the largest task. Each component should be created individually, then wired together in Dashboard.tsx.

- [ ] **Step 1: Create `StatusDot.tsx`**

A reusable status indicator. Props: `online: boolean`, optional `size` ('sm' | 'md'). Green with glow when online, red with glow when offline.

- [ ] **Step 2: Create `Sidebar.tsx`**

Props: `servers`, `selectedId`, `onlineMap`, `onSelect`, `onAdd`. Groups servers by `group`, renders search filter, dims non-selected items when `selectedId !== null`, shows status dots.

- [ ] **Step 3: Create `CommandCard.tsx`**

Props: `command: QuickCommand`, `serverId: number`, `onExecComplete`. Shows command name, preview, tag, run button. Handles running/done/failed states with color transitions.

- [ ] **Step 4: Create `ExecModal.tsx`**

Props: `result`, `command`, `onClose`, `onRerun`. Modal overlay with command output in pre-formatted block, exit status icon, copy/re-run/close buttons.

- [ ] **Step 5: Create `AddEditServerModal.tsx`**

Props: `server` (null for add mode), `onSave`, `onClose`. Form with all server fields + dynamic quick commands list with add/remove.

- [ ] **Step 6: Create `ServerDetail.tsx`**

Props: `server`, `online`, `onEdit`, `onDelete`, `onOpenTerminal`. Shows info grid, quick commands grid, activity section, action buttons.

- [ ] **Step 7: Wire everything in `Dashboard.tsx`**

Load servers on mount, ping all concurrently, manage selected server state, render Sidebar + ServerDetail, handle add/edit/delete flows.

- [ ] **Step 8: Type-check and visual test**

```bash
cd D:/Code_Personal/shellhub/frontend && npx tsc --noEmit && npm run dev
# Expected: no errors, dashboard renders with sidebar + detail panel
# Test: click servers, run commands, add/edit/delete servers
```

- [ ] **Step 9: Commit**

```bash
cd D:/Code_Personal/shellhub && git add frontend/src/
git commit -m "feat: build Dashboard page with Sidebar, ServerDetail, CommandCard, and modals"
```

---

### Task 9: Frontend Terminal Page

**Files:**
- Create: `frontend/src/pages/Terminal.tsx`
- Create: `frontend/src/components/CommandPanel.tsx`
- Create: `frontend/src/components/ConnectionBar.tsx`

- [ ] **Step 1: Create `ConnectionBar.tsx`**

Props: `server`, `connected`, `elapsed`, `onDisconnect`, `onBack`. Shows back button, connected/disconnected badge with pulsing dot, server info, session timer (HH:MM:SS), disconnect button.

- [ ] **Step 2: Create `CommandPanel.tsx`**

Props: `server`, `onPasteToTerminal`, `onClose`. Lists quick commands with "Paste to Terminal" and "Run Now" buttons. Shows last execution output preview.

- [ ] **Step 3: Create `Terminal.tsx`**

Full terminal page: no sidebar, full-width layout. Manages xterm.js instance, WebSocket lifecycle, session timer. Connection bar at top, terminal filling main area, command panel on right (collapsible). Handles resize, cleanup on unmount.

Key details:
- `useParams()` to get server ID
- xterm.js theme matching the design system colors
- `ws.binaryType = 'arraybuffer'`
- `term.onData` sends keystrokes via WebSocket
- `term.onResize` sends resize JSON messages
- FitAddon re-fits on window resize and panel toggle
- Cleanup: close WebSocket, dispose terminal, clear timer interval

- [ ] **Step 4: Type-check and test**

```bash
cd D:/Code_Personal/shellhub/frontend && npx tsc --noEmit && npm run dev
# With Go backend running:
# Navigate to /terminal/0
# Expected: terminal connects, shell prompt appears, interactive commands work
# Test: toggle command panel, paste command, resize window
```

- [ ] **Step 5: Commit**

```bash
cd D:/Code_Personal/shellhub && git add frontend/src/
git commit -m "feat: build Terminal page with xterm.js, WebSocket bridge, and command panel"
```

---

### Task 10: Production Build (go:embed, Single Binary)

**Files:**
- Modify: `main.go` (add embed directive, frontend handler, -dev flag)
- Create: `Makefile`
- Create: `frontend/dist/.gitkeep` (already exists from Task 6)

- [ ] **Step 1: Update `main.go` with embed and SPA fallback**

Add at package level:

```go
//go:embed all:frontend/dist
var frontendFS embed.FS
```

Add `-dev` flag. When not in dev mode, register a catch-all handler that serves from the embedded FS with SPA fallback (any path not matching a real file serves `index.html`).

- [ ] **Step 2: Create `Makefile`**

```makefile
.PHONY: dev build clean

dev:
	@echo "Run in two terminals:"
	@echo "  1: go run . -dev"
	@echo "  2: cd frontend && npm run dev"

build: frontend-build
	go build -o shellhub.exe .

frontend-build:
	cd frontend && npm ci && npm run build

clean:
	rm -f shellhub.exe shellhub
	rm -rf frontend/dist
	mkdir -p frontend/dist && touch frontend/dist/.gitkeep
```

- [ ] **Step 3: Build and test production binary**

```bash
cd D:/Code_Personal/shellhub && make build
./shellhub.exe
# Open http://localhost:8080 in browser
# Expected: React app loads, full functionality works (dashboard, terminal, commands)
```

- [ ] **Step 4: Commit**

```bash
git add main.go Makefile frontend/dist/.gitkeep
git commit -m "feat: integrate go:embed for single-binary production build with Makefile"
```

---

## Key Architectural Decisions

1. **Server IDs are array indices** — simple, per spec. Frontend re-fetches full list after mutations.
2. **No authentication** — personal tool per spec.
3. **`ssh.InsecureIgnoreHostKey()`** — acceptable for personal/internal use.
4. **Mutex-based YAML store** — simple, correct for single-user tool.
5. **WebSocket message type distinction** — binary = keystrokes/output, text JSON = resize control.
6. **go:embed with SPA fallback** — serves React Router paths correctly.
7. **`@xterm/xterm` v5+ scoped packages** — current xterm.js package names.
