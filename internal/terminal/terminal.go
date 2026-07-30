package terminal

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sarchitt/shellhub/internal/auth"
	"github.com/sarchitt/shellhub/internal/config"
	sshpkg "github.com/sarchitt/shellhub/internal/ssh"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type resizeMessage struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

type recordMessage struct {
	Type string `json:"type"`
}

type Handler struct {
	store     *config.Store
	sshClient *sshpkg.Client
	authStore *auth.AuthStore
}

func NewHandler(store *config.Store, sshClient *sshpkg.Client) *Handler {
	return &Handler{store: store, sshClient: sshClient}
}

func NewHandlerWithAuth(store *config.Store, sshClient *sshpkg.Client, authStore *auth.AuthStore) *Handler {
	return &Handler{store: store, sshClient: sshClient, authStore: authStore}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, `{"error":"invalid id"}`, 400)
		return
	}

	srv, err := h.store.GetServer(id)
	if err != nil {
		http.Error(w, `{"error":"server not found"}`, 404)
		return
	}

	userID, _ := strconv.Atoi(r.Header.Get("X-User-ID"))
	username := r.Header.Get("X-Username")

	// Permission check (before upgrade). Setup mode (userID 0) and superadmins
	// pass; anyone else needs can_open_terminal. Fails closed on lookup error.
	if userID != 0 && r.Header.Get("X-User-Role") != "superadmin" && h.authStore != nil {
		if u, err := h.authStore.GetUser(userID); err != nil || !u.Permissions.CanOpenTerminal {
			http.Error(w, `{"error":"permission denied"}`, 403)
			return
		}
	}

	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}
	defer wsConn.Close()

	// Decrypt credentials for SSH connection
	if h.authStore != nil && h.authStore.HasEncryptionKey() {
		if dec, err := h.authStore.Decrypt(srv.Password); err == nil {
			srv.Password = dec
		}
		if dec, err := h.authStore.Decrypt(srv.PrivateKey); err == nil {
			srv.PrivateKey = dec
		}
	}

	sshClient, err := h.sshClient.Connect(*srv)
	if err != nil {
		wsConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "SSH connection failed: "+err.Error()))
		return
	}

	session, err := sshpkg.NewSession(sshClient)
	if err != nil {
		sshClient.Close()
		wsConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "SSH session failed: "+err.Error()))
		return
	}
	defer session.Close()

	if err := session.RequestPty(80, 24); err != nil {
		return
	}
	if err := session.StartShell(); err != nil {
		return
	}

	recordID, _ := h.store.LogConnect(id)
	h.store.LogAuditWithUser("terminal_connect", &id, srv.Name, userID, username)
	defer func() {
		if recordID > 0 {
			h.store.LogDisconnect(recordID)
		}
		h.store.LogAuditWithUser("terminal_disconnect", &id, srv.Name, userID, username)
	}()

	// Recording state
	var recMu sync.Mutex
	var recording bool
	var recID int
	var recStart time.Time
	var recBuf strings.Builder

	startRecording := func(cols, rows int) {
		recMu.Lock()
		defer recMu.Unlock()
		if recording {
			return
		}
		rid, err := h.store.CreateRecording(id, srv.Name, cols, rows)
		if err != nil {
			log.Printf("failed to create recording: %v", err)
			return
		}
		recID = rid
		recStart = time.Now()
		recBuf.Reset()
		// Write asciicast v2 header
		header := fmt.Sprintf(`{"version":2,"width":%d,"height":%d,"timestamp":%d,"title":"%s"}`, cols, rows, recStart.Unix(), srv.Name)
		recBuf.WriteString(header)
		recBuf.WriteString("\n")
		recording = true
		// Notify client
		wsConn.WriteMessage(websocket.TextMessage, []byte(`{"type":"recording_started","id":`+strconv.Itoa(rid)+`}`))
	}

	stopRecording := func() {
		recMu.Lock()
		defer recMu.Unlock()
		if !recording {
			return
		}
		recording = false
		// Flush buffer to DB
		if recBuf.Len() > 0 {
			h.store.AppendRecordingData(recID, recBuf.String())
			recBuf.Reset()
		}
		h.store.EndRecording(recID)
		// Notify client
		wsConn.WriteMessage(websocket.TextMessage, []byte(`{"type":"recording_stopped","id":`+strconv.Itoa(recID)+`}`))
	}

	appendOutput := func(data []byte) {
		recMu.Lock()
		defer recMu.Unlock()
		if !recording {
			return
		}
		elapsed := time.Since(recStart).Seconds()
		// Escape the data for JSON
		escaped, _ := json.Marshal(string(data))
		line := fmt.Sprintf("[%.6f, \"o\", %s]", elapsed, string(escaped))
		recBuf.WriteString(line)
		recBuf.WriteString("\n")
		// Flush periodically (every 64KB)
		if recBuf.Len() > 65536 {
			h.store.AppendRecordingData(recID, recBuf.String())
			recBuf.Reset()
		}
	}

	appendInput := func(data []byte) {
		recMu.Lock()
		defer recMu.Unlock()
		if !recording {
			return
		}
		elapsed := time.Since(recStart).Seconds()
		escaped, _ := json.Marshal(string(data))
		line := fmt.Sprintf("[%.6f, \"i\", %s]", elapsed, string(escaped))
		recBuf.WriteString(line)
		recBuf.WriteString("\n")
	}

	var once sync.Once
	done := make(chan struct{})
	closeDone := func() { once.Do(func() { close(done) }) }

	// SSH stdout -> WebSocket
	go func() {
		defer closeDone()
		buf := make([]byte, 8192)
		for {
			n, err := session.Read(buf)
			if n > 0 {
				data := buf[:n]
				appendOutput(data)
				if writeErr := wsConn.WriteMessage(websocket.BinaryMessage, data); writeErr != nil {
					return
				}
			}
			if err != nil {
				if err != io.EOF {
					log.Printf("ssh read error: %v", err)
				}
				return
			}
		}
	}()

	// WebSocket -> SSH stdin
	go func() {
		defer closeDone()
		for {
			msgType, msg, err := wsConn.ReadMessage()
			if err != nil {
				return
			}
			if msgType == websocket.TextMessage {
				var resize resizeMessage
				if json.Unmarshal(msg, &resize) == nil && resize.Type == "resize" && resize.Cols > 0 && resize.Rows > 0 {
					session.Resize(resize.Cols, resize.Rows)
					continue
				}
				var rec recordMessage
				if json.Unmarshal(msg, &rec) == nil {
					if rec.Type == "start_recording" {
						// Get current terminal size from the resize data or use defaults
						cols, rows := 80, 24
						startRecording(cols, rows)
						continue
					}
					if rec.Type == "stop_recording" {
						stopRecording()
						continue
					}
				}
			}
			appendInput(msg)
			session.Write(msg)
		}
	}()

	<-done
	// Stop recording on disconnect
	stopRecording()
}
