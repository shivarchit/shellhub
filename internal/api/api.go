package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/sarchitt/shellhub/internal/auth"
	"github.com/sarchitt/shellhub/internal/config"
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
	mux.HandleFunc("POST /api/servers/{id}/exec", h.execCommand)
	mux.HandleFunc("POST /api/ping", h.pingHost)
	mux.HandleFunc("GET /api/servers/{id}/history", h.getConnectionHistory)
	mux.HandleFunc("GET /api/servers/{id}/exec-history", h.getExecHistory)
	mux.HandleFunc("GET /api/audit-log", h.getAuditLog)
	mux.HandleFunc("GET /api/settings", h.getSettings)
	mux.HandleFunc("PUT /api/settings", h.updateSettings)
	mux.HandleFunc("GET /api/export", h.exportData)
	mux.HandleFunc("POST /api/import", h.importData)
}

func (h *Handler) listServers(w http.ResponseWriter, r *http.Request) {
	servers, err := h.store.GetServers()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, servers)
}

func (h *Handler) createServer(w http.ResponseWriter, r *http.Request) {
	var srv config.Server
	if err := readJSON(r, &srv); err != nil {
		writeError(w, 400, err.Error())
		return
	}

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
	h.store.LogAudit("server_create", &id, srv.Name)
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
	h.store.LogAudit("server_update", &id, srv.Name)
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
	h.store.LogAudit("server_delete", &id, "")
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
	online, _ := h.pinger.Ping(body.Host, body.Port, 5*time.Second)
	writeJSON(w, 200, map[string]bool{"online": online})
}

func (h *Handler) pingServer(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
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
		Command string `json:"command"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	output, exitCode, err := h.executor.Execute(*srv, body.Command)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	h.store.LogExec(config.ExecRecord{
		ServerID:    id,
		CommandName: body.Command,
		CommandText: body.Command,
		Output:      output,
		ExitCode:    exitCode,
		DurationMs:  0,
	})
	h.store.LogAudit("command_exec", &id, body.Command)
	writeJSON(w, 200, map[string]any{"output": output, "exit_code": exitCode})
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
