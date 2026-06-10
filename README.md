# ShellHub

A lightweight web-based SSH client and server management tool. Connect to your servers, run commands, and manage quick shortcuts — all from the browser.

Built with Go + React. Ships as a single binary with system tray support.

## Features

### Core
- **Server Dashboard** — manage servers grouped by environment, see online/offline status at a glance
- **Interactive Terminal** — full xterm.js terminal in the browser with color support, resize, and tab completion
- **Quick Commands** — save named commands per server (flush cache, restart service, tail logs) and run them with one click
- **Command Execution** — run quick commands from the dashboard without opening a full terminal session, see output in a modal
- **SSH Key Auth** — supports both password and private key authentication
- **System Tray App** — runs in the system tray with no console window. Right-click for "Open in Browser" and "Stop Server"
- **Single Binary** — Go embeds the entire React frontend, deploy one file and you're done
- **SQLite Storage** — servers and commands stored in a local SQLite database, managed entirely from the web UI
- **YAML Import** — optionally bootstrap from a `servers.yaml` file on first run

### Authentication & Security
- **Login System** — username/password authentication with bcrypt password hashing
- **Session Tokens** — HMAC-SHA256 tokens in httpOnly cookies (24h expiry)
- **Encrypted Credentials** — server passwords and SSH keys encrypted at rest with AES-256-GCM
- **Rate Limiting** — accounts locked after 5 failed login attempts in 10 minutes (auto-unlock after 30 min)
- **Superadmin** — first user auto-promoted to superadmin with full access
- **Login Audit** — all login attempts (success/failure) logged with IP and user agent
- **Copy on Select** — terminal auto-copies selected text, Ctrl+C copies when text selected (SIGINT otherwise)

### User Management & Permissions
- **Role-Based Access** — superadmin and user roles with granular permission control
- **Per-User Permissions** — toggle access to: terminal, commands, server management, recordings, metrics, audit, database browser
- **Server Assignment** — assign specific servers to each user (superadmin sees all)
- **User CRUD** — create, delete users, change roles from Settings > Users tab
- **Change Password** — all users can change their own password from Settings > Security
- **Audit Trail with User** — all actions and commands tracked with who performed them

### Terminal Power
- **Multi-Tab Terminals** — open multiple terminal sessions simultaneously (Ctrl+T to open, Ctrl+W to close, Ctrl+1-9 to switch)
- **Terminal Search** — Ctrl+F to search scrollback with regex, case sensitivity, and match navigation
- **Session Recording** — record terminal sessions in asciicast v2 format with one-click toggle
- **Recording Playback** — full player with play/pause, speed control (0.5x-4x), seek bar, and idle-skip
- **Download Recordings** — export as `.cast` files compatible with asciinema

### Commands & Audit
- **Global Commands** — define commands shared across all servers, managed in Settings
- **Command Templates** — use `{{variable}}` or `{{variable:default}}` syntax for parameterized commands
- **Built-in Variables** — auto-resolve `{{hostname}}`, `{{username}}`, `{{port}}`, `{{date}}`, `{{server_name}}`
- **Full Audit Trail** — dedicated `/audit` page with Commands and Actions tabs, filtering, search, pagination, CSV export
- **User Attribution** — every audit entry shows which user performed the action (including terminal connect/disconnect)
- **Command Name Tracking** — audit trail distinguishes between command name (friendly label) and command text (actual shell command)
- **Destructive Command Protection** — confirms before running commands containing `rm -rf`, `drop`, etc.

### Help & Documentation
- **In-App Guide** — built-in `/guide` page with step-by-step instructions for every feature
- **Section Icons** — visual section headers with numbered steps, tips, and keyboard shortcuts
- **Keyboard Shortcut Reference** — quick reference for all terminal and navigation shortcuts

### Monitoring & Metrics
- **Server Stats Widgets** — CPU, memory, disk usage, uptime, and load average per server (fetched on select)
- **Metrics Dashboard** — historical charts for uptime %, connections, command execution rates, and latency
- **Time Range Selector** — view metrics for last 24h, 7d, or 30d
- **Background Ping** — configurable interval records uptime and latency to ping_history
- **CSS/SVG Charts** — lightweight visualization with no external charting libraries

