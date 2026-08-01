package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/shivarchit/shellhub/internal/auth"
	"github.com/shivarchit/shellhub/internal/config"
)

type Pinger interface {
	Ping(host string, port int, timeout time.Duration) (bool, error)
}

type Executor interface {
	Execute(server config.Server, command string) (string, int, error)
}

type Handler struct {
	store     *config.Store
	pinger    Pinger
	executor  Executor
	authStore *auth.AuthStore
}

func NewHandler(store *config.Store, pinger Pinger, executor Executor, authStore *auth.AuthStore) *Handler {
	return &Handler{store: store, pinger: pinger, executor: executor, authStore: authStore}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/servers", h.listServers)
	mux.HandleFunc("POST /api/servers", h.createServer)
	mux.HandleFunc("PUT /api/servers/reorder", h.reorderServers)
	mux.HandleFunc("PUT /api/servers/{id}", h.updateServer)
	mux.HandleFunc("DELETE /api/servers/{id}", h.deleteServer)
	mux.HandleFunc("POST /api/servers/{id}/ping", h.pingServer)
	mux.HandleFunc("POST /api/servers/{id}/exec", h.requirePerm(h.execCommand, func(p auth.UserPermissions) bool { return p.CanExecCommands }))
	fileAccess := func(p auth.UserPermissions) bool { return p.CanOpenTerminal }
	mux.HandleFunc("GET /api/servers/{id}/files", h.requirePerm(h.listFiles, fileAccess))
	mux.HandleFunc("GET /api/servers/{id}/files/download", h.requirePerm(h.downloadFile, fileAccess))
	mux.HandleFunc("POST /api/servers/{id}/files/upload", h.requirePerm(h.uploadFiles, fileAccess))
	mux.HandleFunc("DELETE /api/servers/{id}/files", h.requirePerm(h.deleteFile, fileAccess))
	mux.HandleFunc("POST /api/servers/{id}/files/mkdir", h.requirePerm(h.mkdirFile, fileAccess))
	mux.HandleFunc("POST /api/ping", h.pingHost)
	mux.HandleFunc("GET /api/servers/{id}/history", h.getConnectionHistory)
	mux.HandleFunc("GET /api/servers/{id}/exec-history", h.getExecHistory)
	mux.HandleFunc("GET /api/audit-log", h.requirePerm(h.getAuditLog, func(p auth.UserPermissions) bool { return p.CanViewAudit }))
	mux.HandleFunc("GET /api/exec-history", h.getAllExecHistory)
	mux.HandleFunc("GET /api/exec-history/export", h.exportExecHistory)
	mux.HandleFunc("GET /api/settings", h.getSettings)
	mux.HandleFunc("PUT /api/settings", h.updateSettings)
	mux.HandleFunc("GET /api/export", h.exportData)
	mux.HandleFunc("POST /api/import", h.importData)
	mux.HandleFunc("GET /api/global-commands", h.listGlobalCommands)
	mux.HandleFunc("POST /api/global-commands", h.createGlobalCommand)
	mux.HandleFunc("PUT /api/global-commands/{id}", h.updateGlobalCommand)
	mux.HandleFunc("DELETE /api/global-commands/{id}", h.deleteGlobalCommand)
	mux.HandleFunc("GET /api/recordings", h.requirePerm(h.listRecordings, func(p auth.UserPermissions) bool { return p.CanViewRecordings }))
	mux.HandleFunc("GET /api/recordings/{id}", h.requirePerm(h.getRecording, func(p auth.UserPermissions) bool { return p.CanViewRecordings }))
	mux.HandleFunc("DELETE /api/recordings/{id}", h.requirePerm(h.deleteRecording, func(p auth.UserPermissions) bool { return p.CanViewRecordings }))
	mux.HandleFunc("GET /api/servers/{id}/stats", h.getServerStats)
	mux.HandleFunc("GET /api/metrics", h.requirePerm(h.getMetrics, func(p auth.UserPermissions) bool { return p.CanViewMetrics }))
	mux.HandleFunc("GET /api/db/tables", h.requirePerm(h.listTables, func(p auth.UserPermissions) bool { return p.CanViewDB }))
	mux.HandleFunc("GET /api/db/query", h.requirePerm(h.queryTable, func(p auth.UserPermissions) bool { return p.CanViewDB }))
}

// requirePerm wraps a handler, rejecting requests whose user lacks the
// permission selected by check. Setup mode (unauthenticated) and superadmins
// always pass; on any lookup failure it fails closed (403).
func (h *Handler) requirePerm(next http.HandlerFunc, check func(auth.UserPermissions) bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := getUserFromRequest(r)
		if userID == 0 || isSuperAdmin(r) {
			next(w, r)
			return
		}
		user, err := h.authStore.GetUser(userID)
		if err != nil || !check(user.Permissions) {
			writeError(w, 403, "permission denied")
			return
		}
		next(w, r)
	}
}

