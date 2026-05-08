package config

import (
	"database/sql"
	"errors"

	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("server not found")

type QuickCommand struct {
	ID         int    `json:"id" db:"id"`
	ServerID   int    `json:"-" db:"server_id"`
	Name       string `yaml:"name" json:"name" db:"name"`
	Command    string `yaml:"command" json:"command" db:"command"`
	Tag        string `yaml:"tag" json:"tag" db:"tag"`
	IsTemplate bool   `yaml:"is_template" json:"is_template" db:"is_template"`
}

type GlobalCommand struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Command     string `json:"command"`
	Tag         string `json:"tag"`
	Description string `json:"description"`
	IsTemplate  bool   `json:"is_template"`
	SortOrder   int    `json:"sort_order"`
	CreatedAt   string `json:"created_at"`
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
	SortOrder     int            `yaml:"sort_order" json:"sort_order" db:"sort_order"`
	QuickCommands []QuickCommand `yaml:"quick_commands" json:"quick_commands"`
}

type ServerOrder struct {
	ID        int `json:"id"`
	SortOrder int `json:"sort_order"`
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

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS connection_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			server_id INTEGER NOT NULL,
			connected_at TEXT NOT NULL DEFAULT (datetime('now')),
			disconnected_at TEXT,
			duration_seconds INTEGER DEFAULT 0,
			FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
		)
	`); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS exec_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			server_id INTEGER NOT NULL,
			command_name TEXT NOT NULL,
			command_text TEXT NOT NULL,
			output TEXT NOT NULL DEFAULT '',
			exit_code INTEGER NOT NULL DEFAULT -1,
			executed_at TEXT NOT NULL DEFAULT (datetime('now')),
			duration_ms INTEGER NOT NULL DEFAULT 0,
			FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
		)
	`); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS audit_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			action TEXT NOT NULL,
			server_id INTEGER,
			details TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS global_commands (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			command TEXT NOT NULL,
			tag TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '',
			is_template INTEGER NOT NULL DEFAULT 0,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`); err != nil {
		db.Close()
		return nil, err
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS session_recordings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			server_id INTEGER NOT NULL,
			server_name TEXT NOT NULL DEFAULT '',
			started_at TEXT NOT NULL DEFAULT (datetime('now')),
			ended_at TEXT,
			duration_seconds INTEGER DEFAULT 0,
			data TEXT NOT NULL DEFAULT '',
			cols INTEGER NOT NULL DEFAULT 80,
			rows INTEGER NOT NULL DEFAULT 24,
			FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
		)
	`); err != nil {
		db.Close()
		return nil, err
	}

	// Add new columns for key-based auth (harmlessly errors if columns already exist)
	s := &Store{db: db}
	s.db.Exec(`ALTER TABLE servers ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'password'`)
	s.db.Exec(`ALTER TABLE servers ADD COLUMN private_key TEXT NOT NULL DEFAULT ''`)
	s.db.Exec(`ALTER TABLE servers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
	s.db.Exec(`ALTER TABLE quick_commands ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0`)
	s.db.Exec(`ALTER TABLE exec_history ADD COLUMN server_name TEXT NOT NULL DEFAULT ''`)

	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// DB exposes the underlying sql.DB for use by other packages (e.g., auth).
func (s *Store) DB() *sql.DB {
	return s.db
}

func (s *Store) GetServers() ([]Server, error) {
	rows, err := s.db.Query(`SELECT id, name, host, port, username, password, "group", auth_type, private_key, sort_order FROM servers ORDER BY sort_order, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var servers []Server
	for rows.Next() {
		var srv Server
		if err := rows.Scan(&srv.ID, &srv.Name, &srv.Host, &srv.Port, &srv.Username, &srv.Password, &srv.Group, &srv.AuthType, &srv.PrivateKey, &srv.SortOrder); err != nil {
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
	err := s.db.QueryRow(`SELECT id, name, host, port, username, password, "group", auth_type, private_key, sort_order FROM servers WHERE id = ?`, id).
		Scan(&srv.ID, &srv.Name, &srv.Host, &srv.Port, &srv.Username, &srv.Password, &srv.Group, &srv.AuthType, &srv.PrivateKey, &srv.SortOrder)
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
		`INSERT INTO servers (name, host, port, username, password, "group", auth_type, private_key, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		srv.Name, srv.Host, srv.Port, srv.Username, srv.Password, srv.Group, srv.AuthType, srv.PrivateKey, srv.SortOrder,
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
			`INSERT INTO quick_commands (server_id, name, command, tag, is_template) VALUES (?, ?, ?, ?, ?)`,
			id, cmd.Name, cmd.Command, cmd.Tag, cmd.IsTemplate,
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
		`UPDATE servers SET name = ?, host = ?, port = ?, username = ?, password = ?, "group" = ?, auth_type = ?, private_key = ?, sort_order = ? WHERE id = ?`,
		srv.Name, srv.Host, srv.Port, srv.Username, srv.Password, srv.Group, srv.AuthType, srv.PrivateKey, srv.SortOrder, id,
	); err != nil {
		return err
	}

	if _, err := tx.Exec(`DELETE FROM quick_commands WHERE server_id = ?`, id); err != nil {
		return err
	}

	for _, cmd := range srv.QuickCommands {
		if _, err := tx.Exec(
			`INSERT INTO quick_commands (server_id, name, command, tag, is_template) VALUES (?, ?, ?, ?, ?)`,
			id, cmd.Name, cmd.Command, cmd.Tag, cmd.IsTemplate,
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
	rows, err := s.db.Query(`SELECT id, server_id, name, command, tag, is_template FROM quick_commands WHERE server_id = ? ORDER BY id`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cmds []QuickCommand
	for rows.Next() {
		var cmd QuickCommand
		if err := rows.Scan(&cmd.ID, &cmd.ServerID, &cmd.Name, &cmd.Command, &cmd.Tag, &cmd.IsTemplate); err != nil {
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

func (s *Store) ReorderServers(orders []ServerOrder) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, o := range orders {
		if _, err := tx.Exec(`UPDATE servers SET sort_order = ? WHERE id = ?`, o.SortOrder, o.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

type ConnectionRecord struct {
	ID              int     `json:"id"`
	ServerID        int     `json:"server_id"`
	ConnectedAt     string  `json:"connected_at"`
	DisconnectedAt  *string `json:"disconnected_at"`
	DurationSeconds int     `json:"duration_seconds"`
}

func (s *Store) LogConnect(serverID int) (int, error) {
	res, err := s.db.Exec(
		`INSERT INTO connection_history (server_id) VALUES (?)`, serverID,
	)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	return int(id), nil
}

func (s *Store) LogDisconnect(recordID int) error {
	_, err := s.db.Exec(
		`UPDATE connection_history SET
			disconnected_at = datetime('now'),
			duration_seconds = CAST((julianday(datetime('now')) - julianday(connected_at)) * 86400 AS INTEGER)
		WHERE id = ?`, recordID,
	)
	return err
}

func (s *Store) GetConnectionHistory(serverID, limit int) ([]ConnectionRecord, error) {
	rows, err := s.db.Query(
		`SELECT id, server_id, connected_at, disconnected_at, duration_seconds
		 FROM connection_history WHERE server_id = ? ORDER BY id DESC LIMIT ?`,
		serverID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var records []ConnectionRecord
	for rows.Next() {
		var r ConnectionRecord
		if err := rows.Scan(&r.ID, &r.ServerID, &r.ConnectedAt, &r.DisconnectedAt, &r.DurationSeconds); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

type ExecRecord struct {
	ID          int    `json:"id"`
	ServerID    int    `json:"server_id"`
	ServerName  string `json:"server_name"`
	CommandName string `json:"command_name"`
	CommandText string `json:"command_text"`
	Output      string `json:"output"`
	ExitCode    int    `json:"exit_code"`
	ExecutedAt  string `json:"executed_at"`
	DurationMs  int    `json:"duration_ms"`
}

func (s *Store) LogExec(rec ExecRecord) error {
	_, err := s.db.Exec(
		`INSERT INTO exec_history (server_id, server_name, command_name, command_text, output, exit_code, duration_ms)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		rec.ServerID, rec.ServerName, rec.CommandName, rec.CommandText, rec.Output, rec.ExitCode, rec.DurationMs,
	)
	return err
}

func (s *Store) GetExecHistory(serverID, limit int) ([]ExecRecord, error) {
	rows, err := s.db.Query(
		`SELECT id, server_id, server_name, command_name, command_text, output, exit_code, executed_at, duration_ms
		 FROM exec_history WHERE server_id = ? ORDER BY id DESC LIMIT ?`,
		serverID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var records []ExecRecord
	for rows.Next() {
		var r ExecRecord
		if err := rows.Scan(&r.ID, &r.ServerID, &r.ServerName, &r.CommandName, &r.CommandText, &r.Output, &r.ExitCode, &r.ExecutedAt, &r.DurationMs); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

// GetAllExecHistory returns paginated exec history across all servers with filtering
type ExecHistoryFilter struct {
	ServerID   *int
	Search     string
	ExitCode   *int
	DateFrom   string
	DateTo     string
	Limit      int
	Offset     int
}

type ExecHistoryPage struct {
	Records []ExecRecord `json:"records"`
	Total   int          `json:"total"`
}

func (s *Store) GetAllExecHistory(filter ExecHistoryFilter) (*ExecHistoryPage, error) {
	where := "WHERE 1=1"
	args := []any{}

	if filter.ServerID != nil {
		where += " AND server_id = ?"
		args = append(args, *filter.ServerID)
	}
	if filter.Search != "" {
		where += " AND (command_name LIKE ? OR command_text LIKE ?)"
		like := "%" + filter.Search + "%"
		args = append(args, like, like)
	}
	if filter.ExitCode != nil {
		if *filter.ExitCode == 0 {
			where += " AND exit_code = 0"
		} else {
			where += " AND exit_code != 0"
		}
	}
	if filter.DateFrom != "" {
		where += " AND executed_at >= ?"
		args = append(args, filter.DateFrom)
	}
	if filter.DateTo != "" {
		where += " AND executed_at <= ?"
		args = append(args, filter.DateTo)
	}

	// Count total
	var total int
	countQuery := "SELECT COUNT(*) FROM exec_history " + where
	if err := s.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, err
	}

	// Fetch page
	query := "SELECT id, server_id, server_name, command_name, command_text, output, exit_code, executed_at, duration_ms FROM exec_history " + where + " ORDER BY id DESC LIMIT ? OFFSET ?"
	pageArgs := append(args, filter.Limit, filter.Offset)
	rows, err := s.db.Query(query, pageArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []ExecRecord
	for rows.Next() {
		var r ExecRecord
		if err := rows.Scan(&r.ID, &r.ServerID, &r.ServerName, &r.CommandName, &r.CommandText, &r.Output, &r.ExitCode, &r.ExecutedAt, &r.DurationMs); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	if records == nil {
		records = []ExecRecord{}
	}
	return &ExecHistoryPage{Records: records, Total: total}, rows.Err()
}

// Global Commands CRUD
func (s *Store) GetGlobalCommands() ([]GlobalCommand, error) {
	rows, err := s.db.Query(`SELECT id, name, command, tag, description, is_template, sort_order, created_at FROM global_commands ORDER BY sort_order, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cmds []GlobalCommand
	for rows.Next() {
		var cmd GlobalCommand
		if err := rows.Scan(&cmd.ID, &cmd.Name, &cmd.Command, &cmd.Tag, &cmd.Description, &cmd.IsTemplate, &cmd.SortOrder, &cmd.CreatedAt); err != nil {
			return nil, err
		}
		cmds = append(cmds, cmd)
	}
	if cmds == nil {
		cmds = []GlobalCommand{}
	}
	return cmds, rows.Err()
}

func (s *Store) AddGlobalCommand(cmd GlobalCommand) (int, error) {
	res, err := s.db.Exec(
		`INSERT INTO global_commands (name, command, tag, description, is_template, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
		cmd.Name, cmd.Command, cmd.Tag, cmd.Description, cmd.IsTemplate, cmd.SortOrder,
	)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	return int(id), nil
}

func (s *Store) UpdateGlobalCommand(id int, cmd GlobalCommand) error {
	res, err := s.db.Exec(
		`UPDATE global_commands SET name = ?, command = ?, tag = ?, description = ?, is_template = ?, sort_order = ? WHERE id = ?`,
		cmd.Name, cmd.Command, cmd.Tag, cmd.Description, cmd.IsTemplate, cmd.SortOrder, id,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) DeleteGlobalCommand(id int) error {
	res, err := s.db.Exec(`DELETE FROM global_commands WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

type AuditEntry struct {
	ID        int    `json:"id"`
	Action    string `json:"action"`
	ServerID  *int   `json:"server_id"`
	Details   string `json:"details"`
	CreatedAt string `json:"created_at"`
}

func (s *Store) LogAudit(action string, serverID *int, details string) error {
	_, err := s.db.Exec(
		`INSERT INTO audit_log (action, server_id, details) VALUES (?, ?, ?)`,
		action, serverID, details,
	)
	return err
}

func (s *Store) GetAuditLog(limit, offset int) ([]AuditEntry, error) {
	rows, err := s.db.Query(
		`SELECT id, action, server_id, details, created_at
		 FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []AuditEntry
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.Action, &e.ServerID, &e.Details, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// --- Session Recordings ---

type SessionRecording struct {
	ID              int     `json:"id"`
	ServerID        int     `json:"server_id"`
	ServerName      string  `json:"server_name"`
	StartedAt       string  `json:"started_at"`
	EndedAt         *string `json:"ended_at"`
	DurationSeconds int     `json:"duration_seconds"`
	Data            string  `json:"data,omitempty"`
	Cols            int     `json:"cols"`
	Rows            int     `json:"rows"`
}

func (s *Store) CreateRecording(serverID int, serverName string, cols, rows int) (int, error) {
	res, err := s.db.Exec(
		`INSERT INTO session_recordings (server_id, server_name, cols, rows) VALUES (?, ?, ?, ?)`,
		serverID, serverName, cols, rows,
	)
	if err != nil {
		return 0, err
	}
	id, _ := res.LastInsertId()
	return int(id), nil
}

func (s *Store) AppendRecordingData(id int, data string) error {
	_, err := s.db.Exec(
		`UPDATE session_recordings SET data = data || ? WHERE id = ?`,
		data, id,
	)
	return err
}

func (s *Store) EndRecording(id int) error {
	_, err := s.db.Exec(
		`UPDATE session_recordings SET
			ended_at = datetime('now'),
			duration_seconds = CAST((julianday(datetime('now')) - julianday(started_at)) * 86400 AS INTEGER)
		WHERE id = ?`, id,
	)
	return err
}

func (s *Store) GetRecording(id int) (*SessionRecording, error) {
	var rec SessionRecording
	err := s.db.QueryRow(
		`SELECT id, server_id, server_name, started_at, ended_at, duration_seconds, data, cols, rows
		 FROM session_recordings WHERE id = ?`, id,
	).Scan(&rec.ID, &rec.ServerID, &rec.ServerName, &rec.StartedAt, &rec.EndedAt, &rec.DurationSeconds, &rec.Data, &rec.Cols, &rec.Rows)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &rec, nil
}

func (s *Store) ListRecordings(limit int) ([]SessionRecording, error) {
	rows, err := s.db.Query(
		`SELECT id, server_id, server_name, started_at, ended_at, duration_seconds, cols, rows
		 FROM session_recordings ORDER BY id DESC LIMIT ?`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var recordings []SessionRecording
	for rows.Next() {
		var rec SessionRecording
		if err := rows.Scan(&rec.ID, &rec.ServerID, &rec.ServerName, &rec.StartedAt, &rec.EndedAt, &rec.DurationSeconds, &rec.Cols, &rec.Rows); err != nil {
			return nil, err
		}
		recordings = append(recordings, rec)
	}
	if recordings == nil {
		recordings = []SessionRecording{}
	}
	return recordings, rows.Err()
}

func (s *Store) DeleteRecording(id int) error {
	res, err := s.db.Exec(`DELETE FROM session_recordings WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