### Admin Tools
- **Database Browser** — browse all SQLite tables and data from Settings > Database tab (superadmin only)
- **User Management** — create users, assign roles, set permissions, assign servers (superadmin only)
- **Export / Import** — backup and restore your server configs as JSON

### Organization
- **Drag & Drop** — reorder servers within groups by dragging
- **Toast Notifications** — real-time feedback when commands complete
- **Keyboard Shortcuts** — `Ctrl+K` to focus server search

## Quick Start

### From binary

Just double-click `shellhub.exe` (or run `./shellhub` on Linux/macOS).

On first launch:
1. A folder picker dialog asks where to store your data
2. ShellHub binds to **http://localhost:8080** (auto-falls-back to 8081, 8082… if 8080 is busy)
3. Your browser opens automatically to the dashboard
4. **Sign in with the default superadmin account:**
   - **Username:** `admin`
   - **Password:** `admin123`
   - ⚠️ Change this immediately from **Settings → Security**
5. A tray icon appears — right-click for *Open in Browser* / *Stop Server*

Add servers from the browser. Everything is stored in `shellhub.db` in the folder you chose.

```
your-chosen-folder/
└── shellhub.db      ← auto-created, stores all server configs

%APPDATA%/ShellHub/  (Windows) or ~/.config/shellhub/ (Linux/macOS)
└── settings.json    ← remembers your chosen DB location + port
```

### Changing the port

Pick any of the following — all of them persist for future launches:

```bash
# Option 1: pass -port once, it gets saved to settings.json
shellhub.exe -port 9000

# Option 2: edit settings.json directly
# %APPDATA%/ShellHub/settings.json   (Windows)
# ~/.config/shellhub/settings.json   (Linux/macOS)
{
  "db_path": "C:\\Users\\me\\ShellHub\\shellhub.db",
  "port": 9000
}
```

If the chosen port is in use, ShellHub automatically picks the next free port in `[port, port+20]` and saves it. The current URL is shown in the tray tooltip and as a (disabled) menu entry.

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

## User Roles & Permissions

| Permission | Superadmin | Default User |
|------------|:----------:|:------------:|
| Open Terminal | Yes | Yes |
| Execute Commands | Yes | Yes |
| Manage Servers | Yes | No |
| View Recordings | Yes | No |
| View Metrics | Yes | No |
| View Audit Trail | Yes | No |
| View Database | Yes | No |
| Manage Users | Yes | No |

Superadmin can toggle any permission per user from Settings > Users > Permissions.

Regular users only see servers assigned to them by the superadmin.

## Settings

Access settings via the gear icon in the sidebar or navigate to `/settings`.

**General:**
- Ping Interval — how often to check server online/offline status (default: 30 minutes)
- Export/Import — backup and restore server configs as JSON

**Commands:**
- Global Commands — create, edit, delete commands shared across all servers
- Template Support — mark commands as templates with variable placeholders

**Security:**
- Change Password — update your own password
- Login Attempts — view all login attempts with success/failure status
- Security Info — overview of encryption and auth measures in place

**Database** (superadmin only):
- Browse all SQLite tables
- View rows with pagination

**Users** (superadmin only):
- Create/delete users
- Change roles (superadmin/user)
- Set granular permissions per user
- Assign server access per user

## Storage

On first launch, ShellHub asks you to pick a folder for the database. The choice is saved to `settings.json` in your OS config directory (`%APPDATA%\ShellHub` on Windows, `~/.config/shellhub` on Linux/macOS) and remembered on restart.

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
    auth_type: "password"          # or "key" for SSH key auth
    private_key: ""                # PEM-encoded private key (when auth_type is "key")
    quick_commands:
      - name: "Flush Cache"
        command: "sudo /opt/aem/crx-quickstart/bin/flush-cache.sh"
        tag: "cache"
      - name: "Restart Apache"
        command: "sudo systemctl restart apache2"
        tag: "service"
```

See `servers.example.yaml` for a full example with multiple servers.

> **Note:** `servers.yaml` and `shellhub.db` contain credentials and are gitignored.

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/status` | Auth status check |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register (first user only) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user info + permissions |
| PUT | `/api/auth/password` | Change own password |

