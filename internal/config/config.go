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
