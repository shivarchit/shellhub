package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserNotFound    = errors.New("user not found")
	ErrAccountLocked   = errors.New("account locked due to too many failed attempts")
	ErrInvalidPassword = errors.New("invalid password")
)

// JWT-like token (HMAC-SHA256 signed)
// We use a simple custom token format to avoid external dependencies.

type UserPermissions struct {
	CanViewRecordings bool `json:"can_view_recordings"`
	CanViewMetrics    bool `json:"can_view_metrics"`
	CanViewAudit      bool `json:"can_view_audit"`
	CanManageServers  bool `json:"can_manage_servers"`
	CanExecCommands   bool `json:"can_exec_commands"`
	CanOpenTerminal   bool `json:"can_open_terminal"`
	CanViewDB         bool `json:"can_view_db"`
}

func DefaultUserPermissions() UserPermissions {
	return UserPermissions{
		CanViewRecordings: false,
		CanViewMetrics:    false,
		CanViewAudit:      false,
		CanManageServers:  false,
		CanExecCommands:   true,
		CanOpenTerminal:   true,
		CanViewDB:         false,
	}
}

func SuperAdminPermissions() UserPermissions {
	return UserPermissions{
		CanViewRecordings: true,
		CanViewMetrics:    true,
		CanViewAudit:      true,
		CanManageServers:  true,
		CanExecCommands:   true,
		CanOpenTerminal:   true,
		CanViewDB:         true,
	}
}

type User struct {
	ID           int             `json:"id"`
	Username     string          `json:"username"`
	PasswordHash string          `json:"-"`
	Role         string          `json:"role"`
	Permissions  UserPermissions `json:"permissions"`
	CreatedAt    string          `json:"created_at"`
	LastLogin    string          `json:"last_login"`
}

type LoginAttempt struct {
	ID        int    `json:"id"`
	Username  string `json:"username"`
	Success   bool   `json:"success"`
	IP        string `json:"ip"`
	UserAgent string `json:"user_agent"`
	CreatedAt string `json:"created_at"`
}

type AuthStore struct {
	db            *sql.DB
	jwtSecret     []byte
	encryptionKey []byte // 32 bytes for AES-256
	mu            sync.RWMutex
}

func NewAuthStore(db *sql.DB) (*AuthStore, error) {
	s := &AuthStore{db: db}

	// Create users table
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			last_login TEXT
		)
	`); err != nil {
		return nil, fmt.Errorf("create users table: %w", err)
	}

	// Create login_attempts table for rate limiting and audit
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS login_attempts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL,
			success INTEGER NOT NULL DEFAULT 0,
			ip TEXT NOT NULL DEFAULT '',
			user_agent TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`); err != nil {
		return nil, fmt.Errorf("create login_attempts table: %w", err)
	}

	// Add columns (harmlessly errors if already exists)
	s.db.Exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`)
	s.db.Exec(`ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}'`)

	// Generate or load JWT secret from app_settings
	secret, err := s.getOrCreateSetting("jwt_secret", func() string {
		b := make([]byte, 32)
		rand.Read(b)
		return base64.StdEncoding.EncodeToString(b)
	})
	if err != nil {
		return nil, err
	}
	decoded, _ := base64.StdEncoding.DecodeString(secret)
	if len(decoded) < 32 {
		decoded = make([]byte, 32)
		rand.Read(decoded)
	}
	s.jwtSecret = decoded

	return s, nil
}

func (s *AuthStore) getOrCreateSetting(key string, generate func() string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = ?`, key).Scan(&value)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			value = generate()
			_, err = s.db.Exec(
				`INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
				key, value,
			)
			if err != nil {
				return "", err
			}
			return value, nil
		}
		return "", err
	}
	return value, nil
}

// HasUsers returns true if at least one user exists.
func (s *AuthStore) HasUsers() (bool, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	return count > 0, err
}