// canViewAudit reports whether the requester may see raw command text. Setup
// mode (unauthenticated) and superadmins always may; otherwise it checks the
// CanViewAudit permission, failing closed on any lookup error.
func (h *Handler) canViewAudit(r *http.Request) bool {
	userID, _ := getUserFromRequest(r)
	if userID == 0 || isSuperAdmin(r) {
		return true
	}
	user, err := h.authStore.GetUser(userID)
	if err != nil {
		return false
	}
	return user.Permissions.CanViewAudit
}

// redactExec blanks raw command text (keeping command_name) for viewers without
// audit permission, marking each record so the UI can show a redaction bar.
func redactExec(records []config.ExecRecord, canView bool) {
	if canView {
		return
	}
	for i := range records {
		records[i].CommandText = ""
		records[i].Output = ""
		records[i].CommandHidden = true
	}
}

func getUserFromRequest(r *http.Request) (int, string) {
	id, _ := strconv.Atoi(r.Header.Get("X-User-ID"))
	return id, r.Header.Get("X-Username")
}

func isSuperAdmin(r *http.Request) bool {
	return r.Header.Get("X-User-Role") == "superadmin"
}

func (h *Handler) listServers(w http.ResponseWriter, r *http.Request) {
	userID, _ := getUserFromRequest(r)

	var servers []config.Server
	var err error

	if isSuperAdmin(r) || userID == 0 {
		// Superadmin or unauthenticated (setup mode) sees all servers
		servers, err = h.store.GetServers()
	} else {
		// Regular user only sees assigned servers
		servers, err = h.store.GetServersForUser(userID)
	}

	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, servers)
}

// normalizeHost cleans up common paste artifacts in a host value: surrounding
// whitespace, an ssh:// scheme prefix, a user@ prefix, and a trailing slash.
func normalizeHost(host string) string {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "ssh://")
	if i := strings.LastIndex(host, "@"); i >= 0 {
		host = host[i+1:]
	}
	return strings.TrimSuffix(host, "/")
}

func (h *Handler) createServer(w http.ResponseWriter, r *http.Request) {
	var srv config.Server
	if err := readJSON(r, &srv); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	srv.Host = normalizeHost(srv.Host)

	// Encrypt credentials before storing
	if h.authStore != nil && h.authStore.HasEncryptionKey() {
		if srv.Password != "" {
			if enc, err := h.authStore.Encrypt(srv.Password); err == nil {
				srv.Password = enc
			}
		}
		if srv.PrivateKey != "" {
			if enc, err := h.authStore.Encrypt(srv.PrivateKey); err == nil {
				srv.PrivateKey = enc
			}
		}
	}

	id, err := h.store.AddServer(srv)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	userID, username := getUserFromRequest(r)
	h.store.LogAuditWithUser("server_create", &id, srv.Name, userID, username)
	created, _ := h.store.GetServer(id)
	writeJSON(w, 201, created)
}

func (h *Handler) updateServer(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	var srv config.Server
	if err := readJSON(r, &srv); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	srv.Host = normalizeHost(srv.Host)

	// Encrypt credentials before storing
	if h.authStore != nil && h.authStore.HasEncryptionKey() {
		if srv.Password != "" {
			if enc, err := h.authStore.Encrypt(srv.Password); err == nil {
				srv.Password = enc
			}
		}
		if srv.PrivateKey != "" {
			if enc, err := h.authStore.Encrypt(srv.PrivateKey); err == nil {
				srv.PrivateKey = enc
			}
		}
	}

	if err := h.store.UpdateServer(id, srv); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	userID, username := getUserFromRequest(r)
	h.store.LogAuditWithUser("server_update", &id, srv.Name, userID, username)
	updated, _ := h.store.GetServer(id)
	writeJSON(w, 200, updated)
}

func (h *Handler) deleteServer(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	if err := h.store.DeleteServer(id); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	userID, username := getUserFromRequest(r)
	h.store.LogAuditWithUser("server_delete", &id, "", userID, username)
	w.WriteHeader(204)
}

