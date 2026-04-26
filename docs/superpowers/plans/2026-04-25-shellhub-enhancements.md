# ShellHub Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add UX polish (auto-refresh status, toasts, loading states, Ctrl+K), server management features (SSH key auth, duplicate, drag-drop, connection history, test connection), and data/backup (export/import JSON, exec history, audit log).

**Architecture:** Extends existing SQLite schema with new tables (app_settings, connection_history, exec_history, audit_log) and columns (auth_type, private_key, sort_order). New REST endpoints for settings, ping, reorder, export/import, history, and audit. Frontend gets a Settings page, toast system, and enhanced components.

**Tech Stack:** Existing Go/React stack + @dnd-kit/core for drag-drop

---

## Dependency Graph

```
Task 1 (App Settings backend)
  └── Task 2 (Settings page frontend)
        └── Task 3 (Auto-refresh status)
        └── Task 11 (Export/Import UI)
        └── Task 12 (Audit log UI)

Task 4 (Toast system) — standalone
Task 5 (Loading/confirm/Ctrl+K) — standalone

Task 6 (SSH key backend) → Task 7 (SSH key frontend)
Task 8 (Duplicate/test connection) — needs Task 1
Task 9 (Connection history)
Task 10 (Drag-drop reorder) — standalone
```

---

### Task 1: App Settings (Backend)

**Files:**
- Modify: `internal/config/config.go`
- Modify: `internal/config/config_test.go`
- Modify: `internal/api/api.go`
- Modify: `internal/api/api_test.go`

- [ ] **Step 1: Add app_settings table creation in NewStore**

In `internal/config/config.go`, after the `quick_commands` CREATE TABLE, add:

```go
if _, err := db.Exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
`); err != nil {
    db.Close()
    return nil, err
}
```

- [ ] **Step 2: Add Store methods for settings**

```go
func (s *Store) GetSetting(key string) (string, error) {
    var value string
    err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = ?`, key).Scan(&value)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return "", nil
        }
        return "", err
    }
    return value, nil
}

func (s *Store) SetSetting(key, value string) error {
    _, err := s.db.Exec(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        key, value,
    )
    return err
}

func (s *Store) GetAllSettings() (map[string]string, error) {
    rows, err := s.db.Query(`SELECT key, value FROM app_settings ORDER BY key`)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    settings := make(map[string]string)
    for rows.Next() {
        var k, v string
        if err := rows.Scan(&k, &v); err != nil {
            return nil, err
        }
        settings[k] = v
    }
    return settings, rows.Err()
}
```

- [ ] **Step 3: Write tests for settings Store methods**

```go
func TestSettings_GetEmpty(t *testing.T) {
    s := tempStore(t)
    val, err := s.GetSetting("ping_interval")
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if val != "" { t.Fatalf("expected empty, got %q", val) }
}

func TestSettings_SetAndGet(t *testing.T) {
    s := tempStore(t)
    if err := s.SetSetting("ping_interval", "30"); err != nil { t.Fatal(err) }
    val, err := s.GetSetting("ping_interval")
    if err != nil { t.Fatal(err) }
    if val != "30" { t.Fatalf("expected '30', got %q", val) }
}

func TestSettings_Upsert(t *testing.T) {
    s := tempStore(t)
    s.SetSetting("ping_interval", "30")
    s.SetSetting("ping_interval", "60")
    val, _ := s.GetSetting("ping_interval")
    if val != "60" { t.Fatalf("expected '60', got %q", val) }
}

func TestSettings_GetAll(t *testing.T) {
    s := tempStore(t)
    s.SetSetting("ping_interval", "30")
    s.SetSetting("theme", "dark")
    all, err := s.GetAllSettings()
    if err != nil { t.Fatal(err) }
    if len(all) != 2 { t.Fatalf("expected 2, got %d", len(all)) }
}
```

- [ ] **Step 4: Run config tests**

```bash
go test ./internal/config/ -v -count=1
```

- [ ] **Step 5: Add API endpoints for settings**

In `internal/api/api.go`, register routes and add handlers:

```go
mux.HandleFunc("GET /api/settings", h.getSettings)
mux.HandleFunc("PUT /api/settings", h.updateSettings)
```

```go
func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
    settings, err := h.store.GetAllSettings()
    if err != nil { writeError(w, 500, err.Error()); return }
    writeJSON(w, 200, settings)
}

func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
    var body map[string]string
    if err := readJSON(r, &body); err != nil { writeError(w, 400, err.Error()); return }
    for key, value := range body {
        if err := h.store.SetSetting(key, value); err != nil {
            writeError(w, 500, err.Error()); return
        }
    }
    settings, _ := h.store.GetAllSettings()
    writeJSON(w, 200, settings)
}
```

- [ ] **Step 6: Add API tests for settings endpoints**
- [ ] **Step 7: Run all tests and commit**

```bash
go test ./... -count=1
git commit -m "feat: add app_settings table with GET/PUT API endpoints"
```

---

### Task 2: Settings Page (Frontend)

**Files:**
- Create: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Add API functions**

In `frontend/src/lib/api.ts`:

```typescript
export const getSettings = () => request<Record<string, string>>('/settings')

export const updateSettings = (settings: Record<string, string>) =>
  request<Record<string, string>>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
```

- [ ] **Step 2: Create Settings.tsx**

New page with:
- "Back to Dashboard" link at top
- "General" section with ping interval input (number, in minutes, default 30)
- Save button that calls `updateSettings`
- Success/error feedback
- Same dark surface styling as rest of app

- [ ] **Step 3: Add route in App.tsx**

```tsx
import Settings from './pages/Settings'
// In Routes:
<Route path="/settings" element={<Settings />} />
```

- [ ] **Step 4: Add settings gear icon in Sidebar header**

Small gear SVG icon button next to "ShellHub" text that navigates to `/settings`.

- [ ] **Step 5: Type-check and commit**

```bash
cd frontend && npx tsc --noEmit
git commit -m "feat: add Settings page with configurable ping interval"
```

---

### Task 3: Auto-Refresh Server Status

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] **Step 1: Fetch ping interval from settings on mount**