// EnsureDefaultAdmin creates a default admin user if no users exist.
// Also ensures at least one superadmin exists (upgrades first user if needed).
func (s *AuthStore) EnsureDefaultAdmin() error {
	hasUsers, err := s.HasUsers()
	if err != nil {
		return err
	}
	if !hasUsers {
		user, err := s.CreateUser("admin", "admin123")
		if err != nil {
			return err
		}
		_, err = s.db.Exec(`UPDATE users SET role = 'superadmin' WHERE id = ?`, user.ID)
		return err
	}
	// Ensure at least one superadmin exists (handles upgrades from older DBs)
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'superadmin'`).Scan(&count)
	if count == 0 {
		s.db.Exec(`UPDATE users SET role = 'superadmin' WHERE id = (SELECT MIN(id) FROM users)`)
	}
	return nil
}

// CreateUser creates a new user with bcrypt-hashed password (role defaults to 'user').
func (s *AuthStore) CreateUser(username, password string) (*User, error) {
	return s.CreateUserWithRole(username, password, "user")
}

// CreateUserWithRole creates a new user with the specified role and default permissions.
func (s *AuthStore) CreateUserWithRole(username, password, role string) (*User, error) {
	if role == "" {
		role = "user"
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	perms := DefaultUserPermissions()
	if role == "superadmin" {
		perms = SuperAdminPermissions()
	}
	permsJSON, _ := json.Marshal(perms)

	res, err := s.db.Exec(
		`INSERT INTO users (username, password_hash, role, permissions) VALUES (?, ?, ?, ?)`,
		username, string(hash), role, string(permsJSON),
	)
	if err != nil {
		return nil, err
	}

	id, _ := res.LastInsertId()
	return &User{
		ID:          int(id),
		Username:    username,
		Role:        role,
		Permissions: perms,
	}, nil
}

// UpdateUserPermissions updates the permissions JSON for a user.
func (s *AuthStore) UpdateUserPermissions(userID int, perms UserPermissions) error {
	permsJSON, _ := json.Marshal(perms)
	_, err := s.db.Exec(`UPDATE users SET permissions = ? WHERE id = ?`, string(permsJSON), userID)
	return err
}

// Authenticate validates username/password. Returns user on success.
func (s *AuthStore) Authenticate(username, password string) (*User, error) {
	var user User
	var permsJSON string
	err := s.db.QueryRow(
		`SELECT id, username, password_hash, COALESCE(role, 'user'), COALESCE(permissions, '{}'), created_at, COALESCE(last_login, '') FROM users WHERE username = ?`,
		username,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.Role, &permsJSON, &user.CreatedAt, &user.LastLogin)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidPassword
	}

	// Parse permissions
	if user.Role == "superadmin" {
		user.Permissions = SuperAdminPermissions()
	} else {
		user.Permissions = DefaultUserPermissions()
		json.Unmarshal([]byte(permsJSON), &user.Permissions)
	}

	// Update last_login
	s.db.Exec(`UPDATE users SET last_login = datetime('now') WHERE id = ?`, user.ID)

	return &user, nil
}

// IsAccountLocked checks if there are 5+ failed attempts in the last 10 minutes.
func (s *AuthStore) IsAccountLocked(username string) (bool, error) {
	var count int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM login_attempts
		 WHERE username = ? AND success = 0
		 AND created_at > datetime('now', '-10 minutes')`,
		username,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count >= 5, nil
}

// LogLoginAttempt records a login attempt.
func (s *AuthStore) LogLoginAttempt(username string, success bool, ip, userAgent string) error {
	_, err := s.db.Exec(
		`INSERT INTO login_attempts (username, success, ip, user_agent) VALUES (?, ?, ?, ?)`,
		username, success, ip, userAgent,
	)
	return err
}

