import type { Server, ServerInput, PingResult, ExecResult, ConnectionRecord, ExecRecord, AuditEntry, SessionRecording } from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
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

export const execCommand = (id: number, command: string) =>
  request<ExecResult>(`/servers/${id}/exec`, {
    method: 'POST',
    body: JSON.stringify({ command }),
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

export const getRecordings = () =>
  request<SessionRecording[]>('/recordings')

export const getRecording = (id: number) =>
  request<SessionRecording>(`/recordings/${id}`)

export const deleteRecording = (id: number) =>
  request<void>(`/recordings/${id}`, { method: 'DELETE' })
