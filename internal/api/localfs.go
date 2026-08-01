package api

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Transfer is one server-side SFTP copy between this machine and a server.
type Transfer struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Direction string `json:"direction"` // "pull" (server -> here) or "push"
	Total     int64  `json:"total"`
	Done      int64  `json:"done"`
	Status    string `json:"status"` // active | done | error
	Error     string `json:"error,omitempty"`
}

// transferRegistry tracks in-flight and recent transfers.
// ponytail: in-memory only — the list is lost on restart, which is fine for a
// progress UI. Persist to the store if history ever needs to survive a restart.
type transferRegistry struct {
	mu   sync.Mutex
	list []*Transfer // newest first
	seq  int
}

var transfers transferRegistry

const maxTransfers = 20

func (reg *transferRegistry) start(name, direction string, total int64) *Transfer {
	reg.mu.Lock()
	defer reg.mu.Unlock()
	reg.seq++
	t := &Transfer{
		ID:        fmt.Sprintf("t%d-%d", reg.seq, time.Now().UnixNano()),
		Name:      name,
		Direction: direction,
		Total:     total,
		Status:    "active",
	}
	reg.list = append([]*Transfer{t}, reg.list...)
	if len(reg.list) > maxTransfers {
		reg.list = reg.list[:maxTransfers]
	}
	return t
}

func (reg *transferRegistry) finish(t *Transfer, err error) {
	reg.mu.Lock()
	defer reg.mu.Unlock()
	if err != nil {
		t.Status, t.Error = "error", err.Error()
		return
	}
	t.Status, t.Total = "done", t.Done
}

func (reg *transferRegistry) snapshot() []Transfer {
	reg.mu.Lock()
	defer reg.mu.Unlock()
	out := make([]Transfer, len(reg.list))
	for i, t := range reg.list {
		out[i] = *t
	}
	return out
}

// progressWriter counts bytes into a transfer under the registry lock.
type progressWriter struct {
	reg *transferRegistry
	t   *Transfer
}

func (p *progressWriter) Write(b []byte) (int, error) {
	p.reg.mu.Lock()
	p.t.Done += int64(len(b))
	p.reg.mu.Unlock()
	return len(b), nil
}

// requireSuperAdmin gates the local-filesystem routes. These read and write the
// host machine's disk, so only superadmins may call them — setup mode included.
func (h *Handler) requireSuperAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isSuperAdmin(r) {
			writeError(w, 403, "superadmin only")
			return
		}
		next(w, r)
	}
}

// cleanLocal validates a host path: no NUL bytes, cleaned, absolute.
func cleanLocal(p string) (string, error) {
	if strings.ContainsRune(p, 0) {
		return "", fmt.Errorf("invalid path")
	}
	p = filepath.Clean(p)
	if !filepath.IsAbs(p) {
		return "", fmt.Errorf("path must be absolute")
	}
	return p, nil
}

type localListing struct {
	Path    string      `json:"path"`
	Home    string      `json:"home"`
	Entries []FileEntry `json:"entries"`
}

func (h *Handler) listLocalFiles(w http.ResponseWriter, r *http.Request) {
	home, _ := os.UserHomeDir()
	p := r.URL.Query().Get("path")
	if p == "" {
		p = home
	}
	p, err := cleanLocal(p)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	infos, err := os.ReadDir(p)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	entries := make([]FileEntry, 0, len(infos))
	for _, de := range infos {
		fi, err := de.Info()
		if err != nil {
			continue
		}
		entries = append(entries, FileEntry{
			Name:    fi.Name(),
			Size:    fi.Size(),
			Mode:    fi.Mode().String(),
			IsDir:   fi.IsDir(),
			ModTime: fi.ModTime().Format(time.RFC3339),
		})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	writeJSON(w, 200, localListing{Path: p, Home: home, Entries: entries})
}

func (h *Handler) mkdirLocal(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	p, err := cleanLocal(body.Path)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err := os.Mkdir(p, 0o755); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) getTransfers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, transfers.snapshot())
}

// pullFile streams a remote file to a local directory, reporting progress
// through the transfer registry. The copy runs in a goroutine; the handler
// returns the transfer id immediately.
func (h *Handler) pullFile(w http.ResponseWriter, r *http.Request) {
	srv := h.resolveServer(w, r)
	if srv == nil {
		return
	}
	var body struct {
		Remote   string `json:"remote"`
		LocalDir string `json:"local_dir"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if body.Remote == "" || strings.ContainsRune(body.Remote, 0) {
		writeError(w, 400, "remote required")
		return
	}
	dir, err := cleanLocal(body.LocalDir)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	name := path.Base(body.Remote)
	local := filepath.Join(dir, name)
	userID, username := getUserFromRequest(r)
	t := transfers.start(name, "pull", 0)

	go func() {
		err := func() error {
			sc, closeFn, err := dialSFTP(srv)
			if err != nil {
				return err
			}
			defer closeFn()
			src, err := sc.Open(body.Remote)
			if err != nil {
				return err
			}
			defer src.Close()
			if fi, err := src.Stat(); err == nil {
				transfers.mu.Lock()
				t.Total = fi.Size()
				transfers.mu.Unlock()
			}
			dst, err := os.Create(local)
			if err != nil {
				return err
			}
			defer dst.Close()
			_, err = io.Copy(io.MultiWriter(dst, &progressWriter{&transfers, t}), src)
			return err
		}()
		transfers.finish(t, err)
		details := body.Remote
		if err != nil {
			details = body.Remote + " (failed: " + err.Error() + ")"
		}
		h.store.LogAuditWithUser("file_pull", &srv.ID, details, userID, username)
	}()

	writeJSON(w, 202, map[string]string{"transfer_id": t.ID})
}

// pushFile streams a local file into a remote directory over SFTP.
func (h *Handler) pushFile(w http.ResponseWriter, r *http.Request) {
	srv := h.resolveServer(w, r)
	if srv == nil {
		return
	}
	var body struct {
		Local     string `json:"local"`
		RemoteDir string `json:"remote_dir"`
	}
	if err := readJSON(r, &body); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	local, err := cleanLocal(body.Local)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if body.RemoteDir == "" || strings.ContainsRune(body.RemoteDir, 0) {
		writeError(w, 400, "remote_dir required")
		return
	}
	fi, err := os.Stat(local)
	if err != nil || fi.IsDir() {
		writeError(w, 400, "local file not found")
		return
	}
	name := filepath.Base(local)
	remote := path.Join(body.RemoteDir, name)
	userID, username := getUserFromRequest(r)
	t := transfers.start(name, "push", fi.Size())

	go func() {
		err := func() error {
			sc, closeFn, err := dialSFTP(srv)
			if err != nil {
				return err
			}
			defer closeFn()
			src, err := os.Open(local)
			if err != nil {
				return err
			}
			defer src.Close()
			dst, err := sc.Create(remote)
			if err != nil {
				return err
			}
			defer dst.Close()
			_, err = io.Copy(io.MultiWriter(dst, &progressWriter{&transfers, t}), src)
			return err
		}()
		transfers.finish(t, err)
		details := remote
		if err != nil {
			details = remote + " (failed: " + err.Error() + ")"
		}
		h.store.LogAuditWithUser("file_push", &srv.ID, details, userID, username)
	}()

	writeJSON(w, 202, map[string]string{"transfer_id": t.ID})
}