// GetLoginAttempts returns recent login attempts for audit.
func (s *AuthStore) GetLoginAttempts(limit, offset int) ([]LoginAttempt, error) {
	rows, err := s.db.Query(
		`SELECT id, username, success, ip, user_agent, created_at
		 FROM login_attempts ORDER BY id DESC LIMIT ? OFFSET ?`,
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var attempts []LoginAttempt
	for rows.Next() {
		var a LoginAttempt
		var success int
		if err := rows.Scan(&a.ID, &a.Username, &success, &a.IP, &a.UserAgent, &a.CreatedAt); err != nil {
			return nil, err
		}
		a.Success = success != 0
		attempts = append(attempts, a)
	}
	if attempts == nil {
		attempts = []LoginAttempt{}
	}
	return attempts, rows.Err()
}

// --- Token management ---

type TokenClaims struct {
	UserID   int    `json:"uid"`
	Username string `json:"sub"`
	Role     string `json:"role"`
	Exp      int64  `json:"exp"`
}

// GenerateToken creates a signed token valid for 24 hours.
func (s *AuthStore) GenerateToken(user *User) (string, error) {
	claims := TokenClaims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		Exp:      time.Now().Add(24 * time.Hour).Unix(),
	}
	payload, _ := json.Marshal(claims)
	encoded := base64.RawURLEncoding.EncodeToString(payload)

	// HMAC-SHA256 signature
	mac := hmacSHA256(s.jwtSecret, []byte(encoded))
	sig := base64.RawURLEncoding.EncodeToString(mac)

	return encoded + "." + sig, nil
}

// ValidateToken verifies and decodes a token.
func (s *AuthStore) ValidateToken(token string) (*TokenClaims, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return nil, errors.New("invalid token format")
	}

	// Verify signature
	expectedMAC := hmacSHA256(s.jwtSecret, []byte(parts[0]))
	expectedSig := base64.RawURLEncoding.EncodeToString(expectedMAC)
	if parts[1] != expectedSig {
		return nil, errors.New("invalid token signature")
	}

	// Decode payload
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("invalid token encoding")
	}

	var claims TokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, errors.New("invalid token payload")
	}

	if time.Now().Unix() > claims.Exp {
		return nil, errors.New("token expired")
	}

	return &claims, nil
}

func hmacSHA256(key, data []byte) []byte {
	// Simple HMAC implementation using SHA-256
	blockSize := 64
	if len(key) > blockSize {
		h := sha256.Sum256(key)
		key = h[:]
	}
	if len(key) < blockSize {
		padded := make([]byte, blockSize)
		copy(padded, key)
		key = padded
	}

	ipad := make([]byte, blockSize)
	opad := make([]byte, blockSize)
	for i := 0; i < blockSize; i++ {
		ipad[i] = key[i] ^ 0x36
		opad[i] = key[i] ^ 0x5c
	}

	inner := sha256.New()
	inner.Write(ipad)
	inner.Write(data)
	innerHash := inner.Sum(nil)

	outer := sha256.New()
	outer.Write(opad)
	outer.Write(innerHash)
	return outer.Sum(nil)
}

// --- User Management ---

// ChangePassword changes a user's password after verifying the old one.
func (s *AuthStore) ChangePassword(userID int, oldPassword, newPassword string) error {
	var hash string
	err := s.db.QueryRow(`SELECT password_hash FROM users WHERE id = ?`, userID).Scan(&hash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrUserNotFound
		}
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(oldPassword)); err != nil {
		return ErrInvalidPassword
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, string(newHash), userID)
	return err
}

// GetUsers returns all users.
func (s *AuthStore) GetUsers() ([]User, error) {
	rows, err := s.db.Query(
		`SELECT id, username, COALESCE(role, 'user'), COALESCE(permissions, '{}'), created_at, COALESCE(last_login, '') FROM users ORDER BY id`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var permsJSON string
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &permsJSON, &u.CreatedAt, &u.LastLogin); err != nil {
			return nil, err
		}
		if u.Role == "superadmin" {
			u.Permissions = SuperAdminPermissions()
		} else {
			u.Permissions = DefaultUserPermissions()
			json.Unmarshal([]byte(permsJSON), &u.Permissions)
		}
		users = append(users, u)
	}
	if users == nil {
		users = []User{}
	}
	return users, rows.Err()
}

