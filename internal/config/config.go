package config

import (
	"database/sql"
	"errors"

	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("server not found")

type QuickCommand struct {
	ID       int    `json:"id" db:"id"`
	ServerID int    `json:"-" db:"server_id"`
	Name     string `yaml:"name" json:"name" db:"name"`
	Command  string `yaml:"command" json:"command" db:"command"`
	Tag      string `yaml:"tag" json:"tag" db:"tag"`
}

type Server struct {
	ID            int            `json:"id" db:"id"`
	Name          string         `yaml:"name" json:"name" db:"name"`
	Host          string         `yaml:"host" json:"host" db:"host"`
	Port          int            `yaml:"port" json:"port" db:"port"`
	Username      string         `yaml:"username" json:"username" db:"username"`
	Password      string         `yaml:"password" json:"password" db:"password"`
	Group         string         `yaml:"group" json:"group" db:"group"`
	AuthType      string         `yaml:"auth_type" json:"auth_type" db:"auth_type"`
	PrivateKey    string         `yaml:"private_key" json:"private_key" db:"private_key"`
	QuickCommands []QuickCommand `yaml:"quick_commands" json:"quick_commands"`
}

type Store struct {
	db *sql.DB
}

func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS servers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			host TEXT NOT NULL,
			port INTEGER NOT NULL DEFAULT 22,
			username TEXT NOT NULL,
			password TEXT NOT NULL,
			"group" TEXT NOT NULL DEFAULT ''
		)
	`); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS quick_commands (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			server_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			command TEXT NOT NULL,
			tag TEXT NOT NULL DEFAULT '',
			FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
		)
	`); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)
	`); err != nil {
		db.Close()
		return nil, err
	}

	// Add new columns for key-based auth (harmlessly errors if columns already exist)
	s := &Store{db: db}
	s.db.Exec(`ALTER TABLE servers ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'password'`)
	s.db.Exec(`ALTER TABLE servers ADD COLUMN private_key TEXT NOT NULL DEFAULT ''`)

	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) GetServers() ([]Server, error) {
	rows, err := s.db.Query(`SELECT id, name, host, port, username, password, "group", auth_type, private_key FROM servers ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var servers []Server
	for rows.Next() {
		var srv Server
		if err := rows.Scan(&srv.ID, &srv.Name, &srv.Host, &srv.Port, &srv.Username, &srv.Password, &srv.Group, &srv.AuthType, &srv.PrivateKey); err != nil {
			return nil, err
		}
		cmds, err := s.getQuickCommands(srv.ID)
		if err != nil {
			return nil, err
		}
		srv.QuickCommands = cmds
		servers = append(servers, srv)
	}
	if servers == nil {
		servers = []Server{}
	}
	return servers, rows.Err()
}

func (s *Store) GetServer(id int) (*Server, error) {
	var srv Server
	err := s.db.QueryRow(`SELECT id, name, host, port, username, password, "group", auth_type, private_key FROM servers WHERE id = ?`, id).
		Scan(&srv.ID, &srv.Name, &srv.Host, &srv.Port, &srv.Username, &srv.Password, &srv.Group, &srv.AuthType, &srv.PrivateKey)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	cmds, err := s.getQuickCommands(srv.ID)
	if err != nil {
		return nil, err
	}
	srv.QuickCommands = cmds
	return &srv, nil
}

func (s *Store) AddServer(srv Server) (int, error) {
	if srv.Port == 0 {
		srv.Port = 22
	}
	res, err := s.db.Exec(
		`INSERT INTO servers (name, host, port, username, password, "group", auth_type, private_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		srv.Name, srv.Host, srv.Port, srv.Username, srv.Password, srv.Group, srv.AuthType, srv.PrivateKey,
	)
	if err != nil {
		return 0, err
	}
	id64, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	id := int(id64)

	for _, cmd := range srv.QuickCommands {
		if _, err := s.db.Exec(
			`INSERT INTO quick_commands (server_id, name, command, tag) VALUES (?, ?, ?, ?)`,
			id, cmd.Name, cmd.Command, cmd.Tag,
		); err != nil {
			return 0, err
		}
	}
	return id, nil
}

func (s *Store) UpdateServer(id int, srv Server) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Check exists
	var exists int
	err = tx.QueryRow(`SELECT id FROM servers WHERE id = ?`, id).Scan(&exists)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	if _, err := tx.Exec(
		`UPDATE servers SET name = ?, host = ?, port = ?, username = ?, password = ?, "group" = ?, auth_type = ?, private_key = ? WHERE id = ?`,
		srv.Name, srv.Host, srv.Port, srv.Username, srv.Password, srv.Group, srv.AuthType, srv.PrivateKey, id,
	); err != nil {
		return err
	}

	if _, err := tx.Exec(`DELETE FROM quick_commands WHERE server_id = ?`, id); err != nil {
		return err
	}

	for _, cmd := range srv.QuickCommands {
		if _, err := tx.Exec(
			`INSERT INTO quick_commands (server_id, name, command, tag) VALUES (?, ?, ?, ?)`,
			id, cmd.Name, cmd.Command, cmd.Tag,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) DeleteServer(id int) error {
	res, err := s.db.Exec(`DELETE FROM servers WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) getQuickCommands(serverID int) ([]QuickCommand, error) {
	rows, err := s.db.Query(`SELECT id, server_id, name, command, tag FROM quick_commands WHERE server_id = ? ORDER BY id`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cmds []QuickCommand
	for rows.Next() {
		var cmd QuickCommand
		if err := rows.Scan(&cmd.ID, &cmd.ServerID, &cmd.Name, &cmd.Command, &cmd.Tag); err != nil {
			return nil, err
		}
		cmds = append(cmds, cmd)
	}
	if cmds == nil {
		cmds = []QuickCommand{}
	}
	return cmds, rows.Err()
}

func (s *Store) GetSetting(key string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = ?`, key).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return value, nil
}

func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO app_settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	return err
}

func (s *Store) GetAllSettings() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM app_settings ORDER BY key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	settings := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		settings[k] = v
	}
	return settings, rows.Err()
}
