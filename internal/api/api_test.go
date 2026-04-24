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