// GetUser returns a single user by ID.
func (s *AuthStore) GetUser(id int) (*User, error) {
	var u User
	var permsJSON string
	err := s.db.QueryRow(
		`SELECT id, username, COALESCE(role, 'user'), COALESCE(permissions, '{}'), created_at, COALESCE(last_login, '') FROM users WHERE id = ?`, id,
	).Scan(&u.ID, &u.Username, &u.Role, &permsJSON, &u.CreatedAt, &u.LastLogin)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	if u.Role == "superadmin" {
		u.Permissions = SuperAdminPermissions()
	} else {
		u.Permissions = DefaultUserPermissions()
		json.Unmarshal([]byte(permsJSON), &u.Permissions)
	}
	return &u, nil
}

// DeleteUser deletes a user by ID.
func (s *AuthStore) DeleteUser(id int) error {
	res, err := s.db.Exec(`DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrUserNotFound
	}
	return nil
}

// UpdateUserRole updates the role of a user.
func (s *AuthStore) UpdateUserRole(id int, role string) error {
	res, err := s.db.Exec(`UPDATE users SET role = ? WHERE id = ?`, role, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrUserNotFound
	}
	return nil
}

// --- Encryption for credentials ---

// SetEncryptionKey ensures an encryption key is available.
// If a key has already been persisted (from a previous setup), it is loaded
// and the master password is ignored — the persisted key is the source of
// truth so that subsequent logins (or password changes) never invalidate
// previously-encrypted server credentials.
// If no key is persisted yet (first-time setup), a new 32-byte key is
// derived from the master password + a stored salt and persisted.
func (s *AuthStore) SetEncryptionKey(masterPassword string) error {
	// If an encryption key already exists in storage, use it as-is.
	var existing string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'encryption_key'`).Scan(&existing)
	if err == nil && existing != "" {
		key, decErr := base64.StdEncoding.DecodeString(existing)
		if decErr == nil && len(key) == 32 {
			s.mu.Lock()
			s.encryptionKey = key
			s.mu.Unlock()
			return nil
		}
		// Fall through to regenerate if the stored value is corrupt.
	}

	salt, err := s.getOrCreateSetting("encryption_salt", func() string {
		b := make([]byte, 16)
		rand.Read(b)
		return base64.StdEncoding.EncodeToString(b)
	})
	if err != nil {
		return err
	}

	saltBytes, _ := base64.StdEncoding.DecodeString(salt)
	s.mu.Lock()
	s.encryptionKey = deriveKey(masterPassword, saltBytes)
	s.mu.Unlock()

	// Persist derived key for restart recovery
	encoded := base64.StdEncoding.EncodeToString(s.encryptionKey)
	s.db.Exec(`INSERT INTO app_settings (key, value) VALUES ('encryption_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, encoded)
	return nil
}

// LoadEncryptionKey restores the encryption key from persisted storage (survives restarts).
func (s *AuthStore) LoadEncryptionKey() {
	var encoded string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'encryption_key'`).Scan(&encoded)
	if err != nil || encoded == "" {
		return
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return
	}
	s.mu.Lock()
	s.encryptionKey = key
	s.mu.Unlock()
}

// HasEncryptionKey returns whether the encryption key is currently set.
func (s *AuthStore) HasEncryptionKey() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.encryptionKey) == 32
}

// deriveKey uses PBKDF2-like key derivation (SHA-256 iterated).
func deriveKey(password string, salt []byte) []byte {
	// Simple PBKDF2-like: iterate SHA-256 10000 times
	key := append([]byte(password), salt...)
	for i := 0; i < 10000; i++ {
		h := sha256.Sum256(key)
		key = h[:]
	}
	return key
}

