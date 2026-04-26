package terminal

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
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

type Handler struct {
	store     *config.Store
	sshClient *sshpkg.Client
}

func NewHandler(store *config.Store, sshClient *sshpkg.Client) *Handler {
	return &Handler{store: store, sshClient: sshClient}
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

	wsConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}
	defer wsConn.Close()

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
	defer func() {
		if recordID > 0 {
			h.store.LogDisconnect(recordID)
		}
	}()

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
				if writeErr := wsConn.WriteMessage(websocket.BinaryMessage, buf[:n]); writeErr != nil {
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
			}
			session.Write(msg)
		}
	}()

	<-done
}
