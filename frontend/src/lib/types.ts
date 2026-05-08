export interface QuickCommand {
  name: string
  command: string
  tag: string
  is_template?: boolean
}

export interface GlobalCommand {
  id: number
  name: string
  command: string
  tag: string
  description: string
  is_template: boolean
  sort_order: number
  created_at: string
}

export type GlobalCommandInput = Omit<GlobalCommand, 'id' | 'created_at'>

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
  duration_ms?: number
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
  server_name: string
  command_name: string
  command_text: string
  output: string
  exit_code: number
  executed_at: string
  duration_ms: number
}

export interface ExecHistoryPage {
  records: ExecRecord[]
  total: number
}

export interface ExecHistoryFilter {
  server_id?: number
  search?: string
  exit_code?: number
  date_from?: string
  date_to?: string
  limit?: number
  offset?: number
}

export interface AuditEntry {
  id: number
  action: string
  server_id: number | null
  details: string
  created_at: string
}

export interface LoginAttempt {
  id: number
  username: string
  success: boolean
  ip: string
  user_agent: string
  created_at: string
}

export interface TemplateVariable {
  name: string
  defaultValue: string
}

export interface SessionRecording {
  id: number
  server_id: number
  server_name: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  data?: string
  cols: number
  rows: number
}

export interface ServerStats {
  cpu: number
  mem_used_mb: number
  mem_total_mb: number
  disk_used_gb: number
  disk_total_gb: number
  uptime: string
  load_1: number
  load_5: number
  load_15: number
  online: boolean
  error?: string
}

export interface DailyCount {
  date: string
  count: number
}

export interface DailyExecCount {
  date: string
  success: number
  failure: number
}

export interface ServerActivity {
  server_id: number
  server_name: string
  count: number
}

export interface ServerUptimeInfo {
  server_id: number
  server_name: string
  uptime: number
}

export interface LatencyPoint {
  date: string
  avg_ms: number
}

export interface MetricsSummary {
  total_servers: number
  online_servers: number
  total_execs_today: number
  avg_uptime: number
}

export interface MetricsResponse {
  summary: MetricsSummary
  uptimes: ServerUptimeInfo[]
  connections: DailyCount[]
  executions: DailyExecCount[]
  top_servers: ServerActivity[]
  latencies: Record<string, LatencyPoint[]>
}
