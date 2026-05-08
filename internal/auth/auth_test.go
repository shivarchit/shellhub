package auth

import (
	"path/filepath"
	"testing"

	"github.com/sarchitt/shellhub/internal/config"
)

func setupAuthStore(t *testing.T) *AuthStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := config.NewStore(dbPath)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	t.Cleanup(func() { store.Close() })

	authStore, err := NewAuthStore(store.DB())
	if err != nil {
		t.Fatalf("failed to create auth store: %v", err)
	}
	return authStore
}

func TestHasUsers_Empty(t *testing.T) {
	s := setupAuthStore(t)
	has, err := s.HasUsers()
	if err != nil {
		t.Fatal(err)
	}
	if has {
		t.Fatal("expected no users initially")
	}
}

func TestCreateUser(t *testing.T) {
	s := setupAuthStore(t)
	user, err := s.CreateUser("admin", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if user.Username != "admin" {
		t.Fatalf("expected username admin, got %s", user.Username)
	}
	if user.ID == 0 {
		t.Fatal("expected non-zero user ID")
	}

	has, _ := s.HasUsers()
	if !has {
		t.Fatal("expected HasUsers to return true after creating user")
	}
}

func TestAuthenticate_Success(t *testing.T) {
	s := setupAuthStore(t)
	s.CreateUser("admin", "password123")

	user, err := s.Authenticate("admin", "password123")
	if err != nil {
		t.Fatalf("expected successful auth, got: %v", err)
	}
	if user.Username != "admin" {
		t.Fatal("unexpected username")
	}
}

func TestAuthenticate_WrongPassword(t *testing.T) {
	s := setupAuthStore(t)
	s.CreateUser("admin", "password123")

	_, err := s.Authenticate("admin", "wrongpassword")
	if err != ErrInvalidPassword {
		t.Fatalf("expected ErrInvalidPassword, got: %v", err)
	}
}

func TestAuthenticate_UserNotFound(t *testing.T) {
	s := setupAuthStore(t)

	_, err := s.Authenticate("nobody", "password")
	if err != ErrUserNotFound {
		t.Fatalf("expected ErrUserNotFound, got: %v", err)
	}
}

func TestTokenGenerateAndValidate(t *testing.T) {
	s := setupAuthStore(t)
	user, _ := s.CreateUser("admin", "pass")

	token, err := s.GenerateToken(user)
	if err != nil {
		t.Fatal(err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	claims, err := s.ValidateToken(token)
	if err != nil {
		t.Fatalf("expected valid token, got: %v", err)
	}
	if claims.UserID != user.ID {
		t.Fatalf("expected user ID %d, got %d", user.ID, claims.UserID)
	}
	if claims.Username != "admin" {
		t.Fatalf("expected username admin, got %s", claims.Username)
	}
}

func TestTokenValidate_InvalidSignature(t *testing.T) {
	s := setupAuthStore(t)
	_, err := s.ValidateToken("invalid.token")
	if err == nil {
		t.Fatal("expected error for invalid token")
	}
}

func TestEncryptDecrypt(t *testing.T) {
	s := setupAuthStore(t)
	s.SetEncryptionKey("masterpassword")

	plaintext := "my-server-password"
	encrypted, err := s.Encrypt(plaintext)
	if err != nil {
		t.Fatal(err)
	}
	if encrypted == plaintext {
		t.Fatal("encrypted should differ from plaintext")
	}
	if encrypted[:4] != "enc:" {
		t.Fatal("encrypted should start with enc: prefix")
	}

	decrypted, err := s.Decrypt(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	if decrypted != plaintext {
		t.Fatalf("expected %q, got %q", plaintext, decrypted)
	}
}

func TestEncrypt_Empty(t *testing.T) {
	s := setupAuthStore(t)
	s.SetEncryptionKey("masterpassword")

	encrypted, err := s.Encrypt("")
	if err != nil {
		t.Fatal(err)
	}
	if encrypted != "" {
		t.Fatal("expected empty string for empty input")
	}
}

func TestEncrypt_AlreadyEncrypted(t *testing.T) {
	s := setupAuthStore(t)
	s.SetEncryptionKey("masterpassword")

	// If value already starts with enc:, it should not be double-encrypted
	input := "enc:already_encrypted_data"
	result, err := s.Encrypt(input)
	if err != nil {
		t.Fatal(err)
	}
	if result != input {
		t.Fatal("should not double-encrypt already encrypted values")
	}
}

func TestDecrypt_Plaintext(t *testing.T) {
	s := setupAuthStore(t)
	s.SetEncryptionKey("masterpassword")

	// If value does not start with enc:, return as-is
	result, err := s.Decrypt("plain_password")
	if err != nil {
		t.Fatal(err)
	}
	if result != "plain_password" {
		t.Fatal("should return plaintext values as-is")
	}
}

func TestAccountLocking(t *testing.T) {
	s := setupAuthStore(t)

	// 4 failed attempts should not lock
	for i := 0; i < 4; i++ {
		s.LogLoginAttempt("admin", false, "127.0.0.1", "test")
	}
	locked, _ := s.IsAccountLocked("admin")
	if locked {
		t.Fatal("should not be locked after 4 attempts")
	}

	// 5th failed attempt should lock
	s.LogLoginAttempt("admin", false, "127.0.0.1", "test")
	locked, _ = s.IsAccountLocked("admin")
	if !locked {
		t.Fatal("should be locked after 5 failed attempts")
	}
}

func TestLoginAttemptLogging(t *testing.T) {
	s := setupAuthStore(t)
	s.LogLoginAttempt("admin", true, "192.168.1.1", "Mozilla/5.0")
	s.LogLoginAttempt("admin", false, "10.0.0.1", "curl/7.0")

	attempts, err := s.GetLoginAttempts(10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(attempts) != 2 {
		t.Fatalf("expected 2 attempts, got %d", len(attempts))
	}
	// Most recent first
	if attempts[0].Success {
		t.Fatal("expected most recent attempt to be failure")
	}
	if attempts[0].IP != "10.0.0.1" {
		t.Fatalf("expected IP 10.0.0.1, got %s", attempts[0].IP)
	}
}

func TestEncryptExistingCredentials(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := config.NewStore(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Add a server with plaintext credentials
	store.AddServer(config.Server{
		Name:       "Test",
		Host:       "1.2.3.4",
		Port:       22,
		Username:   "root",
		Password:   "secret",
		AuthType:   "password",
		PrivateKey: "",
	})

	authStore, err := NewAuthStore(store.DB())
	if err != nil {
		t.Fatal(err)
	}

	authStore.SetEncryptionKey("master")
	err = authStore.EncryptExistingCredentials()
	if err != nil {
		t.Fatal(err)
	}

	// Verify the password is now encrypted in DB
	srv, _ := store.GetServer(1)
	if srv.Password == "secret" {
		t.Fatal("password should have been encrypted")
	}
	if srv.Password[:4] != "enc:" {
		t.Fatalf("encrypted password should start with enc:, got %q", srv.Password[:4])
	}

	// Verify we can decrypt it back
	decrypted, err := authStore.Decrypt(srv.Password)
	if err != nil {
		t.Fatal(err)
	}
	if decrypted != "secret" {
		t.Fatalf("expected 'secret', got %q", decrypted)
	}
}
