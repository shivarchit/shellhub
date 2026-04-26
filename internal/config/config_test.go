package config

import (
	"os"
	"path/filepath"
	"testing"
)

func tempStore(t *testing.T) *Store {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := NewStore(dbPath)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

func tempStoreWithData(t *testing.T) *Store {
	t.Helper()
	store := tempStore(t)
	_, err := store.AddServer(Server{
		Name:     "Server A",
		Host:     "10.0.0.1",
		Port:     22,
		Username: "admin",
		Password: "pass",
		Group:    "Production",
		QuickCommands: []QuickCommand{
			{Name: "Deploy", Command: "deploy.sh", Tag: "deploy"},
		},
	})
	if err != nil {
		t.Fatalf("failed to seed data: %v", err)
	}
	return store
}

func TestGetServers_Empty(t *testing.T) {
	s := tempStore(t)
	servers, err := s.GetServers()
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(servers) != 0 {
		t.Fatalf("expected 0 servers, got %d", len(servers))
	}
}

func TestGetServers_WithData(t *testing.T) {
	s := tempStoreWithData(t)
	servers, err := s.GetServers()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
	srv := servers[0]
	if srv.Name != "Server A" || srv.Host != "10.0.0.1" || srv.Port != 22 {
		t.Fatalf("unexpected server data: %+v", srv)
	}
	if srv.ID != 1 {
		t.Fatalf("expected ID 1, got %d", srv.ID)
	}
	if len(srv.QuickCommands) != 1 || srv.QuickCommands[0].Name != "Deploy" {
		t.Fatalf("unexpected quick commands: %+v", srv.QuickCommands)
	}
}

func TestAddServer(t *testing.T) {
	s := tempStoreWithData(t)
	id, err := s.AddServer(Server{Name: "New", Host: "2.3.4.5", Username: "root", Password: "pw", Group: "Staging"})
	if err != nil {
		t.Fatalf("add error: %v", err)
	}
	if id != 2 {
		t.Fatalf("expected id 2, got %d", id)
	}
	srv, err := s.GetServer(2)
	if err != nil {
		t.Fatalf("get error: %v", err)
	}
	if srv.Name != "New" || srv.Port != 22 {
		t.Fatalf("unexpected server: %+v", srv)
	}
}

func TestAddServer_DefaultPort(t *testing.T) {
	s := tempStore(t)
	id, err := s.AddServer(Server{Name: "NoPort", Host: "1.1.1.1", Username: "u", Password: "p"})
	if err != nil {
		t.Fatalf("add error: %v", err)
	}
	srv, _ := s.GetServer(id)
	if srv.Port != 22 {
		t.Fatalf("expected default port 22, got %d", srv.Port)
	}
}

func TestGetServer_NotFound(t *testing.T) {
	s := tempStore(t)
	_, err := s.GetServer(1)
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	_, err = s.GetServer(999)
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for 999, got %v", err)
	}
}

func TestUpdateServer(t *testing.T) {
	s := tempStoreWithData(t)
	err := s.UpdateServer(1, Server{Name: "Updated", Host: "9.9.9.9", Port: 2222, Username: "new", Password: "new", Group: "Dev"})
	if err != nil {
		t.Fatalf("update error: %v", err)
	}
	srv, _ := s.GetServer(1)
	if srv.Name != "Updated" || srv.Port != 2222 {
		t.Fatalf("update failed: %+v", srv)
	}
}

