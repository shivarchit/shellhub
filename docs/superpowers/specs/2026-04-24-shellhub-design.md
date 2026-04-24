# ShellHub — Design Spec

## Overview

ShellHub is a lightweight web-based SSH client and server management tool written in Go with a React frontend. It lets you manage servers, open interactive SSH terminal sessions, and run saved quick commands — all from the browser.

## Architecture

**Go Backend** (`:8080`)
- `net/http` — REST API + static file serving
- `gorilla/websocket` — real-time terminal streaming (xterm.js ↔ SSH bridge)
- `golang.org/x/crypto/ssh` — SSH connections with password auth
- `gopkg.in/yaml.v3` — config read/write
- `go:embed` — embeds built React frontend into the binary for production

**React Frontend** (Vite + React + TypeScript)
- Tailwind CSS — modern dark dashboard styling
- xterm.js + xterm-addon-fit + xterm-addon-web-links — browser terminal
- React Router — page navigation
- REST for config CRUD, WebSocket for terminal sessions

**Production:** Single Go binary with embedded frontend assets.
**Development:** Vite dev server (`:5173`) proxying API calls to Go backend (`:8080`).

## Project Structure

```
shellhub/
├── main.go
├── go.mod
├── servers.yaml
├── internal/
│   ├── config/       # YAML read/write, server model
│   ├── ssh/          # SSH client, session management
│   ├── api/          # REST handlers (servers CRUD, quick commands, ping, exec)
│   └── terminal/     # WebSocket ↔ SSH pty bridge
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── src/
    │   ├── App.tsx
    │   ├── pages/
    │   │   ├── Dashboard.tsx    # Server list + detail panel
    │   │   └── Terminal.tsx     # Full terminal + command panel
    │   ├── components/
    │   │   ├── Sidebar.tsx
    │   │   ├── ServerDetail.tsx
    │   │   ├── CommandCard.tsx
    │   │   ├── CommandPanel.tsx  # Right-side panel in terminal view
    │   │   ├── ExecModal.tsx     # Quick command output modal
    │   │   └── AddEditServerModal.tsx
    │   └── lib/
    │       ├── api.ts           # REST client
    │       └── ws.ts            # WebSocket helpers
    └── dist/                    # Built output, embedded into Go binary
```

## YAML Config Format

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
      - name: "Restart AEM"
        command: "sudo systemctl restart aem"
        tag: "service"
```

## REST API

| Method   | Endpoint                     | Description                                      |
|----------|------------------------------|--------------------------------------------------|
| `GET`    | `/api/servers`               | List all servers                                 |
| `POST`   | `/api/servers`               | Add a new server                                 |
| `PUT`    | `/api/servers/:id`           | Update a server                                  |
| `DELETE` | `/api/servers/:id`           | Delete a server                                  |
| `POST`   | `/api/servers/:id/ping`      | TCP ping to SSH port, returns online/offline      |
| `POST`   | `/api/servers/:id/exec`      | Run a quick command non-interactively, return output |

Server IDs are array indices (0-based) — simple and sufficient for a personal tool.

## WebSocket Protocol

**Endpoint:** `ws://localhost:8080/api/terminal/:id`

- On connect: Go opens SSH session, allocates pty, starts shell
- Client → Server: keystrokes as raw bytes
- Server → Client: SSH stdout/stderr as raw bytes
- Resize: client sends JSON `{"type":"resize","cols":120,"rows":36}`
- On disconnect: SSH session closed, resources freed

## Pages & UI

### Dashboard (Sidebar + Detail Panel)

**Sidebar:**
- Logo + app name header
- Search bar to filter servers
- Servers grouped by `group` field (Production, Staging, Dev)
- Group labels with server count badges
- When a server is selected: all non-active items dim to grey; hover restores color
- Active server has green left-border glow (online) or red (offline)
- Status dots: green = online (with glow), red = offline (with glow)
- "+ Add Server" button at bottom

**Detail Panel:**
- Server name + Online/Offline badge (green/red with glow)
- Info grid: host, port, username, command count
- Quick commands grid: cards with name, command preview, run button, tag
- Recent activity log: color-coded left borders (green=success, red=error, amber=warning)
- Action buttons: Open Terminal, Edit, Delete (red-themed)

### Terminal (Full Width, No Sidebar)

**Connection bar (top):**
- "Back to Dashboard" button
- Green connected badge with pulsing dot
- Server name + connection details + session timer
- Red "Disconnect" button

**Terminal area:**
- Full xterm.js terminal filling the width (minus command panel)
- Status bar at bottom: connection info, terminal size, elapsed time

**Command panel (right side, 280px):**
- Collapsible with close button
- Lists all saved quick commands for the connected server
- Each command has two actions: "Paste to Terminal" (injects text into active session) and "Run Now" (executes via /exec endpoint independently)
- "Last Execution" section shows most recent command output preview

### Quick Command Execution (from Dashboard)

- Clicking "Run" on a command card from the dashboard triggers `/api/servers/:id/exec`
- Card shows real-time state: idle → running (amber animated bar) → done (green glow) or failed (red glow)
- Output modal appears with: command, exit status (green/red icon), formatted output, timestamp, duration
- Modal actions: Copy Output, Re-run, Close

### Add/Edit Server Modal

- Fields: Name, Host, Port (default 22), Username, Password, Group
- Quick Commands section: add/remove named commands (name + command + tag)
- Save persists to YAML via API

## Color System

The UI uses a dark theme with strong red/green contextual signaling:

- **Green:** online, connected, success, done, active server
- **Red:** offline, disconnected, failed, error, delete actions
- **Amber:** running/in-progress, warnings, slow execution
- **Blue:** primary actions, navigation, links

All status colors have dim backgrounds, border tints, and glow shadows for visual emphasis.

## Design Mockups

Visual mockups were created during the brainstorming phase and can be found in the `.superpowers/brainstorm/` directory.

## Verification Plan

1. `go build` produces a single binary
2. Start the binary, open browser to `:8080`
3. Add a server via the web UI, verify it appears in `servers.yaml`
4. Edit and delete servers, verify YAML updates
5. Click "Open Terminal" — verify xterm.js connects and commands work interactively
6. Run a quick command from the dashboard — verify output modal shows correct results
7. Use "Paste to Terminal" in the command panel — verify text appears in the active session
8. Test with an unreachable server — verify offline status, red indicators, connection error messages
9. Resize browser window — verify terminal resizes correctly
10. Build production binary with embedded frontend — verify single binary serves everything