// Encrypt encrypts plaintext using AES-256-GCM.
func (s *AuthStore) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	// Skip already-encrypted values
	if strings.HasPrefix(plaintext, "enc:") {
		return plaintext, nil
	}
	s.mu.RLock()
	key := s.encryptionKey
	s.mu.RUnlock()

	if len(key) != 32 {
		return plaintext, nil // No encryption key set, return as-is
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return "enc:" + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts ciphertext that was encrypted with Encrypt.
func (s *AuthStore) Decrypt(ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	if !strings.HasPrefix(ciphertext, "enc:") {
		return ciphertext, nil // Not encrypted, return as-is
	}

	s.mu.RLock()
	key := s.encryptionKey
	s.mu.RUnlock()

	if len(key) != 32 {
		return "", errors.New("encryption key not set")
	}

	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(ciphertext, "enc:"))
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, encrypted := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, encrypted, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

// EncryptExistingCredentials migrates plaintext credentials to encrypted.
func (s *AuthStore) EncryptExistingCredentials() error {
	if !s.HasEncryptionKey() {
		return errors.New("encryption key not set")
	}

	rows, err := s.db.Query(`SELECT id, password, private_key FROM servers`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type cred struct {
		id         int
		password   string
		privateKey string
	}
	var creds []cred
	for rows.Next() {
		var c cred
		if err := rows.Scan(&c.id, &c.password, &c.privateKey); err != nil {
			return err
		}
		creds = append(creds, c)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, c := range creds {
		// Skip already encrypted values
		if strings.HasPrefix(c.password, "enc:") && strings.HasPrefix(c.privateKey, "enc:") {
			continue
		}

		encPass := c.password
		if c.password != "" && !strings.HasPrefix(c.password, "enc:") {
			var err error
			encPass, err = s.Encrypt(c.password)
			if err != nil {
				return err
			}
		}

		encKey := c.privateKey
		if c.privateKey != "" && !strings.HasPrefix(c.privateKey, "enc:") {
			var err error
			encKey, err = s.Encrypt(c.privateKey)
			if err != nil {
				return err
			}
		}

		if _, err := s.db.Exec(
			`UPDATE servers SET password = ?, private_key = ? WHERE id = ?`,
			encPass, encKey, c.id,
		); err != nil {
			return err
		}
	}

	return nil
}

// --- HTTP Middleware ---

// AuthMiddleware protects routes by validating the session token from cookie.
func (s *AuthStore) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for specific public endpoints
		path := r.URL.Path
		if path == "/api/health" ||
			path == "/api/auth/status" ||
			path == "/api/auth/login" ||
			path == "/api/auth/register" ||
			path == "/api/auth/logout" {
			next.ServeHTTP(w, r)
			return
		}

		// Skip non-API routes
		if !strings.HasPrefix(path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		// Check for token in cookie
		token := ""
		if cookie, err := r.Cookie("shellhub_token"); err == nil {
			token = cookie.Value
		}

		// Also check query param (for WebSocket connections)
		if token == "" {
			token = r.URL.Query().Get("token")
		}

		if token == "" {
			writeJSONError(w, 401, "authentication required")
			return
		}

		claims, err := s.ValidateToken(token)
		if err != nil {
			writeJSONError(w, 401, "invalid or expired token")
			return
		}

		// Store claims in request context via header (simple approach)
		r.Header.Set("X-User-ID", fmt.Sprintf("%d", claims.UserID))
		r.Header.Set("X-Username", claims.Username)
		// Backward compatibility: empty role in old tokens treated as "user"
		role := claims.Role
		if role == "" {
			role = "user"
		}
		r.Header.Set("X-User-Role", role)

		next.ServeHTTP(w, r)
	})
}

// NoAuthRequired returns a middleware that checks if any user exists.
// If no users exist, all routes are accessible (setup mode).
func (s *AuthStore) SetupOrAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hasUsers, _ := s.HasUsers()
		if !hasUsers {
			// No users yet - allow everything (setup mode)
			next.ServeHTTP(w, r)
			return
		}

		// Users exist - require auth
		s.AuthMiddleware(next).ServeHTTP(w, r)
	})
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// GetClientIP extracts the client IP from the request.
func GetClientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.SplitN(forwarded, ",", 2)
		return strings.TrimSpace(parts[0])
	}
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return realIP
	}
	// Strip port from RemoteAddr
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}
