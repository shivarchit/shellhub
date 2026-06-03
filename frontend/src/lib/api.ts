import type { Server, ServerInput, PingResult, ExecResult, ConnectionRecord, ExecRecord, AuditEntry, LoginAttempt, GlobalCommand, GlobalCommandInput, ExecHistoryPage, ExecHistoryFilter, SessionRecording, ServerStats, MetricsResponse } from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const getServers = () => request<Server[]>('/servers')

export const createServer = (s: ServerInput) =>
  request<Server>('/servers', { method: 'POST', body: JSON.stringify(s) })

export const updateServer = (id: number, s: ServerInput) =>
  request<Server>(`/servers/${id}`, { method: 'PUT', body: JSON.stringify(s) })

export const deleteServer = (id: number) =>
  request<void>(`/servers/${id}`, { method: 'DELETE' })

export const reorderServers = (orders: { id: number; sort_order: number }[]) =>
  request<void>('/servers/reorder', { method: 'PUT', body: JSON.stringify(orders) })

export const pingServer = (id: number) =>
  request<PingResult>(`/servers/${id}/ping`, { method: 'POST' })

export const execCommand = (id: number, command: string, commandName?: string) =>
  request<ExecResult>(`/servers/${id}/exec`, {
    method: 'POST',
    body: JSON.stringify({ command, command_name: commandName }),
  })

export const pingHost = (host: string, port: number) =>
  request<PingResult>('/ping', { method: 'POST', body: JSON.stringify({ host, port }) })

export const getSettings = () => request<Record<string, string>>('/settings')

export const updateSettings = (settings: Record<string, string>) =>
  request<Record<string, string>>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })

export const getConnectionHistory = (id: number) =>
  request<ConnectionRecord[]>(`/servers/${id}/history`)

export const exportData = () => {
  window.open('/api/export', '_blank')
}

export const importData = (data: unknown, mode: 'merge' | 'replace') =>
  request<{ status: string; imported: number }>(`/import?mode=${mode}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const getExecHistory = (id: number) =>
  request<ExecRecord[]>(`/servers/${id}/exec-history`)

export const getAuditLog = (limit = 100, offset = 0) =>
  request<AuditEntry[]>(`/audit-log?limit=${limit}&offset=${offset}`)

export const getLoginAttempts = (limit = 100, offset = 0) =>
  request<LoginAttempt[]>(`/auth/login-attempts?limit=${limit}&offset=${offset}`)

// Global Commands
export const getGlobalCommands = () =>
  request<GlobalCommand[]>('/global-commands')

export const createGlobalCommand = (cmd: GlobalCommandInput) =>
  request<GlobalCommand>('/global-commands', { method: 'POST', body: JSON.stringify(cmd) })

export const updateGlobalCommand = (id: number, cmd: GlobalCommandInput) =>
  request<GlobalCommand>(`/global-commands/${id}`, { method: 'PUT', body: JSON.stringify(cmd) })

export const deleteGlobalCommand = (id: number) =>
  request<void>(`/global-commands/${id}`, { method: 'DELETE' })

// Full Exec History (audit trail)
export const getAllExecHistory = (filter: ExecHistoryFilter) => {
  const params = new URLSearchParams()
  if (filter.limit) params.set('limit', String(filter.limit))
  if (filter.offset) params.set('offset', String(filter.offset))
  if (filter.server_id) params.set('server_id', String(filter.server_id))
  if (filter.search) params.set('search', filter.search)
  if (filter.exit_code !== undefined) params.set('exit_code', String(filter.exit_code))
  if (filter.date_from) params.set('date_from', filter.date_from)
  if (filter.date_to) params.set('date_to', filter.date_to)
  return request<ExecHistoryPage>(`/exec-history?${params.toString()}`)
}

export const exportExecHistoryCSV = (filter: ExecHistoryFilter) => {
  const params = new URLSearchParams()
  if (filter.server_id) params.set('server_id', String(filter.server_id))
  if (filter.search) params.set('search', filter.search)
  if (filter.exit_code !== undefined) params.set('exit_code', String(filter.exit_code))
  if (filter.date_from) params.set('date_from', filter.date_from)
  if (filter.date_to) params.set('date_to', filter.date_to)
  window.open(`/api/exec-history/export?${params.toString()}`, '_blank')
}

// Recordings
export const getRecordings = () =>
  request<SessionRecording[]>('/recordings')

export const getRecording = (id: number) =>
  request<SessionRecording>(`/recordings/${id}`)

export const deleteRecording = (id: number) =>
  request<void>(`/recordings/${id}`, { method: 'DELETE' })

// DB Panel
export const getDbTables = () =>
  request<string[]>('/db/tables')

export const queryDbTable = (table: string, limit = 100, offset = 0) =>
  request<{ columns: string[]; rows: Record<string, any>[]; total: number }>(`/db/query?table=${encodeURIComponent(table)}&limit=${limit}&offset=${offset}`)

// Server Stats & Metrics
export const getServerStats = (id: number) =>
  request<ServerStats>(`/servers/${id}/stats`)

export const getMetrics = (range: string = '7d') =>
  request<MetricsResponse>(`/metrics?range=${range}`)

// User management
export const getCurrentUser = () =>
  request<{ id: number; username: string; role: string }>('/auth/me')

export const changePassword = (oldPassword: string, newPassword: string) =>
  request<void>('/auth/password', { method: 'PUT', body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }) })

export const getUsers = () =>
  request<Array<{ id: number; username: string; role: string; permissions: UserPermissionsPayload; created_at: string; last_login: string }>>('/users')

export const createNewUser = (username: string, password: string, role: string) =>
  request<{ id: number; username: string; role: string }>('/users', { method: 'POST', body: JSON.stringify({ username, password, role }) })

export const deleteUser = (id: number) =>
  request<void>(`/users/${id}`, { method: 'DELETE' })

export const updateUserRole = (id: number, role: string) =>
  request<void>(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) })

export const getUserServers = (id: number) =>
  request<number[]>(`/users/${id}/servers`)

export const updateUserServers = (id: number, serverIds: number[]) =>
  request<void>(`/users/${id}/servers`, { method: 'PUT', body: JSON.stringify({ server_ids: serverIds }) })

export interface UserPermissionsPayload {
  can_view_recordings: boolean
  can_view_metrics: boolean
  can_view_audit: boolean
  can_manage_servers: boolean
  can_exec_commands: boolean
  can_open_terminal: boolean
  can_view_db: boolean
}

export const updateUserPermissions = (id: number, perms: UserPermissionsPayload) =>
  request<UserPermissionsPayload>(`/users/${id}/permissions`, { method: 'PUT', body: JSON.stringify(perms) })
