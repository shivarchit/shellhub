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

func TestGetConnectionHistory_Empty(t *testing.T) {
	_, mux := setupHandler(t)
	// Create a server
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	req = httptest.NewRequest("GET", "/api/servers/1/history", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var records []config.ConnectionRecord
	json.Unmarshal(rec.Body.Bytes(), &records)
	if len(records) != 0 {
		t.Fatalf("expected empty history, got %d", len(records))
	}
}

func TestGetConnectionHistory_WithRecords(t *testing.T) {
	h, mux := setupHandler(t)
	// Create a server
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Log a connection directly via store
	recordID, err := h.store.LogConnect(1)
	if err != nil {
		t.Fatalf("LogConnect error: %v", err)
	}
	h.store.LogDisconnect(recordID)

	req = httptest.NewRequest("GET", "/api/servers/1/history", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var records []config.ConnectionRecord
	json.Unmarshal(rec.Body.Bytes(), &records)
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	if records[0].ServerID != 1 {
		t.Fatalf("expected server_id 1, got %d", records[0].ServerID)
	}
	if records[0].DisconnectedAt == nil {
		t.Fatal("expected disconnected_at to be set")
	}
}

func TestGetConnectionHistory_InvalidID(t *testing.T) {
	_, mux := setupHandler(t)
	req := httptest.NewRequest("GET", "/api/servers/abc/history", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestExportData(t *testing.T) {
	_, mux := setupHandler(t)
	// Create a server first
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","auth_type":"password","private_key":"","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	req = httptest.NewRequest("GET", "/api/export", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var export map[string]any
	json.Unmarshal(rec.Body.Bytes(), &export)
	if export["version"] != float64(1) {
		t.Fatal("expected version 1")
	}
	servers := export["servers"].([]any)
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
}

func TestImportData_Merge(t *testing.T) {
	_, mux := setupHandler(t)
	importBody := `{"version":1,"servers":[{"name":"Imported","host":"2.2.2.2","port":22,"username":"u","password":"p","group":"G","auth_type":"password","private_key":"","quick_commands":[]}],"settings":{"ping_interval":"60"}}`
	req := httptest.NewRequest("POST", "/api/import?mode=merge", bytes.NewBufferString(importBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var result map[string]any
	json.Unmarshal(rec.Body.Bytes(), &result)
	if result["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", result["status"])
	}
	if result["imported"] != float64(1) {
		t.Fatalf("expected 1 imported, got %v", result["imported"])
	}
}

func TestImportData_Replace(t *testing.T) {
	_, mux := setupHandler(t)
	// Create an existing server
	body := `{"name":"Existing","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","auth_type":"password","private_key":"","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Import with replace mode
	importBody := `{"version":1,"servers":[{"name":"Replacement","host":"3.3.3.3","port":22,"username":"u","password":"p","group":"G","auth_type":"password","private_key":"","quick_commands":[]}],"settings":{}}`
	req = httptest.NewRequest("POST", "/api/import?mode=replace", bytes.NewBufferString(importBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	// Verify only the replacement server exists
	req = httptest.NewRequest("GET", "/api/servers", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var servers []config.Server
	json.Unmarshal(rec.Body.Bytes(), &servers)
	if len(servers) != 1 {
		t.Fatalf("expected 1 server after replace, got %d", len(servers))
	}
	if servers[0].Name != "Replacement" {
		t.Fatalf("expected Replacement server, got %s", servers[0].Name)
	}
}

func TestGetExecHistory_Empty(t *testing.T) {
	_, mux := setupHandler(t)
	// Create a server
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	req = httptest.NewRequest("GET", "/api/servers/1/exec-history", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var records []config.ExecRecord
	json.Unmarshal(rec.Body.Bytes(), &records)
	if len(records) != 0 {
		t.Fatalf("expected empty exec history, got %d", len(records))
	}
}

func TestGetExecHistory_AfterExec(t *testing.T) {
	_, mux := setupHandler(t)
	// Create a server
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Execute a command
	execBody := `{"command":"echo hello"}`
	req = httptest.NewRequest("POST", "/api/servers/1/exec", bytes.NewBufferString(execBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Check exec history
	req = httptest.NewRequest("GET", "/api/servers/1/exec-history", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var records []config.ExecRecord
	json.Unmarshal(rec.Body.Bytes(), &records)
	if len(records) != 1 {
		t.Fatalf("expected 1 exec record, got %d", len(records))
	}
	if records[0].CommandName != "echo hello" {
		t.Fatalf("expected command 'echo hello', got %q", records[0].CommandName)
	}
	if records[0].ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", records[0].ExitCode)
	}
}

func TestGetExecHistory_InvalidID(t *testing.T) {
	_, mux := setupHandler(t)
	req := httptest.NewRequest("GET", "/api/servers/abc/exec-history", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestGetAuditLog_Empty(t *testing.T) {
	_, mux := setupHandler(t)
	req := httptest.NewRequest("GET", "/api/audit-log", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var entries []config.AuditEntry
	json.Unmarshal(rec.Body.Bytes(), &entries)
	if len(entries) != 0 {
		t.Fatalf("expected empty audit log, got %d", len(entries))
	}
}

func TestGetAuditLog_AfterActions(t *testing.T) {
	_, mux := setupHandler(t)
	// Create a server (generates audit entry)
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Update the server (generates audit entry)
	update := `{"name":"Updated","host":"2.2.2.2","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req = httptest.NewRequest("PUT", "/api/servers/1", bytes.NewBufferString(update))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Check audit log
	req = httptest.NewRequest("GET", "/api/audit-log", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var entries []config.AuditEntry
	json.Unmarshal(rec.Body.Bytes(), &entries)
	if len(entries) != 2 {
		t.Fatalf("expected 2 audit entries, got %d", len(entries))
	}
	// Most recent first
	if entries[0].Action != "server_update" {
		t.Fatalf("expected first entry to be server_update, got %q", entries[0].Action)
	}
	if entries[1].Action != "server_create" {
		t.Fatalf("expected second entry to be server_create, got %q", entries[1].Action)
	}
}

func TestGetAuditLog_WithPagination(t *testing.T) {
	_, mux := setupHandler(t)
	req := httptest.NewRequest("GET", "/api/audit-log?limit=5&offset=0", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestAuditLog_DeleteCreatesEntry(t *testing.T) {
	_, mux := setupHandler(t)
	// Create a server
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Delete it
	req = httptest.NewRequest("DELETE", "/api/servers/1", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Check audit log
	req = httptest.NewRequest("GET", "/api/audit-log", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var entries []config.AuditEntry
	json.Unmarshal(rec.Body.Bytes(), &entries)
	if len(entries) != 2 {
		t.Fatalf("expected 2 audit entries (create+delete), got %d", len(entries))
	}
	if entries[0].Action != "server_delete" {
		t.Fatalf("expected most recent to be server_delete, got %q", entries[0].Action)
	}
}

func TestAuditLog_ExecCreatesEntry(t *testing.T) {
	_, mux := setupHandler(t)
	// Create a server
	body := `{"name":"A","host":"1.1.1.1","port":22,"username":"u","password":"p","group":"G","quick_commands":[]}`
	req := httptest.NewRequest("POST", "/api/servers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Execute a command
	execBody := `{"command":"ls -la"}`
	req = httptest.NewRequest("POST", "/api/servers/1/exec", bytes.NewBufferString(execBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Check audit log has both create and exec
	req = httptest.NewRequest("GET", "/api/audit-log", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var entries []config.AuditEntry
	json.Unmarshal(rec.Body.Bytes(), &entries)
	if len(entries) != 2 {
		t.Fatalf("expected 2 audit entries, got %d", len(entries))
	}
	if entries[0].Action != "command_exec" {
		t.Fatalf("expected most recent to be command_exec, got %q", entries[0].Action)
	}
	if entries[0].Details != "ls -la" {
		t.Fatalf("expected details 'ls -la', got %q", entries[0].Details)
	}
}