func TestUpdateServer_NotFound(t *testing.T) {
	s := tempStore(t)
	err := s.UpdateServer(1, Server{Name: "X"})
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteServer(t *testing.T) {
	s := tempStoreWithData(t)
	s.AddServer(Server{Name: "B", Host: "2.2.2.2", Port: 22, Username: "u", Password: "p", Group: "Dev"})
	err := s.DeleteServer(1)
	if err != nil {
		t.Fatalf("delete error: %v", err)
	}
	servers, _ := s.GetServers()
	if len(servers) != 1 || servers[0].Name != "B" {
		t.Fatalf("delete failed, remaining: %+v", servers)
	}
	// ID should still be 2 (no shifting)
	if servers[0].ID != 2 {
		t.Fatalf("expected remaining server ID 2, got %d", servers[0].ID)
	}
}

func TestDeleteServer_NotFound(t *testing.T) {
	s := tempStore(t)
	err := s.DeleteServer(1)
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteServer_CascadesQuickCommands(t *testing.T) {
	s := tempStore(t)
	id, _ := s.AddServer(Server{
		Name: "WithCmds", Host: "1.1.1.1", Port: 22, Username: "u", Password: "p",
		QuickCommands: []QuickCommand{
			{Name: "cmd1", Command: "echo 1", Tag: "t1"},
			{Name: "cmd2", Command: "echo 2", Tag: "t2"},
		},
	})
	err := s.DeleteServer(id)
	if err != nil {
		t.Fatalf("delete error: %v", err)
	}
	// Verify quick commands are gone (table should have no rows for this server)
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM quick_commands WHERE server_id = ?`, id).Scan(&count)
	if count != 0 {
		t.Fatalf("expected 0 quick commands after cascade delete, got %d", count)
	}
}

func TestUpdateServer_QuickCommands(t *testing.T) {
	s := tempStoreWithData(t) // has server ID 1 with 1 quick command
	err := s.UpdateServer(1, Server{
		Name: "Updated", Host: "9.9.9.9", Port: 22, Username: "u", Password: "p", Group: "G",
		QuickCommands: []QuickCommand{
			{Name: "NewCmd", Command: "ls -la", Tag: "info"},
		},
	})
	if err != nil {
		t.Fatalf("update error: %v", err)
	}
	srv, _ := s.GetServer(1)
	if len(srv.QuickCommands) != 1 || srv.QuickCommands[0].Name != "NewCmd" {
		t.Fatalf("unexpected quick commands after update: %+v", srv.QuickCommands)
	}
}

func TestImportFromYAML(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	yamlPath := filepath.Join(dir, "servers.yaml")

	yamlData := `servers:
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
  - name: "Server B"
    host: "10.0.0.2"
    port: 2222
    username: "root"
    password: "secret"
    group: "Staging"
`
	os.WriteFile(yamlPath, []byte(yamlData), 0644)

	store, err := NewStore(dbPath)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	n, err := ImportFromYAML(store, yamlPath)
	if err != nil {
		t.Fatalf("import error: %v", err)
	}
	if n != 2 {
		t.Fatalf("expected 2 imported, got %d", n)
	}

	servers, _ := store.GetServers()
	if len(servers) != 2 {
		t.Fatalf("expected 2 servers, got %d", len(servers))
	}
	if servers[0].Name != "Server A" || servers[1].Name != "Server B" {
		t.Fatalf("unexpected server names: %s, %s", servers[0].Name, servers[1].Name)
	}
	if len(servers[0].QuickCommands) != 1 {
		t.Fatalf("expected 1 quick command for Server A, got %d", len(servers[0].QuickCommands))
	}
}

func TestImportFromYAML_NoFile(t *testing.T) {
	store := tempStore(t)
	n, err := ImportFromYAML(store, filepath.Join(t.TempDir(), "nonexistent.yaml"))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if n != 0 {
		t.Fatalf("expected 0 imported, got %d", n)
	}
}

func TestSettings_GetEmpty(t *testing.T) {
	s := tempStore(t)
	val, err := s.GetSetting("ping_interval")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "" {
		t.Fatalf("expected empty, got %q", val)
	}
}

func TestSettings_SetAndGet(t *testing.T) {
	s := tempStore(t)
	if err := s.SetSetting("ping_interval", "30"); err != nil {
		t.Fatal(err)
	}
	val, err := s.GetSetting("ping_interval")
	if err != nil {
		t.Fatal(err)
	}
	if val != "30" {
		t.Fatalf("expected '30', got %q", val)
	}
}

func TestSettings_Upsert(t *testing.T) {
	s := tempStore(t)
	s.SetSetting("ping_interval", "30")
	s.SetSetting("ping_interval", "60")
	val, _ := s.GetSetting("ping_interval")
	if val != "60" {
		t.Fatalf("expected '60', got %q", val)
	}
}

func TestSettings_GetAll(t *testing.T) {
	s := tempStore(t)
	s.SetSetting("ping_interval", "30")
	s.SetSetting("theme", "dark")
	all, err := s.GetAllSettings()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected 2, got %d", len(all))
	}
}

func TestAddServer_WithKeyAuth(t *testing.T) {
	s := tempStore(t)
	id, err := s.AddServer(Server{
		Name: "KeyServer", Host: "1.2.3.4", Port: 22,
		Username: "u", AuthType: "key", PrivateKey: "fake-key-data", Group: "Test",
	})
	if err != nil {
		t.Fatal(err)
	}
	srv, _ := s.GetServer(id)
	if srv.AuthType != "key" {
		t.Fatalf("expected 'key', got %q", srv.AuthType)
	}
	if srv.PrivateKey != "fake-key-data" {
		t.Fatalf("private key not saved")
	}
}

func TestLogConnect(t *testing.T) {
	s := tempStoreWithData(t)
	recordID, err := s.LogConnect(1)
	if err != nil {
		t.Fatalf("LogConnect error: %v", err)
	}
	if recordID < 1 {
		t.Fatalf("expected positive record ID, got %d", recordID)
	}
	records, err := s.GetConnectionHistory(1, 10)
	if err != nil {
		t.Fatalf("GetConnectionHistory error: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	if records[0].ServerID != 1 {
		t.Fatalf("expected server_id 1, got %d", records[0].ServerID)
	}
	if records[0].ConnectedAt == "" {
		t.Fatal("expected connected_at to be set")
	}
	if records[0].DisconnectedAt != nil {
		t.Fatal("expected disconnected_at to be nil before disconnect")
	}
}

func TestLogDisconnect(t *testing.T) {
	s := tempStoreWithData(t)
	recordID, _ := s.LogConnect(1)
	err := s.LogDisconnect(recordID)
	if err != nil {
		t.Fatalf("LogDisconnect error: %v", err)
	}
	records, _ := s.GetConnectionHistory(1, 10)
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	if records[0].DisconnectedAt == nil {
		t.Fatal("expected disconnected_at to be set after disconnect")
	}
	if records[0].DurationSeconds < 0 {
		t.Fatalf("expected non-negative duration, got %d", records[0].DurationSeconds)
	}
}

func TestGetConnectionHistory_Empty(t *testing.T) {
	s := tempStoreWithData(t)
	records, err := s.GetConnectionHistory(1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if records != nil {
		t.Fatalf("expected nil records for empty history, got %d", len(records))
	}
}

func TestGetConnectionHistory_OrderAndLimit(t *testing.T) {
	s := tempStoreWithData(t)
	s.LogConnect(1)
	s.LogConnect(1)
	s.LogConnect(1)

	records, err := s.GetConnectionHistory(1, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("expected 2 records (limit), got %d", len(records))
	}
	// Should be in descending order by ID
	if records[0].ID <= records[1].ID {
		t.Fatalf("expected descending order, got IDs %d, %d", records[0].ID, records[1].ID)
	}
}

func TestConnectionHistory_CascadeDelete(t *testing.T) {
	s := tempStoreWithData(t)
	s.LogConnect(1)
	s.LogConnect(1)
	s.DeleteServer(1)

	// After server deletion, history should be gone due to CASCADE
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM connection_history WHERE server_id = 1`).Scan(&count)
	if count != 0 {
		t.Fatalf("expected 0 history records after cascade delete, got %d", count)
	}
}

func TestAddServer_DefaultAuthType(t *testing.T) {
	s := tempStore(t)
	id, err := s.AddServer(Server{
		Name: "PassServer", Host: "1.2.3.4", Port: 22,
		Username: "u", Password: "p", Group: "Test",
	})
	if err != nil {
		t.Fatal(err)
	}
	srv, _ := s.GetServer(id)
	// AuthType should be empty string (zero value) since we didn't set it;
	// the DB default is 'password' but since we INSERT the Go zero value (""),
	// it will be "". This verifies the field round-trips correctly.
	if srv.AuthType != "" {
		t.Fatalf("expected empty auth_type for default, got %q", srv.AuthType)
	}
}

func TestLogExec(t *testing.T) {
	s := tempStoreWithData(t)
	err := s.LogExec(ExecRecord{
		ServerID:    1,
		CommandName: "uptime",
		CommandText: "uptime",
		Output:      " 10:00:00 up 1 day",
		ExitCode:    0,
		DurationMs:  42,
	})
	if err != nil {
		t.Fatalf("LogExec error: %v", err)
	}
	records, err := s.GetExecHistory(1, 10)
	if err != nil {
		t.Fatalf("GetExecHistory error: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}
	r := records[0]
	if r.CommandName != "uptime" || r.ExitCode != 0 || r.DurationMs != 42 {
		t.Fatalf("unexpected record: %+v", r)
	}
	if r.ExecutedAt == "" {
		t.Fatal("expected executed_at to be set")
	}
}

func TestGetExecHistory_Empty(t *testing.T) {
	s := tempStoreWithData(t)
	records, err := s.GetExecHistory(1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if records != nil {
		t.Fatalf("expected nil records for empty history, got %d", len(records))
	}
}

func TestGetExecHistory_OrderAndLimit(t *testing.T) {
	s := tempStoreWithData(t)
	for i := 0; i < 5; i++ {
		s.LogExec(ExecRecord{ServerID: 1, CommandName: "cmd", CommandText: "cmd", ExitCode: i})
	}
	records, err := s.GetExecHistory(1, 3)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(records) != 3 {
		t.Fatalf("expected 3 records (limit), got %d", len(records))
	}
	if records[0].ID <= records[1].ID {
		t.Fatalf("expected descending order, got IDs %d, %d", records[0].ID, records[1].ID)
	}
}

func TestExecHistory_CascadeDelete(t *testing.T) {
	s := tempStoreWithData(t)
	s.LogExec(ExecRecord{ServerID: 1, CommandName: "cmd", CommandText: "cmd"})
	s.DeleteServer(1)
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM exec_history WHERE server_id = 1`).Scan(&count)
	if count != 0 {
		t.Fatalf("expected 0 exec records after cascade delete, got %d", count)
	}
}

func TestLogAudit(t *testing.T) {
	s := tempStore(t)
	serverID := 1
	err := s.LogAudit("server_create", &serverID, "Test Server")
	if err != nil {
		t.Fatalf("LogAudit error: %v", err)
	}
	entries, err := s.GetAuditLog(10, 0)
	if err != nil {
		t.Fatalf("GetAuditLog error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Action != "server_create" || e.Details != "Test Server" {
		t.Fatalf("unexpected entry: %+v", e)
	}
	if e.ServerID == nil || *e.ServerID != 1 {
		t.Fatalf("expected server_id 1, got %v", e.ServerID)
	}
	if e.CreatedAt == "" {
		t.Fatal("expected created_at to be set")
	}
}

func TestLogAudit_NilServerID(t *testing.T) {
	s := tempStore(t)
	err := s.LogAudit("some_action", nil, "no server")
	if err != nil {
		t.Fatalf("LogAudit error: %v", err)
	}
	entries, err := s.GetAuditLog(10, 0)
	if err != nil {
		t.Fatalf("GetAuditLog error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].ServerID != nil {
		t.Fatalf("expected nil server_id, got %v", entries[0].ServerID)
	}
}

func TestGetAuditLog_OrderAndPagination(t *testing.T) {
	s := tempStore(t)
	for i := 0; i < 5; i++ {
		s.LogAudit("action", nil, "")
	}
	entries, err := s.GetAuditLog(3, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries (limit), got %d", len(entries))
	}
	if entries[0].ID <= entries[1].ID {
		t.Fatalf("expected descending order, got IDs %d, %d", entries[0].ID, entries[1].ID)
	}
	// Test offset
	entries2, _ := s.GetAuditLog(3, 3)
	if len(entries2) != 2 {
		t.Fatalf("expected 2 entries with offset 3, got %d", len(entries2))
	}
}

func TestGetAuditLog_Empty(t *testing.T) {
	s := tempStore(t)
	entries, err := s.GetAuditLog(10, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entries != nil {
		t.Fatalf("expected nil entries for empty log, got %d", len(entries))
	}
}

func TestImportFromYAML_AlreadyHasData(t *testing.T) {
	s := tempStoreWithData(t) // already has 1 server

	dir := t.TempDir()
	yamlPath := filepath.Join(dir, "servers.yaml")
	yamlData := `servers:
  - name: "Extra"
    host: "1.1.1.1"
    port: 22
    username: "u"
    password: "p"
    group: "G"
`
	os.WriteFile(yamlPath, []byte(yamlData), 0644)

	n, err := ImportFromYAML(s, yamlPath)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if n != 0 {
		t.Fatalf("expected 0 imported (already has data), got %d", n)
	}
	servers, _ := s.GetServers()
	if len(servers) != 1 {
		t.Fatalf("expected still 1 server, got %d", len(servers))
	}
}
