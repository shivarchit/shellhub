import type { Server, ServerInput, PingResult, ExecResult } from './types'

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
