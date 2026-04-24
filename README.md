# ShellHub

A lightweight web-based SSH client and server management tool. Connect to your servers, run commands, and manage quick shortcuts — all from the browser.

Built with Go + React. Ships as a single binary.

## Features

- **Server Dashboard** — manage servers grouped by environment, see online/offline status at a glance
- **Interactive Terminal** — full xterm.js terminal in the browser with color support, resize, and tab completion
- **Quick Commands** — save named commands per server (flush cache, restart service, tail logs) and run them with one click
- **Command Execution** — run quick commands from the dashboard without opening a full terminal session, see output in a modal
- **Single Binary** — Go embeds the entire React frontend, deploy one file and you're done
- **YAML Config** — servers and commands stored in a simple YAML file, editable from the UI or by hand

## Quick Start

### From binary

```bash
# Copy the example config
cp servers.example.yaml servers.yaml

# Edit with your servers
vim servers.yaml

# Run
./shellhub
```

Open `http://localhost:8080` in your browser.

### From source

```bash
# Prerequisites: Go 1.22+, Node 18+

# Build everything (frontend + Go binary)
make build

# Copy and edit config
cp servers.example.yaml servers.yaml

# Run
./shellhub.exe
```

### Development mode

Run the Go backend and Vite dev server separately for hot reload:

```bash
# Terminal 1: Go backend
go run . -dev

# Terminal 2: React frontend (proxies API to :8080)
cd frontend && npm run dev
```

Open `http://localhost:5173` for the frontend with hot reload.

## Configuration

Copy `servers.example.yaml` to `servers.yaml` and add your servers:

```yaml
servers:
  - name: "Production AEM"
    host: "10.0.1.50"
    port: 22
    username: "admin"
    password: "mypassword123"
    group: "Production"
    quick_commands:
      - name: "Flush Cache"
        command: "sudo /opt/aem/crx-quickstart/bin/flush-cache.sh"
        tag: "cache"
      - name: "Restart Apache"
        command: "sudo systemctl restart apache2"
        tag: "service"
```

You can also add, edit, and delete servers from the web UI — changes are saved back to the YAML file.

> **Note:** `servers.yaml` contains plaintext passwords and is gitignored. Never commit it.

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `8080` | HTTP server port |
| `-config` | `servers.yaml` | Path to the YAML config file |
| `-dev` | `false` | Development mode (skip embedded frontend) |

## Tech Stack

**Backend:** Go, net/http, gorilla/websocket, golang.org/x/crypto/ssh, gopkg.in/yaml.v3

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, xterm.js, React Router

## Project Structure

```
shellhub/
├── main.go                 # Entry point, routing, embedded frontend
├── servers.example.yaml    # Example config (copy to servers.yaml)
├── Makefile                # Build commands
├── internal/
│   ├── config/             # YAML config store
│   ├── ssh/                # SSH client + interactive session
│   ├── api/                # REST API handlers
│   └── terminal/           # WebSocket ↔ SSH bridge
└── frontend/
    └── src/
        ├── pages/          # Dashboard, Terminal
        ├── components/     # Sidebar, CommandCard, ExecModal, etc.
        └── lib/            # API client, types, WebSocket helpers
```
