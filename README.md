# ShellHub

A lightweight web-based SSH client and server management tool. Connect to your servers, run commands, and manage quick shortcuts — all from the browser.

Built with Go + React. Ships as a single binary with system tray support.

## Features

- **Server Dashboard** — manage servers grouped by environment, see online/offline status at a glance
- **Interactive Terminal** — full xterm.js terminal in the browser with color support, resize, and tab completion
- **Quick Commands** — save named commands per server (flush cache, restart service, tail logs) and run them with one click
- **Command Execution** — run quick commands from the dashboard without opening a full terminal session, see output in a modal
- **System Tray App** — runs in the system tray with no console window. Right-click for "Open in Browser" and "Stop Server"
- **Single Binary** — Go embeds the entire React frontend, deploy one file and you're done
- **SQLite Storage** — servers and commands stored in a local SQLite database, managed entirely from the web UI
- **YAML Import** — optionally bootstrap from a `servers.yaml` file on first run

## Quick Start

### From binary

Just double-click `shellhub.exe` (or run `./shellhub` on Linux/macOS).

On first launch:
1. A folder picker dialog asks where to store your data
2. Your browser opens automatically to the dashboard
3. A tray icon appears — right-click it to open the browser or stop the server

Add servers from the browser. Everything is stored in `shellhub.db` in the folder you chose.

```
your-chosen-folder/
└── shellhub.db      ← auto-created, stores all server configs

next-to-exe/
├── shellhub.exe
└── shellhub-settings.json   ← remembers your chosen DB location
```

### Import from YAML (optional)

If you have existing server configs, place a `servers.yaml` next to the database before first run:

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
cd build
./build.ps1 build

# Linux / macOS
cd build
make build
```

### Development mode

Run the Go backend and Vite dev server separately for hot reload:

```bash
# Terminal 1: Go backend (console mode, no tray)
go run . -dev

# Terminal 2: React frontend (proxies API to :8080)
cd frontend && npm run dev
```

Open `http://localhost:5173` for the frontend with hot reload.

## Storage

On first launch, ShellHub asks you to pick a folder for the database. The choice is saved to `shellhub-settings.json` next to the exe and remembered on restart.

You can override the DB location with the `-db` flag:

```bash
./shellhub -db /path/to/my/shellhub.db
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

> **Note:** `servers.yaml`, `shellhub.db`, and `shellhub-settings.json` contain credentials and are gitignored.

## Cross-Platform Builds

ShellHub uses pure-Go SQLite (no CGO), so cross-compilation works out of the box. Windows builds include `-H windowsgui` to hide the console window.

All build scripts live in the `build/` directory. Run them from there:

**PowerShell (Windows):**

```powershell
cd build
./build.ps1 build-all       # all 5 platforms

./build.ps1 windows         # build/dist/shellhub-windows-amd64.exe
./build.ps1 linux           # build/dist/shellhub-linux-amd64
./build.ps1 linux-arm       # build/dist/shellhub-linux-arm64
./build.ps1 mac             # build/dist/shellhub-darwin-amd64
./build.ps1 mac-arm         # build/dist/shellhub-darwin-arm64
```

**Bash (Linux / macOS):**

```bash
cd build
make build-all              # all 5 platforms

make build-windows          # build/dist/shellhub-windows-amd64.exe
make build-linux            # build/dist/shellhub-linux-amd64
make build-linux-arm        # build/dist/shellhub-linux-arm64
make build-mac              # build/dist/shellhub-darwin-amd64
make build-mac-arm          # build/dist/shellhub-darwin-arm64
```

Cross-platform binaries land in `build/dist/`. Each is a self-contained single file — copy it to the target machine and run.

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `8080` | HTTP server port |
| `-db` | `shellhub.db` | Path to the SQLite database file (overrides saved setting) |
| `-dev` | `false` | Development mode (console output, no tray, no folder picker) |

## Tech Stack

**Backend:** Go, net/http, gorilla/websocket, golang.org/x/crypto/ssh, modernc.org/sqlite, getlantern/systray

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, xterm.js, React Router

## Project Structure

```
shellhub/
├── main.go                 # Entry point, routing, embedded frontend
├── servers.example.yaml    # Example config for YAML import
├── build/
│   ├── build.ps1           # PowerShell build script (Windows)
│   ├── Makefile            # Make build script (Linux/macOS)
│   └── dist/               # Cross-platform binaries (gitignored)
├── internal/
│   ├── config/             # SQLite store + YAML import
│   ├── settings/           # Persisted app settings (DB path)
│   ├── ssh/                # SSH client + interactive session
│   ├── api/                # REST API handlers
│   ├── terminal/           # WebSocket ↔ SSH bridge
│   └── tray/               # System tray icon + menu
└── frontend/
    └── src/
        ├── pages/          # Dashboard, Terminal
        ├── components/     # Sidebar, CommandCard, ExecModal, etc.
        └── lib/            # API client, types, WebSocket helpers
```