```typescript
const [pingInterval, setPingInterval] = useState(30 * 60 * 1000)

useEffect(() => {
  getSettings().then(s => {
    const min = parseInt(s.ping_interval || '30', 10)
    if (min > 0) setPingInterval(min * 60 * 1000)
  }).catch(() => {})
}, [])
```

- [ ] **Step 2: Set up interval for periodic pinging**

Use a ref to hold latest servers list so interval closure has fresh data. Clear interval on unmount and when pingInterval changes.

- [ ] **Step 3: Type-check and commit**

```bash
cd frontend && npx tsc --noEmit
git commit -m "feat: auto-refresh server status at configurable interval"
```

---

### Task 4: Toast Notification System

**Files:**
- Create: `frontend/src/components/ToastProvider.tsx`
- Create: `frontend/src/lib/useToast.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/CommandCard.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create ToastProvider with context**

```typescript
interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  duration: number
}

interface ToastContextValue {
  addToast: (message: string, type: Toast['type'], duration?: number) => void
}
```

Provider manages toast array, auto-removes via setTimeout, renders fixed bottom-right container with animated cards. Green for success, red for error, blue for info.

- [ ] **Step 2: Create useToast hook**

```typescript
export function useToast() {
  return useContext(ToastContext)
}
```

- [ ] **Step 3: Add toast animations to index.css**

```css
@keyframes toast-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes toast-out { from { opacity: 1; } to { opacity: 0; } }
```

- [ ] **Step 4: Wrap App with ToastProvider**
- [ ] **Step 5: Integrate toasts in CommandCard**

After exec complete:
- Success: `addToast(\`${command.name} completed\`, 'success')`
- Failure: `addToast(\`${command.name} failed\`, 'error')`

- [ ] **Step 6: Type-check and commit**

```bash
cd frontend && npx tsc --noEmit
git commit -m "feat: add toast notification system for command execution"
```

---

### Task 5: Loading States + Destructive Confirm + Ctrl+K

**Files:**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/components/CommandCard.tsx`
- Modify: `frontend/src/components/CommandPanel.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Add loading spinner to Dashboard**

Add `loading` state, show centered spinner while fetching servers. Add `pinging` state for ping indicator.

- [ ] **Step 2: Add destructive command confirmation**

In CommandCard and CommandPanel, before executing, check command text:

```typescript
const DESTRUCTIVE = [/rm\s+-rf/, /\bdrop\b/i, /\bdelete\b/i, /\btruncate\b/i, /mkfs/, /dd\s+if=/]
if (DESTRUCTIVE.some(p => p.test(command.command))) {
  if (!window.confirm(`Warning: "${command.name}" contains a destructive operation.\n\n${command.command}\n\nProceed?`)) return
}
```

- [ ] **Step 3: Add Ctrl+K search shortcut to Sidebar**

```typescript
const searchRef = useRef<HTMLInputElement>(null)
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      searchRef.current?.focus()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

Update placeholder to `"Search servers... (Ctrl+K)"`.

- [ ] **Step 4: Type-check and commit**

```bash
cd frontend && npx tsc --noEmit
git commit -m "feat: add loading spinners, destructive confirm, and Ctrl+K search"
```

---

### Task 6: SSH Key Auth (Backend)

**Files:**
- Modify: `internal/config/config.go`
- Modify: `internal/config/config_test.go`
- Modify: `internal/ssh/client.go`

- [ ] **Step 1: Add auth_type and private_key to Server struct**

```go
AuthType   string `yaml:"auth_type" json:"auth_type" db:"auth_type"`
PrivateKey string `yaml:"private_key" json:"private_key" db:"private_key"`
```

- [ ] **Step 2: Add migration in NewStore**

```go
s.db.Exec(`ALTER TABLE servers ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'password'`)
s.db.Exec(`ALTER TABLE servers ADD COLUMN private_key TEXT NOT NULL DEFAULT ''`)
```

- [ ] **Step 3: Update all SELECT/INSERT/UPDATE queries to include new columns**

- [ ] **Step 4: Update SSH client Connect method**

```go
switch server.AuthType {
case "key":
    signer, err := gossh.ParsePrivateKey([]byte(server.PrivateKey))
    if err != nil { return nil, fmt.Errorf("failed to parse private key: %w", err) }
    authMethods = append(authMethods, gossh.PublicKeys(signer))
default:
    authMethods = append(authMethods, gossh.Password(server.Password))
}
```

- [ ] **Step 5: Add tests and commit**

```bash
go test ./internal/config/ ./internal/api/ -v -count=1
git commit -m "feat: add SSH key authentication support to backend"
```

---

### Task 7: SSH Key Auth (Frontend)

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/components/AddEditServerModal.tsx`
- Modify: `frontend/src/components/ServerDetail.tsx`

- [ ] **Step 1: Update Server type**

```typescript
auth_type: 'password' | 'key'
private_key: string
```

- [ ] **Step 2: Add auth toggle to AddEditServerModal**

Two-button toggle between Password and SSH Key. Show password input or private key textarea based on selection.

- [ ] **Step 3: Show auth type in ServerDetail info grid**

- [ ] **Step 4: Type-check and commit**

```bash
cd frontend && npx tsc --noEmit
git commit -m "feat: add SSH key auth toggle to server add/edit modal"
```

---

### Task 8: Duplicate Server + Test Connection

**Files:**
- Modify: `internal/api/api.go`
- Modify: `internal/api/api_test.go`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/components/ServerDetail.tsx`
- Modify: `frontend/src/components/AddEditServerModal.tsx`

- [ ] **Step 1: Add POST /api/ping endpoint (host-level ping without saved server)**

```go
mux.HandleFunc("POST /api/ping", h.pingHost)

func (h *Handler) pingHost(w http.ResponseWriter, r *http.Request) {
    var body struct { Host string `json:"host"`; Port int `json:"port"` }
    if err := readJSON(r, &body); err != nil { writeError(w, 400, err.Error()); return }
    if body.Port == 0 { body.Port = 22 }
    online, _ := h.pinger.Ping(body.Host, body.Port, 5*time.Second)
    writeJSON(w, 200, map[string]bool{"online": online})
}
```

- [ ] **Step 2: Add pingHost to frontend API client**

```typescript
export const pingHost = (host: string, port: number) =>
  request<PingResult>('/ping', { method: 'POST', body: JSON.stringify({ host, port }) })
```

- [ ] **Step 3: Add Duplicate button to ServerDetail + handler in Dashboard**

Duplicate button copies server config into add modal with "(Copy)" appended to name. Use `initialData` prop on AddEditServerModal.

- [ ] **Step 4: Add Test Connection button to AddEditServerModal**

Button calls `pingHost(host, port)`, shows green check or red X result.

- [ ] **Step 5: Test and commit**

```bash
go test ./internal/api/ -v -count=1
cd frontend && npx tsc --noEmit
git commit -m "feat: add duplicate server and test connection features"
```

---

### Task 9: Connection History

**Files:**
- Modify: `internal/config/config.go`
- Modify: `internal/config/config_test.go`
- Modify: `internal/api/api.go`
- Modify: `internal/terminal/terminal.go`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/components/ServerDetail.tsx`

- [ ] **Step 1: Add connection_history table and Store methods**

```sql
CREATE TABLE IF NOT EXISTS connection_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    connected_at TEXT NOT NULL,
    disconnected_at TEXT,
    duration_seconds INTEGER DEFAULT 0,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
)
```

Methods: `LogConnect(serverID) (int, error)`, `LogDisconnect(recordID) error`, `GetConnectionHistory(serverID, limit) ([]ConnectionRecord, error)`, `GetLastConnection(serverID) (*ConnectionRecord, error)`

- [ ] **Step 2: Log connect/disconnect in terminal handler**

In `terminal.go`, after SSH connect: `recordID, _ := h.store.LogConnect(id)`. Before cleanup: `h.store.LogDisconnect(recordID)`.

- [ ] **Step 3: Add GET /api/servers/{id}/history endpoint**

Returns last 20 connection records.

- [ ] **Step 4: Add frontend types and API function**

```typescript
export interface ConnectionRecord {
  id: number; server_id: number; connected_at: string
  disconnected_at: string | null; duration_seconds: number
}

export const getConnectionHistory = (id: number) =>
  request<ConnectionRecord[]>(`/servers/${id}/history`)
```

- [ ] **Step 5: Show last connected time in ServerDetail**

Fetch on mount, show relative time or "Never".

- [ ] **Step 6: Test and commit**

```bash
go test ./internal/config/ ./internal/api/ -v -count=1
cd frontend && npx tsc --noEmit
git commit -m "feat: add connection history tracking for terminal sessions"
```

---

### Task 10: Drag-Drop Reorder

**Files:**
- Modify: `internal/config/config.go`
- Modify: `internal/api/api.go`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Install @dnd-kit**

```bash
cd frontend && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Add sort_order column migration and Store method**

```go
s.db.Exec(`ALTER TABLE servers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
```

Update `GetServers` query: `ORDER BY sort_order, id`.

```go
func (s *Store) ReorderServers(orders []struct{ ID, SortOrder int }) error {
    tx, _ := s.db.Begin()
    defer tx.Rollback()
    for _, o := range orders {
        tx.Exec(`UPDATE servers SET sort_order = ? WHERE id = ?`, o.SortOrder, o.ID)
    }
    return tx.Commit()
}
```

- [ ] **Step 3: Add PUT /api/servers/reorder endpoint**

Reads `[{id, sort_order}, ...]` from body.

- [ ] **Step 4: Add reorderServers to frontend API**

```typescript
export const reorderServers = (orders: { id: number; sort_order: number }[]) =>
  request<void>('/servers/reorder', { method: 'PUT', body: JSON.stringify(orders) })
```

- [ ] **Step 5: Implement drag-drop in Sidebar**

Wrap each group with `DndContext` + `SortableContext`. Each server item becomes a `SortableItem` with drag handle. `onDragEnd` computes new sort orders and calls API.

- [ ] **Step 6: Test and commit**

```bash
go test ./internal/config/ ./internal/api/ -v -count=1
cd frontend && npx tsc --noEmit
git commit -m "feat: add drag-and-drop server reordering in sidebar"
```

---

### Task 11: Export/Import

**Files:**
- Modify: `internal/api/api.go`
- Modify: `internal/api/api_test.go`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Add export/import API endpoints**

```go
mux.HandleFunc("GET /api/export", h.exportData)
mux.HandleFunc("POST /api/import", h.importData)
```

Export returns `{"version":1, "servers":[...], "settings":{...}}` with Content-Disposition header.

Import accepts same format with `?mode=merge` (default) or `?mode=replace`.

- [ ] **Step 2: Add frontend API functions**

```typescript
export const exportData = () => { window.open('/api/export', '_blank') }

export const importData = (data: unknown, mode: 'merge' | 'replace') =>
  request<{ status: string }>(`/import?mode=${mode}`, {
    method: 'POST', body: JSON.stringify(data),
  })
```

- [ ] **Step 3: Add Export/Import section to Settings page**

Export button downloads JSON. Import: file input, preview (server count), merge/replace radio, confirm button.

- [ ] **Step 4: Test and commit**

```bash
go test ./internal/api/ -v -count=1
cd frontend && npx tsc --noEmit
git commit -m "feat: add JSON export/import for servers and settings"
```

---

### Task 12: Command Execution History + Audit Log

**Files:**
- Modify: `internal/config/config.go`
- Modify: `internal/config/config_test.go`
- Modify: `internal/api/api.go`
- Modify: `internal/terminal/terminal.go`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/components/ServerDetail.tsx`
- Modify: `frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Add exec_history and audit_log tables**

```sql
CREATE TABLE IF NOT EXISTS exec_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    command_name TEXT NOT NULL,
    command_text TEXT NOT NULL,
    output TEXT NOT NULL DEFAULT '',
    exit_code INTEGER NOT NULL DEFAULT -1,
    executed_at TEXT NOT NULL DEFAULT (datetime('now')),
    duration_ms INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    server_id INTEGER,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Add Store methods**

`LogExec(rec ExecRecord) error`, `GetExecHistory(serverID, limit int) ([]ExecRecord, error)`, `LogAudit(action string, serverID *int, details string) error`, `GetAuditLog(limit, offset int) ([]AuditEntry, error)`

- [ ] **Step 3: Add audit logging to existing handlers**

In `api.go`: log on server create/update/delete and command exec.
In `terminal.go`: log on terminal connect/disconnect.

- [ ] **Step 4: Add API endpoints**

```go
mux.HandleFunc("GET /api/servers/{id}/exec-history", h.getExecHistory)
mux.HandleFunc("GET /api/audit-log", h.getAuditLog)
```

- [ ] **Step 5: Add frontend types and API functions**

```typescript
export interface ExecRecord {
  id: number; server_id: number; command_name: string; command_text: string
  output: string; exit_code: number; executed_at: string; duration_ms: number
}

export interface AuditEntry {
  id: number; action: string; server_id: number | null
  details: string; created_at: string
}
```

- [ ] **Step 6: Show exec history in ServerDetail**

"Recent Executions" section below quick commands. Last 10 entries with command name, exit code badge, duration, timestamp.

- [ ] **Step 7: Show audit log on Settings page**

Scrollable table with action, server, timestamp. Color-coded by action type.

- [ ] **Step 8: Test and commit**

```bash
go test ./internal/config/ ./internal/api/ -v -count=1
cd frontend && npx tsc --noEmit
git commit -m "feat: add command execution history and audit log"
```
