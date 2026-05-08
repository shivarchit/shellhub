package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/sarchitt/shellhub/internal/auth"
)

type AuthHandler struct {
	authStore *auth.AuthStore
}

func NewAuthHandler(authStore *auth.AuthStore) *AuthHandler {
	return &AuthHandler{authStore: authStore}
}

func (h *AuthHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/status", h.status)
	mux.HandleFunc("POST /api/auth/login", h.login)
	mux.HandleFunc("POST /api/auth/register", h.register)
	mux.HandleFunc("POST /api/auth/logout", h.logout)
	mux.HandleFunc("GET /api/auth/login-attempts", h.loginAttempts)
}

// status returns whether setup is needed and whether the user is authenticated.
func (h *AuthHandler) status(w http.ResponseWriter, r *http.Request) {
	hasUsers, _ := h.authStore.HasUsers()

	// Check if user is authenticated
	authenticated := false
	if cookie, err := r.Cookie("shellhub_token"); err == nil {
		if _, err := h.authStore.ValidateToken(cookie.Value); err == nil {
			authenticated = true
		}
	}

	writeJSON(w, 200, map[string]any{
		"setup_required": !hasUsers,
		"authenticated":  authenticated,
	})
}

// register creates the first user (only works when no users exist).
func (h *AuthHandler) register(w http.ResponseWriter, r *http.Request) {
	hasUsers, _ := h.authStore.HasUsers()
	if hasUsers {
		writeError(w, 403, "registration disabled - users already exist")
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}

	if body.Username == "" || body.Password == "" {
		writeError(w, 400, "username and password are required")
		return
	}
	if len(body.Password) < 6 {
		writeError(w, 400, "password must be at least 6 characters")
		return
	}

	user, err := h.authStore.CreateUser(body.Username, body.Password)
	if err != nil {
		writeError(w, 500, "failed to create user: "+err.Error())
		return
	}

	// Set encryption key from user's password and encrypt existing credentials
	h.authStore.SetEncryptionKey(body.Password)
	h.authStore.EncryptExistingCredentials()

	// Generate token and set cookie
	token, err := h.authStore.GenerateToken(user)
	if err != nil {
		writeError(w, 500, "failed to generate token")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "shellhub_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   86400, // 24 hours
	})

	h.authStore.LogLoginAttempt(body.Username, true, auth.GetClientIP(r), r.UserAgent())

	writeJSON(w, 201, map[string]any{
		"user":  user,
		"token": token,
	})
}

// login authenticates a user and sets a session cookie.
func (h *AuthHandler) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}

	if body.Username == "" || body.Password == "" {
		writeError(w, 400, "username and password are required")
		return
	}

	ip := auth.GetClientIP(r)
	ua := r.UserAgent()

	// Check rate limiting
	locked, _ := h.authStore.IsAccountLocked(body.Username)
	if locked {
		h.authStore.LogLoginAttempt(body.Username, false, ip, ua)
		writeError(w, 429, "account locked due to too many failed attempts. Try again in 30 minutes.")
		return
	}

	user, err := h.authStore.Authenticate(body.Username, body.Password)
	if err != nil {
		h.authStore.LogLoginAttempt(body.Username, false, ip, ua)
		writeError(w, 401, "invalid username or password")
		return
	}

	// Set encryption key from password
	h.authStore.SetEncryptionKey(body.Password)

	// Generate token
	token, err := h.authStore.GenerateToken(user)
	if err != nil {
		writeError(w, 500, "failed to generate token")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "shellhub_token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   86400,
	})

	h.authStore.LogLoginAttempt(body.Username, true, ip, ua)

	writeJSON(w, 200, map[string]any{
		"user":  user,
		"token": token,
	})
}

// logout clears the session cookie.
func (h *AuthHandler) logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "shellhub_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
	writeJSON(w, 200, map[string]string{"status": "logged out"})
}

// loginAttempts returns recent login attempts for the audit log.
func (h *AuthHandler) loginAttempts(w http.ResponseWriter, r *http.Request) {
	limit := 100
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil {
			limit = v
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil {
			offset = v
		}
	}

	attempts, err := h.authStore.GetLoginAttempts(limit, offset)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, attempts)
}