func (h *Handler) reorderServers(w http.ResponseWriter, r *http.Request) {
	var orders []config.ServerOrder
	if err := readJSON(r, &orders); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err := h.store.ReorderServers(orders); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) pingHost(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Host string `json:"host"`
		Port int    `json:"port"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if body.Port == 0 {
		body.Port = 22
	}
	online, err := h.pinger.Ping(normalizeHost(body.Host), body.Port, 5*time.Second)
	resp := map[string]any{"online": online}
	if err != nil {
		resp["error"] = err.Error()
	}
	writeJSON(w, 200, resp)
}

func (h *Handler) pingServer(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}

	// Access control
	if !h.userCanAccessServer(r, id) {
		writeError(w, 403, "access denied")
		return
	}

	srv, err := h.store.GetServer(id)
	if err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	online, _ := h.pinger.Ping(srv.Host, srv.Port, 5*time.Second)
	writeJSON(w, 200, map[string]bool{"online": online})
}

func (h *Handler) execCommand(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}

	// Access control
	if !h.userCanAccessServer(r, id) {
		writeError(w, 403, "access denied")
		return
	}

	srv, err := h.store.GetServer(id)
	if err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}

	// Decrypt credentials for SSH connection
	h.decryptServerCredentials(srv)

	var body struct {
		Command     string `json:"command"`
		CommandName string `json:"command_name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	cmdName := body.CommandName
	if cmdName == "" {
		cmdName = body.Command
	}
	userID, username := getUserFromRequest(r)
	start := time.Now()
	output, exitCode, err := h.executor.Execute(*srv, body.Command)
	durationMs := int(time.Since(start).Milliseconds())
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	h.store.LogExec(config.ExecRecord{
		ServerID:    id,
		ServerName:  srv.Name,
		CommandName: cmdName,
		CommandText: body.Command,
		Output:      output,
		ExitCode:    exitCode,
		DurationMs:  durationMs,
		UserID:      userID,
		Username:    username,
	})
	h.store.LogAuditWithUser("command_exec", &id, body.Command, userID, username)
	writeJSON(w, 200, map[string]any{"output": output, "exit_code": exitCode, "duration_ms": durationMs})
}

// userCanAccessServer checks if the current user can access the given server.
// Superadmins and unauthenticated users in setup mode always have access.
func (h *Handler) userCanAccessServer(r *http.Request, serverID int) bool {
	userID, _ := getUserFromRequest(r)
	if userID == 0 || isSuperAdmin(r) {
		return true
	}
	hasAccess, _ := h.store.UserHasServerAccess(userID, serverID)
	return hasAccess
}

// decryptServerCredentials decrypts password and private_key in place.
func (h *Handler) decryptServerCredentials(srv *config.Server) {
	if h.authStore == nil || !h.authStore.HasEncryptionKey() {
		return
	}
	if dec, err := h.authStore.Decrypt(srv.Password); err == nil {
		srv.Password = dec
	}
	if dec, err := h.authStore.Decrypt(srv.PrivateKey); err == nil {
		srv.PrivateKey = dec
	}
}

func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.store.GetAllSettings()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, settings)
}

func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	if err := readJSON(r, &body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	for key, value := range body {
		if err := h.store.SetSetting(key, value); err != nil {
			writeError(w, 500, err.Error())
			return
		}
	}
	settings, _ := h.store.GetAllSettings()
	writeJSON(w, 200, settings)
}

type ExportData struct {
	Version  int               `json:"version"`
	Servers  []config.Server   `json:"servers"`
	Settings map[string]string `json:"settings"`
}

func (h *Handler) exportData(w http.ResponseWriter, r *http.Request) {
	servers, err := h.store.GetServers()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	settings, err := h.store.GetAllSettings()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	w.Header().Set("Content-Disposition", `attachment; filename="shellhub-export.json"`)
	writeJSON(w, 200, ExportData{Version: 1, Servers: servers, Settings: settings})
}

func (h *Handler) importData(w http.ResponseWriter, r *http.Request) {
	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "merge"
	}

	var data ExportData
	if err := readJSON(r, &data); err != nil {
		writeError(w, 400, err.Error())
		return
	}

	if mode == "replace" {
		existing, _ := h.store.GetServers()
		for _, s := range existing {
			h.store.DeleteServer(s.ID)
		}
	}

	count := 0
	for _, srv := range data.Servers {
		if _, err := h.store.AddServer(srv); err == nil {
			count++
		}
	}
	for k, v := range data.Settings {
		h.store.SetSetting(k, v)
	}

	writeJSON(w, 200, map[string]any{"status": "ok", "imported": count})
}

func (h *Handler) getConnectionHistory(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	records, err := h.store.GetConnectionHistory(id, 20)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if records == nil {
		records = []config.ConnectionRecord{}
	}
	writeJSON(w, 200, records)
}

func (h *Handler) getExecHistory(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	records, err := h.store.GetExecHistory(id, 50)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if records == nil {
		records = []config.ExecRecord{}
	}
	redactExec(records, h.canViewAudit(r))
	writeJSON(w, 200, records)
}

func (h *Handler) getAuditLog(w http.ResponseWriter, r *http.Request) {
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
	entries, err := h.store.GetAuditLog(limit, offset)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if entries == nil {
		entries = []config.AuditEntry{}
	}
	writeJSON(w, 200, entries)
}

