package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/sarchitt/shellhub/internal/auth"
	"github.com/sarchitt/shellhub/internal/config"
)

type AuthHandler struct {
	authStore *auth.AuthStore
	store     *config.Store
}

func NewAuthHandler(authStore *auth.AuthStore, store ...*config.Store) *AuthHandler {
	h := &AuthHandler{authStore: authStore}
	if len(store) > 0 {
		h.store = store[0]
	}
	return h
}

func (h *AuthHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/status", h.status)
	mux.HandleFunc("POST /api/auth/login", h.login)
	mux.HandleFunc("POST /api/auth/register", h.register)
	mux.HandleFunc("POST /api/auth/logout", h.logout)
	mux.HandleFunc("GET /api/auth/login-attempts", h.loginAttempts)

	// Authenticated endpoints (protected by auth middleware)
	mux.HandleFunc("GET /api/auth/me", h.me)
	mux.HandleFunc("PUT /api/auth/password", h.changePassword)

	// User management (superadmin only)
	mux.HandleFunc("GET /api/users", h.listUsers)
	mux.HandleFunc("POST /api/users", h.createUser)
	mux.HandleFunc("DELETE /api/users/{id}", h.deleteUser)
	mux.HandleFunc("PUT /api/users/{id}/role", h.updateUserRole)
	mux.HandleFunc("GET /api/users/{id}/servers", h.getUserServers)
	mux.HandleFunc("PUT /api/users/{id}/servers", h.setUserServers)
	mux.HandleFunc("PUT /api/users/{id}/permissions", h.updateUserPermissions)
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

	user, err := h.authStore.CreateUserWithRole(body.Username, body.Password, "superadmin")
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

// --- Authenticated endpoints ---

func authIsSuperAdmin(r *http.Request) bool {
	return r.Header.Get("X-User-Role") == "superadmin"
}

// me returns the current authenticated user.
func (h *AuthHandler) me(w http.ResponseWriter, r *http.Request) {
	idStr := r.Header.Get("X-User-ID")
	if idStr == "" {
		writeError(w, 401, "authentication required")
		return
	}
	id, _ := strconv.Atoi(idStr)
	user, err := h.authStore.GetUser(id)
	if err != nil {
		writeError(w, 404, "user not found")
		return
	}
	writeJSON(w, 200, user)
}

// changePassword changes the current user's password.
func (h *AuthHandler) changePassword(w http.ResponseWriter, r *http.Request) {
	idStr := r.Header.Get("X-User-ID")
	if idStr == "" {
		writeError(w, 401, "authentication required")
		return
	}
	id, _ := strconv.Atoi(idStr)

	var body struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}
	if body.OldPassword == "" || body.NewPassword == "" {
		writeError(w, 400, "old_password and new_password are required")
		return
	}
	if len(body.NewPassword) < 6 {
		writeError(w, 400, "new password must be at least 6 characters")
		return
	}

	if err := h.authStore.ChangePassword(id, body.OldPassword, body.NewPassword); err != nil {
		if err == auth.ErrInvalidPassword {
			writeError(w, 403, "current password is incorrect")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]string{"status": "password changed"})
}

// listUsers returns all users (superadmin only).
func (h *AuthHandler) listUsers(w http.ResponseWriter, r *http.Request) {
	if !authIsSuperAdmin(r) {
		writeError(w, 403, "superadmin access required")
		return
	}
	users, err := h.authStore.GetUsers()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, users)
}

// createUser creates a new user (superadmin only).
func (h *AuthHandler) createUser(w http.ResponseWriter, r *http.Request) {
	if !authIsSuperAdmin(r) {
		writeError(w, 403, "superadmin access required")
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Role     string `json:"role"`
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
	if body.Role == "" {
		body.Role = "user"
	}

	user, err := h.authStore.CreateUserWithRole(body.Username, body.Password, body.Role)
	if err != nil {
		writeError(w, 500, "failed to create user: "+err.Error())
		return
	}
	writeJSON(w, 201, user)
}

// deleteUser deletes a user (superadmin only, cannot delete self).
func (h *AuthHandler) deleteUser(w http.ResponseWriter, r *http.Request) {
	if !authIsSuperAdmin(r) {
		writeError(w, 403, "superadmin access required")
		return
	}
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, "invalid user id")
		return
	}

	// Cannot delete yourself
	currentID, _ := strconv.Atoi(r.Header.Get("X-User-ID"))
	if id == currentID {
		writeError(w, 400, "cannot delete your own account")
		return
	}

	if err := h.authStore.DeleteUser(id); err != nil {
		if err == auth.ErrUserNotFound {
			writeError(w, 404, "user not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

// updateUserRole updates a user's role (superadmin only).
func (h *AuthHandler) updateUserRole(w http.ResponseWriter, r *http.Request) {
	if !authIsSuperAdmin(r) {
		writeError(w, 403, "superadmin access required")
		return
	}
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, "invalid user id")
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}
	if body.Role == "" {
		writeError(w, 400, "role is required")
		return
	}

	if err := h.authStore.UpdateUserRole(id, body.Role); err != nil {
		if err == auth.ErrUserNotFound {
			writeError(w, 404, "user not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]string{"status": "role updated"})
}

// getUserServers returns the server IDs assigned to a user.
func (h *AuthHandler) getUserServers(w http.ResponseWriter, r *http.Request) {
	if !authIsSuperAdmin(r) {
		writeError(w, 403, "superadmin access required")
		return
	}
	if h.store == nil {
		writeError(w, 500, "store not configured")
		return
	}
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, "invalid user id")
		return
	}
	ids, err := h.store.GetUserServerIDs(id)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"server_ids": ids})
}

// setUserServers sets the server IDs assigned to a user.
func (h *AuthHandler) setUserServers(w http.ResponseWriter, r *http.Request) {
	if !authIsSuperAdmin(r) {
		writeError(w, 403, "superadmin access required")
		return
	}
	if h.store == nil {
		writeError(w, 500, "store not configured")
		return
	}
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, "invalid user id")
		return
	}
	var body struct {
		ServerIDs []int `json:"server_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}
	if err := h.store.SetUserServers(id, body.ServerIDs); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]string{"status": "servers updated"})
}

func (h *AuthHandler) updateUserPermissions(w http.ResponseWriter, r *http.Request) {
	if !isSuperAdmin(r) {
		writeError(w, 403, "superadmin access required")
		return
	}
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		writeError(w, 400, "invalid user id")
		return
	}

	var perms auth.UserPermissions
	if err := json.NewDecoder(r.Body).Decode(&perms); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}

	if err := h.authStore.UpdateUserPermissions(id, perms); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, perms)
}
