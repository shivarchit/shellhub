# ShellHub Documentation

[← Back to README](../README.md)

Full reference for installing, configuring, and building ShellHub.

## Contents

- [Installation](#installation)
  - [macOS](#macos)
  - [Windows](#windows)
  - [Linux](#linux)
  - [From Source](#from-source)
- [Changing the Port](#changing-the-port)
- [Import from YAML](#import-from-yaml)
- [Themes](#themes)
- [User Roles & Permissions](#user-roles--permissions)
- [Settings](#settings)
- [Storage](#storage)
- [API Endpoints](#api-endpoints)
- [Cross-Platform Builds](#cross-platform-builds)
- [CLI Flags](#cli-flags)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)

## Installation

Pick your platform below. Whichever you choose, ShellHub asks once where to keep `shellhub.db`, then serves the web UI.

### Install Script

The quickest path on any platform — downloads the latest release binary, verifies its checksum, and puts it on your PATH:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/shivarchit/shellhub/main/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/shivarchit/shellhub/main/install.ps1 | iex
```

Both scripts honor two environment variables: `SHELLHUB_VERSION` pins a specific release (for example `v0.1.0`), and `SHELLHUB_INSTALL_DIR` overrides the install location. The shell script installs to `/usr/local/bin` when writable, otherwise `~/.local/bin`; the PowerShell script installs to `%LOCALAPPDATA%\ShellHub` and adds it to your user PATH. Prefer a packaged installer? Use the per-platform steps below.

### macOS

1. Download `ShellHub.dmg` and double-click to mount it.
2. Drag **ShellHub.app** into your **Applications** folder.
3. These builds are not code-signed, so Gatekeeper blocks the first open. Right-click (or Control-click) **ShellHub.app**, choose **Open**, then confirm **Open** in the dialog. macOS remembers the choice on later launches.
4. On first run, pick a folder for `shellhub.db` when prompted.

Settings live at `~/.config/shellhub/settings.json` (or `$XDG_CONFIG_HOME/shellhub/settings.json` when that variable is set).

### Windows

**Installer** — run `ShellHub-Setup.exe` (NSIS). It installs ShellHub and creates Start Menu and desktop shortcuts.

**Portable** — download `shellhub-windows-amd64.exe` and run it directly; nothing to install.

SmartScreen may warn on the unsigned build — click **More info → Run anyway** to continue. On first run, pick a folder for `shellhub.db` when prompted.

Settings live at `%APPDATA%\ShellHub\settings.json` (typically `C:\Users\<you>\AppData\Roaming\ShellHub\settings.json`).

### Linux

**Debian / Ubuntu:**

```bash
sudo dpkg -i shellhub_<version>_amd64.deb
shellhub
```

**Fedora / RHEL / openSUSE:**

```bash
sudo rpm -i shellhub-<version>.x86_64.rpm
shellhub
```

**Raw binary:**

```bash
chmod +x shellhub-linux-amd64
./shellhub-linux-amd64
```

The tray icon uses the standard `libappindicator` / GTK stack. Minimal and headless installs may lack those libraries — ShellHub still serves the web UI, it just skips the tray icon. Settings live at `~/.config/shellhub/settings.json` (or `$XDG_CONFIG_HOME/shellhub/settings.json`).

### From Source

Prerequisites: **Go 1.25+** and **Node 18+**.

```bash
# Windows (PowerShell)
cd build
./build.ps1 build

# Linux / macOS
cd build
make build
```

**Development mode** — run the Go backend and the Vite dev server separately for hot reload:

```bash
# Terminal 1: Go backend (console mode, no tray, no folder picker)
go run . -dev

# Terminal 2: React frontend (proxies API to :8080)
cd frontend && npm run dev
```

Open `http://localhost:5173` for the hot-reloading frontend.

## Changing the Port

Two ways to move ShellHub off port 8080. Either one persists across launches.

Pass `-port` once — the value is saved to `settings.json`:

```bash
shellhub -port 9000
```

Or edit `settings.json` directly (`%APPDATA%\ShellHub\settings.json` on Windows, `~/.config/shellhub/settings.json` on Linux/macOS):

```json
{
  "db_path": "C:\\Users\\me\\ShellHub\\shellhub.db",
  "port": 9000
}
```

If the chosen port is in use, ShellHub picks the next free port in the range `[port, port+20]` and saves it. The current URL appears in the tray tooltip and as a disabled menu entry.

## Import from YAML

Seed a fresh database from existing server configs by placing `servers.yaml` next to the database before first run:

```bash
cp servers.example.yaml servers.yaml
vim servers.yaml   # fill in your real servers
./shellhub         # auto-imports into SQLite on first start
```

Each entry describes one server and, optionally, its quick commands:

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

See `servers.example.yaml` for a longer example covering multiple servers.

The YAML is read only once, when the database is empty. After import, every change goes through the web UI into SQLite.

> **Note:** `servers.yaml` and `shellhub.db` hold credentials and are gitignored.

## Themes

Switch between six color themes from **Settings → General**. The change applies instantly and is persisted.

| Theme | Description |
|-------|-------------|
| dark | Default deep-navy dark theme with blue and green accents |
| midnight | Near-black background with indigo accents for low-light rooms |
| light | Clean high-contrast light theme for bright environments |
| nord | Muted arctic blue-grey palette from the Nord scheme |
| dracula | Warm purple-and-pink dark theme from the Dracula scheme |
| matrix | High-contrast black-and-green terminal look |

## User Roles & Permissions

ShellHub has two roles — superadmin and user — plus per-user permission flags that decide what each account can reach.

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

A superadmin toggles any permission per user from **Settings → Users → Permissions**. The first user registered is auto-promoted to superadmin with full access.

API middleware enforces the flags server-side and returns 403 on denial — metrics, audit, recordings, the database browser, command execution, file access, and terminal access are gated in the API, not merely hidden in the UI. Regular users see only the servers a superadmin assigned to them, and the Open Terminal permission also gates the file browser.

Sessions are HMAC-SHA256 tokens in httpOnly cookies with a 4h sliding expiry: they auto-renew while active and require re-login after 4h idle. Logout and password changes revoke them server-side.

## Settings

Open settings from the gear icon in the sidebar, or go to `/settings` directly.

**General:**
- Ping Interval — how often to check server online/offline status (default: 30 minutes)
- Theme — dark, midnight, light, nord, dracula, or matrix, applied instantly and persisted
- Export/Import — back up and restore server configs as JSON

**Commands:**
- Global Commands — create, edit, and delete commands shared across all servers
- Template Support — mark commands as templates with variable placeholders

**Security:**
- Change Password — update your own password
- Login Attempts — every login attempt with its success/failure status
- Security Info — overview of the encryption and auth measures in place

**Database** (requires View Database permission):
- Browse all SQLite tables
- Page through rows

**Users** (superadmin only):
- Create and delete users
- Change roles (superadmin/user)
- Set granular permissions per user
- Assign server access per user

## Storage

On first launch, ShellHub asks for a folder to hold the database. It saves that choice to `settings.json` in your OS config directory (`%APPDATA%\ShellHub` on Windows, `~/.config/shellhub` on Linux/macOS) and reuses it on restart.

```
your-chosen-folder/
└── shellhub.db      ← auto-created, stores all server configs

%APPDATA%\ShellHub\  (Windows) or ~/.config/shellhub/ (Linux/macOS)
└── settings.json    ← remembers your chosen DB location + port
```

Override the database location with the `-db` flag:

```bash
./shellhub -db /path/to/my/shellhub.db
```

Server passwords and SSH keys are encrypted at rest with AES-256-GCM. Five failed login attempts within 10 minutes lock an account, which unlocks automatically after 30 minutes. Every login attempt is logged with its IP and user agent.

## API Endpoints

Every route below is relative to the server address, for example `http://localhost:8080/api/servers`.

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

### Files (SFTP)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/{id}/files` | List directory contents |
| GET | `/api/servers/{id}/files/download` | Download a file |
| POST | `/api/servers/{id}/files/upload` | Upload files (multipart) |
| DELETE | `/api/servers/{id}/files` | Delete a file or directory |
| POST | `/api/servers/{id}/files/mkdir` | Create a directory |

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

ShellHub uses pure-Go SQLite (no CGO), so cross-compilation works out of the box. Windows builds pass `-H windowsgui` to hide the console window and embed the application icon.

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

Binaries land in `build/dist/`, each a self-contained single file.

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-port` | `8080` | HTTP server port |
| `-db` | `shellhub.db` | Path to the SQLite database file (overrides saved setting) |
| `-dev` | `false` | Development mode (console output, no tray, no folder picker) |
| `-version` | — | Print the ShellHub version and exit |

## Tech Stack

**Backend:** Go 1.25, net/http, gorilla/websocket, golang.org/x/crypto/ssh, github.com/pkg/sftp, modernc.org/sqlite, getlantern/systray, sqweek/dialog

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, xterm.js, @xterm/addon-search, React Router, @dnd-kit

## Project Structure

```
shellhub/
├── main.go                 # Entry point, routing, background ping, embedded frontend
├── servers.example.yaml    # Example config for YAML import
├── assets/
│   ├── shellhub.ico        # Application icon source
│   ├── banner.svg          # README hero banner
│   └── demo.svg            # Animated startup demo
├── build/
│   ├── build.ps1           # PowerShell build script (Windows)
│   ├── Makefile            # Make build script (Linux/macOS)
│   └── dist/               # Cross-platform binaries (gitignored)
├── internal/
│   ├── auth/               # Authentication, RBAC, encryption, permissions
│   ├── config/             # SQLite store, schema, migrations, CRUD
│   ├── settings/           # Persisted app settings (DB path, port)
│   ├── ssh/                # SSH client (password + key auth)
│   ├── api/                # REST handlers, stats, metrics, DB browser
│   │   └── sftp.go         # SFTP file browser handlers
│   ├── terminal/           # WebSocket ↔ SSH bridge with recording
│   └── tray/               # System tray icon + menu
└── frontend/
    └── src/
        ├── pages/          # Dashboard, Terminal, Files, Settings, Login, Audit, Recordings, Metrics
        ├── components/     # Sidebar, TabBar, TerminalSearch, ServerStatsWidget, BroadcastModal, etc.
        └── lib/            # API client, types, auth context, templates, WebSocket
```

[← Back to README](../README.md)
