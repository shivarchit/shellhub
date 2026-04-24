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
