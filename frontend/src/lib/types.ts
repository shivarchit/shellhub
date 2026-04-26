export interface QuickCommand {
  name: string
  command: string
  tag: string
}

export interface Server {
  id: number
  name: string
  host: string
  port: number
  username: string
  password: string
  group: string
  auth_type: 'password' | 'key'
  private_key: string
  sort_order: number
  quick_commands: QuickCommand[]
}

export type ServerInput = Omit<Server, 'id'>

export interface PingResult {
  online: boolean
}

export interface ExecResult {
  output: string
  exit_code: number
}

export interface ConnectionRecord {
  id: number
  server_id: number
  connected_at: string
  disconnected_at: string | null
  duration_seconds: number
}

export interface ExecRecord {
  id: number
  server_id: number
  command_name: string
  command_text: string
  output: string
  exit_code: number
  executed_at: string
  duration_ms: number
}

export interface AuditEntry {
  id: number
  action: string
  server_id: number | null
  details: string
  created_at: string
}
