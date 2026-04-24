# ShellHub

A lightweight web-based SSH client and server management tool. Connect to your servers, run commands, and manage quick shortcuts — all from the browser.

Built with Go + React. Ships as a single binary.

## Features

- **Server Dashboard** — manage servers grouped by environment, see online/offline status at a glance
- **Interactive Terminal** — full xterm.js terminal in the browser with color support, resize, and tab completion
- **Quick Commands** — save named commands per server (flush cache, restart service, tail logs) and run them with one click
- **Command Execution** — run quick commands from the dashboard without opening a full terminal session, see output in a modal
- **Single Binary** — Go embeds the entire React frontend, deploy one file and you're done
- **SQLite Storage** — servers and commands stored in a local SQLite database, managed entirely from the web UI
- **YAML Import** — optionally bootstrap from a `servers.yaml` file on first run

## Quick Start

### From binary

```bash
# Just run it
./shellhub
```

Open `http://localhost:8080` and add servers from the browser. Everything is stored in `shellhub.db` alongside the binary.

### Import from YAML (optional)

If you have existing server configs, place a `servers.yaml` next to the binary before first run:

```bash
cp servers.example.yaml servers.yaml
vim servers.yaml   # fill in your real servers
./shellhub         # auto-imports into SQLite on first start
```

The YAML is only read once — when the database is empty. After import, all changes go through the web UI into SQLite.

### From source

```bash
# Prerequisites: Go 1.22+, Node 18+

# Windows (PowerShell)
./build.ps1 build

# Linux / macOS
make build
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

## Storage

ShellHub uses a local SQLite database (`shellhub.db`) created automatically next to the binary. Add, edit, and delete servers entirely from the web UI.

```
my-folder/
├── shellhub.exe     ← the binary
└── shellhub.db      ← auto-created on first run
```

### YAML Import

On startup, if a `servers.yaml` exists next to the database and the database has no servers yet, ShellHub auto-imports from the YAML:

```yaml
servers:
  - name: "Production AEM"
    host: "10.0.1.50"
    port: 22
    username: "admin"
    password: "changeme"
    group: "Production"
    quick_commands:
      - name: "Flush Cache"
        command: "sudo /opt/aem/crx-quickstart/bin/flush-cache.sh"
        tag: "cache"
      - name: "Restart Apache"
        command: "sudo systemctl restart apache2"
        tag: "service"
```

See `servers.example.yaml` for a full example with multiple servers.

> **Note:** Both `servers.yaml` and `shellhub.db` contain credentials and are gitignored.

## Cross-Platform Builds

ShellHub uses pure-Go SQLite (no CGO), so cross-compilation works out of the box.

**PowerShell (Windows):**

```powershell
./build.ps1 build-all       # all 5 platforms

./build.ps1 windows         # dist/shellhub-windows-amd64.exe
./build.ps1 linux           # dist/shellhub-linux-amd64
./build.ps1 linux-arm       # dist/shellhub-linux-arm64
./build.ps1 mac             # dist/shellhub-darwin-amd64
./build.ps1 mac-arm         # dist/shellhub-darwin-arm64
```

**Bash (Linux / macOS):**

```bash
make build-all              # all 5 platforms

make build-windows          # dist/shellhub-windows-amd64.exe
make build-linux            # dist/shellhub-linux-amd64
make build-linux-arm        # dist/shellhub-linux-arm64
make build-mac              # dist/shellhub-darwin-amd64
make build-mac-arm          # dist/shellhub-darwin-arm64
```

All binaries land in the `dist/` folder. Each is a self-contained single file — copy it to the target machine and run.

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `8080` | HTTP server port |
| `-db` | `shellhub.db` | Path to the SQLite database file |
| `-dev` | `false` | Development mode (skip embedded frontend) |

## Tech Stack

**Backend:** Go, net/http, gorilla/websocket, golang.org/x/crypto/ssh, modernc.org/sqlite

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, xterm.js, React Router

## Project Structure

```
shellhub/
├── main.go                 # Entry point, routing, embedded frontend
├── servers.example.yaml    # Example config for YAML import
├── Makefile                # Build commands
├── internal/
│   ├── config/             # SQLite store + YAML import
│   ├── ssh/                # SSH client + interactive session
│   ├── api/                # REST API handlers
│   └── terminal/           # WebSocket ↔ SSH bridge
└── frontend/
    └── src/
        ├── pages/          # Dashboard, Terminal
        ├── components/     # Sidebar, CommandCard, ExecModal, etc.
        └── lib/            # API client, types, WebSocket helpers
```