### User Management (superadmin)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| DELETE | `/api/users/{id}` | Delete user |
| PUT | `/api/users/{id}/role` | Update user role |
| GET | `/api/users/{id}/servers` | Get assigned servers |
| PUT | `/api/users/{id}/servers` | Set assigned servers |
| PUT | `/api/users/{id}/permissions` | Update user permissions |

### Servers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers` | List servers (filtered by access) |
| POST | `/api/servers` | Create server |
| PUT | `/api/servers/{id}` | Update server |
| DELETE | `/api/servers/{id}` | Delete server |
| PUT | `/api/servers/reorder` | Reorder servers |
| POST | `/api/servers/{id}/ping` | Check server online status |
| POST | `/api/servers/{id}/exec` | Execute command on server |
| GET | `/api/servers/{id}/stats` | Get live server stats |
| GET | `/api/servers/{id}/history` | Connection history |
| GET | `/api/servers/{id}/exec-history` | Execution history |

### Commands & Audit
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/global-commands` | List global commands |
| POST | `/api/global-commands` | Create global command |
| PUT | `/api/global-commands/{id}` | Update global command |
| DELETE | `/api/global-commands/{id}` | Delete global command |
| GET | `/api/exec-history` | Full exec history (paginated) |
| GET | `/api/exec-history/export` | Export exec history as CSV |
| GET | `/api/audit-log` | Audit log entries |

### Recordings & Metrics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/recordings` | List session recordings |
| GET | `/api/recordings/{id}` | Get recording with data |
| DELETE | `/api/recordings/{id}` | Delete recording |
| GET | `/api/metrics` | Metrics dashboard data |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/db/tables` | List database tables |
| GET | `/api/db/query` | Query table data |
| GET | `/api/settings` | Get app settings |
| PUT | `/api/settings` | Update settings |
| GET | `/api/export` | Export all data as JSON |
| POST | `/api/import` | Import data from JSON |

### WebSocket
| Method | Path | Description |
|--------|------|-------------|
| WS | `/api/terminal/{id}` | Interactive terminal session |

## Cross-Platform Builds

ShellHub uses pure-Go SQLite (no CGO), so cross-compilation works out of the box. Windows builds include `-H windowsgui` to hide the console window and embed the application icon.

All build scripts live in the `build/` directory:

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

Cross-platform binaries land in `build/dist/`. Each is a self-contained single file.

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `8080` | HTTP server port |
| `-db` | `shellhub.db` | Path to the SQLite database file (overrides saved setting) |
| `-dev` | `false` | Development mode (console output, no tray, no folder picker) |

## Tech Stack

**Backend:** Go 1.25, net/http, gorilla/websocket, golang.org/x/crypto/ssh, modernc.org/sqlite, getlantern/systray, sqweek/dialog

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, xterm.js, @xterm/addon-search, React Router, @dnd-kit

## Project Structure

```
shellhub/
├── main.go                 # Entry point, routing, background ping, embedded frontend
├── servers.example.yaml    # Example config for YAML import
├── assets/
│   └── shellhub.ico        # Application icon source
├── build/
│   ├── build.ps1           # PowerShell build script (Windows)
│   ├── Makefile            # Make build script (Linux/macOS)
│   └── dist/               # Cross-platform binaries (gitignored)
├── internal/
│   ├── auth/               # Authentication, RBAC, encryption, permissions
│   ├── config/             # SQLite store, schema, migrations, CRUD
│   ├── settings/           # Persisted app settings (DB path)
│   ├── ssh/                # SSH client (password + key auth)
│   ├── api/                # REST handlers, stats, metrics, DB browser
│   ├── terminal/           # WebSocket ↔ SSH bridge with recording
│   └── tray/               # System tray icon + menu
└── frontend/
    └── src/
        ├── pages/          # Dashboard, Terminal, Settings, Login, Audit, Recordings, Metrics
        ├── components/     # Sidebar, TabBar, TerminalSearch, ServerStatsWidget, etc.
        └── lib/            # API client, types, auth context, templates, WebSocket
```
