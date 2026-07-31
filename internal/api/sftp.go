package api

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/pkg/sftp"

	"github.com/shivarchit/shellhub/internal/config"
	"github.com/shivarchit/shellhub/internal/ssh"
)

// FileEntry is one directory entry returned by the file listing endpoint.
type FileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	IsDir   bool   `json:"is_dir"`
	ModTime string `json:"mod_time"`
}

// resolveServer parses the {id}, enforces per-server access, then loads and
// decrypts the server. On any failure it writes the HTTP error and returns nil.
func (h *Handler) resolveServer(w http.ResponseWriter, r *http.Request) *config.Server {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return nil
	}
	if !h.userCanAccessServer(r, id) {
		writeError(w, 403, "access denied")
		return nil
	}
	srv, err := h.store.GetServer(id)
	if err != nil {
		if errors.Is(err, config.ErrNotFound) {
			writeError(w, 404, "server not found")
			return nil
		}
		writeError(w, 500, err.Error())
		return nil
	}
	h.decryptServerCredentials(srv)
	return srv
}

// dialSFTP opens an SSH connection (reusing the same dial/auth logic as exec)
// and layers an SFTP client on top. The returned close func tears down both.
func dialSFTP(srv *config.Server) (*sftp.Client, func(), error) {
	sshClient, err := ssh.NewClient().Connect(*srv)
	if err != nil {
		return nil, nil, err
	}
	sc, err := sftp.NewClient(sshClient)
	if err != nil {
		sshClient.Close()
		return nil, nil, err
	}
	return sc, func() { sc.Close(); sshClient.Close() }, nil
}

// reqPath reads the ?path= query, rejecting embedded NUL bytes. Paths are
// absolute server-side paths; SFTP already scopes them to the server account.
func reqPath(r *http.Request, fallback string) (string, error) {
	p := r.URL.Query().Get("path")
	if p == "" {
		p = fallback
	}
	if strings.ContainsRune(p, 0) {
		return "", errors.New("invalid path")
	}
	return p, nil
}

func (h *Handler) listFiles(w http.ResponseWriter, r *http.Request) {
	srv := h.resolveServer(w, r)
	if srv == nil {
		return
	}
	p, err := reqPath(r, ".")
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	sc, closeFn, err := dialSFTP(srv)
	if err != nil {
		writeError(w, 502, err.Error())
		return
	}
	defer closeFn()

	infos, err := sc.ReadDir(p)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	entries := make([]FileEntry, 0, len(infos))
	for _, fi := range infos {
		entries = append(entries, FileEntry{
			Name:    fi.Name(),
			Size:    fi.Size(),
			Mode:    fi.Mode().String(),
			IsDir:   fi.IsDir(),
			ModTime: fi.ModTime().Format(time.RFC3339),
		})
	}
	// Dirs first, then case-insensitive name.
	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	writeJSON(w, 200, entries)
}

func (h *Handler) downloadFile(w http.ResponseWriter, r *http.Request) {
	srv := h.resolveServer(w, r)
	if srv == nil {
		return
	}
	p, err := reqPath(r, "")
	if err != nil || p == "" {
		writeError(w, 400, "path required")
		return
	}
	sc, closeFn, err := dialSFTP(srv)
	if err != nil {
		writeError(w, 502, err.Error())
		return
	}
	defer closeFn()

	fi, err := sc.Stat(p)
	if err != nil {
		writeError(w, 404, "file not found")
		return
	}
	if fi.IsDir() {
		writeError(w, 400, "cannot download a directory")
		return
	}
	f, err := sc.Open(p)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", fi.Size()))
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", path.Base(p)))
	io.Copy(w, f)
}

func (h *Handler) uploadFiles(w http.ResponseWriter, r *http.Request) {
	srv := h.resolveServer(w, r)
	if srv == nil {
		return
	}
	dir, err := reqPath(r, "")
	if err != nil || dir == "" {
		writeError(w, 400, "path required")
		return
	}
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, 400, "expected multipart upload")
		return
	}
	sc, closeFn, err := dialSFTP(srv)
	if err != nil {
		writeError(w, 502, err.Error())
		return
	}
	defer closeFn()

	userID, username := getUserFromRequest(r)
	uploaded := 0
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			writeError(w, 400, err.Error())
			return
		}
		if part.FileName() == "" {
			continue
		}
		remote := path.Join(dir, path.Base(part.FileName()))
		f, err := sc.Create(remote)
		if err != nil {
			part.Close()
			writeError(w, 500, err.Error())
			return
		}
		if _, err := io.Copy(f, part); err != nil {
			f.Close()
			part.Close()
			writeError(w, 500, err.Error())
			return
		}
		f.Close()
		part.Close()
		h.store.LogAuditWithUser("file_upload", &srv.ID, remote, userID, username)
		uploaded++
	}
	writeJSON(w, 200, map[string]int{"uploaded": uploaded})
}

func (h *Handler) deleteFile(w http.ResponseWriter, r *http.Request) {
	srv := h.resolveServer(w, r)
	if srv == nil {
		return
	}
	p, err := reqPath(r, "")
	if err != nil || p == "" {
		writeError(w, 400, "path required")
		return
	}
	sc, closeFn, err := dialSFTP(srv)
	if err != nil {
		writeError(w, 502, err.Error())
		return
	}
	defer closeFn()

	fi, err := sc.Stat(p)
	if err != nil {
		writeError(w, 404, "not found")
		return
	}
	// RemoveDirectory fails naturally on a non-empty directory.
	if fi.IsDir() {
		err = sc.RemoveDirectory(p)
	} else {
		err = sc.Remove(p)
	}
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	userID, username := getUserFromRequest(r)
	h.store.LogAuditWithUser("file_delete", &srv.ID, p, userID, username)
	w.WriteHeader(204)
}

func (h *Handler) mkdirFile(w http.ResponseWriter, r *http.Request) {
	srv := h.resolveServer(w, r)
	if srv == nil {
		return
	}
	p, err := reqPath(r, "")
	if err != nil || p == "" {
		writeError(w, 400, "path required")
		return
	}
	sc, closeFn, err := dialSFTP(srv)
	if err != nil {
		writeError(w, 502, err.Error())
		return
	}
	defer closeFn()

	if err := sc.Mkdir(p); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	userID, username := getUserFromRequest(r)
	h.store.LogAuditWithUser("file_mkdir", &srv.ID, p, userID, username)
	w.WriteHeader(204)
}
