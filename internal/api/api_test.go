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
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := config.NewStore(dbPath)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	t.Cleanup(func() { store.Close() })
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
	var servers []config.Server
	json.Unmarshal(rec.Body.Bytes(), &servers)
	if len(servers) != 1 || servers[0].ID != 1 || servers[0].Name != "Test" {
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
	req = httptest.NewRequest("PUT", "/api/servers/1", bytes.NewBufferString(update))
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

	req = httptest.NewRequest("DELETE", "/api/servers/1", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 204 {
		t.Fatalf("delete: expected 204, got %d", rec.Code)
	}
}

func TestDeleteServer_IDsDoNotShift(t *testing.T) {
	_, mux := setupHandler(t)
	// Create two servers
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	body = `{"name":"B","host":"2.2.2.2","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req = httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Delete server 1
	req = httptest.NewRequest("DELETE", "/api/servers/1", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// List servers — remaining server should still have ID 2
	req = httptest.NewRequest("GET", "/api/servers", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var servers []config.Server
	json.Unmarshal(rec.Body.Bytes(), &servers)
	if len(servers) != 1 || servers[0].ID != 2 || servers[0].Name != "B" {
		t.Fatalf("expected server B with ID 2, got: %+v", servers)
	}
}

func TestPingHost(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"host":"1.1.1.1","port":22}`
	req := httptest.NewRequest("POST", "/api/ping", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var result map[string]bool
	json.Unmarshal(rec.Body.Bytes(), &result)
	// Mock pinger always returns true
	if !result["online"] {
		t.Fatal("expected online=true from mock")
	}
}

func TestPingServer(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	req = httptest.NewRequest("POST", "/api/servers/1/ping", nil)
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
	req = httptest.NewRequest("POST", "/api/servers/1/exec", bytes.NewBufferString(execBody))
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

func TestGetSettings_Empty(t *testing.T) {
	_, mux := setupHandler(t)
	req := httptest.NewRequest("GET", "/api/settings", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestUpdateAndGetSettings(t *testing.T) {
	_, mux := setupHandler(t)
	body := `{"ping_interval":"30"}`
	req := httptest.NewRequest("PUT", "/api/settings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("update: expected 200, got %d", rec.Code)
	}

	req = httptest.NewRequest("GET", "/api/settings", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var settings map[string]string
	json.Unmarshal(rec.Body.Bytes(), &settings)
	if settings["ping_interval"] != "30" {
		t.Fatalf("expected '30', got %q", settings["ping_interval"])
	}
}
