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