func (h *Handler) listGlobalCommands(w http.ResponseWriter, r *http.Request) {
	cmds, err := h.store.GetGlobalCommands()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, cmds)
}

func (h *Handler) createGlobalCommand(w http.ResponseWriter, r *http.Request) {
	var cmd config.GlobalCommand
	if err := readJSON(r, &cmd); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	id, err := h.store.AddGlobalCommand(cmd)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	cmd.ID = id
	userID, username := getUserFromRequest(r)
	h.store.LogAuditWithUser("global_command_create", nil, cmd.Name, userID, username)
	writeJSON(w, 201, cmd)
}

func (h *Handler) updateGlobalCommand(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid id")
		return
	}
	var cmd config.GlobalCommand
	if err := readJSON(r, &cmd); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err := h.store.UpdateGlobalCommand(id, cmd); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "global command not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	cmd.ID = id
	userID, username := getUserFromRequest(r)
	h.store.LogAuditWithUser("global_command_update", nil, cmd.Name, userID, username)
	writeJSON(w, 200, cmd)
}

func (h *Handler) deleteGlobalCommand(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid id")
		return
	}
	if err := h.store.DeleteGlobalCommand(id); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "global command not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	userID, username := getUserFromRequest(r)
	h.store.LogAuditWithUser("global_command_delete", nil, "", userID, username)
	w.WriteHeader(204)
}

func (h *Handler) getAllExecHistory(w http.ResponseWriter, r *http.Request) {
	canView := h.canViewAudit(r)
	filter := config.ExecHistoryFilter{
		Limit:          50,
		Offset:         0,
		SearchNameOnly: !canView,
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil {
			filter.Limit = v
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil {
			filter.Offset = v
		}
	}
	if sid := r.URL.Query().Get("server_id"); sid != "" {
		if v, err := strconv.Atoi(sid); err == nil {
			filter.ServerID = &v
		}
	}
	if s := r.URL.Query().Get("search"); s != "" {
		filter.Search = s
	}
	if ec := r.URL.Query().Get("exit_code"); ec != "" {
		if v, err := strconv.Atoi(ec); err == nil {
			filter.ExitCode = &v
		}
	}
	if df := r.URL.Query().Get("date_from"); df != "" {
		filter.DateFrom = df
	}
	if dt := r.URL.Query().Get("date_to"); dt != "" {
		filter.DateTo = dt
	}

	page, err := h.store.GetAllExecHistory(filter)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	redactExec(page.Records, canView)
	writeJSON(w, 200, page)
}

func (h *Handler) exportExecHistory(w http.ResponseWriter, r *http.Request) {
	canView := h.canViewAudit(r)
	filter := config.ExecHistoryFilter{
		Limit:          100000,
		Offset:         0,
		SearchNameOnly: !canView,
	}
	if sid := r.URL.Query().Get("server_id"); sid != "" {
		if v, err := strconv.Atoi(sid); err == nil {
			filter.ServerID = &v
		}
	}
	if s := r.URL.Query().Get("search"); s != "" {
		filter.Search = s
	}
	if ec := r.URL.Query().Get("exit_code"); ec != "" {
		if v, err := strconv.Atoi(ec); err == nil {
			filter.ExitCode = &v
		}
	}
	if df := r.URL.Query().Get("date_from"); df != "" {
		filter.DateFrom = df
	}
	if dt := r.URL.Query().Get("date_to"); dt != "" {
		filter.DateTo = dt
	}

	page, err := h.store.GetAllExecHistory(filter)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	redactExec(page.Records, canView)

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="shellhub-audit.csv"`)
	// CSV header
	w.Write([]byte("ID,Server ID,Server Name,Command,Exit Code,Duration (ms),Executed At\n"))
	for _, r := range page.Records {
		line := fmt.Sprintf("%d,%d,%q,%q,%d,%d,%s\n",
			r.ID, r.ServerID, r.ServerName, r.CommandText, r.ExitCode, r.DurationMs, r.ExecutedAt)
		w.Write([]byte(line))
	}
}

func parseID(r *http.Request) (int, error) {
	return strconv.Atoi(r.PathValue("id"))
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func readJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	return dec.Decode(dst)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (h *Handler) listRecordings(w http.ResponseWriter, r *http.Request) {
	recordings, err := h.store.ListRecordings(100)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, recordings)
}

func (h *Handler) getRecording(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid recording id")
		return
	}
	rec, err := h.store.GetRecording(id)
	if err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "recording not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, rec)
}

func (h *Handler) deleteRecording(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid recording id")
		return
	}
	if err := h.store.DeleteRecording(id); err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "recording not found")
			return
		}
		writeError(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}
