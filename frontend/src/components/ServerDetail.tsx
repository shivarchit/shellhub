import { useEffect, useState } from 'react'
import type { Server, ExecResult, QuickCommand, ConnectionRecord, ExecRecord, GlobalCommand } from '../lib/types'
import { getConnectionHistory, getExecHistory, getGlobalCommands } from '../lib/api'
import { cn } from '../lib/utils'
import StatusDot from './StatusDot'
import CommandCard from './CommandCard'
import ServerStatsWidget from './ServerStatsWidget'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface ServerDetailProps {
  server: Server
  online: boolean
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onOpenTerminal: () => void
  onExecComplete: (result: ExecResult, command: QuickCommand) => void
}

export default function ServerDetail({
  server,
  online,
  onEdit,
  onDelete,
  onDuplicate,
  onOpenTerminal,
  onExecComplete,
}: ServerDetailProps) {
  const [lastConnected, setLastConnected] = useState<ConnectionRecord | null>(null)
  const [execHistory, setExecHistory] = useState<ExecRecord[]>([])
  const [globalCommands, setGlobalCommands] = useState<GlobalCommand[]>([])

  useEffect(() => {
    getConnectionHistory(server.id)
      .then((records) => {
        setLastConnected(records.length > 0 ? records[0] : null)
      })
      .catch(() => setLastConnected(null))
    getExecHistory(server.id)
      .then(setExecHistory)
      .catch(() => setExecHistory([]))
    getGlobalCommands()
      .then(setGlobalCommands)
      .catch(() => setGlobalCommands([]))
  }, [server.id])

  const handleDelete = () => {
    if (window.confirm(`Delete "${server.name}"? This cannot be undone.`)) {
      onDelete()
    }
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-surface-900 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-text-primary">
              {server.name}
            </h1>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
                online
                  ? 'bg-accent-green-bg text-accent-green shadow-glow-green'
                  : 'bg-accent-red-bg text-accent-red shadow-glow-red'
              )}
            >
              <StatusDot online={online} size="sm" />
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-sm text-text-muted font-mono">
            {server.username}@{server.host}:{server.port}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenTerminal}
            className="px-4 py-2 text-sm font-medium text-white bg-accent-blue rounded-lg hover:opacity-90 transition-opacity shadow-glow-blue"
          >
            Open Terminal
          </button>
          <button
            onClick={onEdit}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-surface-700 border border-border rounded-lg hover:bg-surface-600 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDuplicate}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-surface-700 border border-border rounded-lg hover:bg-surface-600 transition-colors"
          >
            Duplicate
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium text-accent-red bg-accent-red-bg border border-accent-red/20 rounded-lg hover:bg-accent-red-dim transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Host', value: server.host },
          { label: 'Port', value: String(server.port) },
          { label: 'Username', value: server.username },
          { label: 'Auth', value: server.auth_type === 'key' ? 'SSH Key' : 'Password' },
          {
            label: 'Commands',
            value: String(server.quick_commands?.length ?? 0),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-surface-800 rounded-lg border border-border p-4"
          >
            <p className="text-xs text-text-muted mb-1">{item.label}</p>
            <p className="text-sm font-semibold text-text-primary font-mono">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Last Connected */}
      <div className="mb-8">
        <div className="bg-surface-800 rounded-lg border border-border p-4 inline-flex items-center gap-2">
          <p className="text-xs text-text-muted">Last Connected:</p>
          <p className="text-sm font-semibold text-text-primary">
            {lastConnected ? timeAgo(lastConnected.connected_at) : 'Never'}
          </p>
        </div>
      </div>

      {/* System Stats Widget */}
      <ServerStatsWidget serverId={server.id} online={online} />

      {/* Quick Commands */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Quick Commands
        </h2>
        {server.quick_commands?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {server.quick_commands.map((cmd, i) => (
              <CommandCard
                key={`${cmd.name}-${i}`}
                command={cmd}
                serverId={server.id}
                server={server}
                onExecComplete={onExecComplete}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-text-muted text-sm bg-surface-800 rounded-lg border border-border">
            No quick commands configured. Click Edit to add some.
          </div>
        )}
      </div>

      {/* Global Commands */}
      {globalCommands.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Global Commands
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {globalCommands.map((gc) => (
              <CommandCard
                key={`global-${gc.id}`}
                command={{
                  name: gc.name,
                  command: gc.command,
                  tag: gc.tag,
                  is_template: gc.is_template,
                }}
                serverId={server.id}
                server={server}
                onExecComplete={onExecComplete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Executions */}
      {execHistory.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Recent Executions</h3>
          <div className="space-y-1.5">
            {execHistory.slice(0, 10).map(rec => (
              <div key={rec.id} className="flex items-center justify-between px-3 py-2 bg-surface-700 rounded-lg text-xs">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    rec.exit_code === 0 ? 'bg-accent-green' : 'bg-accent-red'
                  )} />
                  <span className="text-text-primary font-medium truncate max-w-[700px]">{rec.command_name}</span>
                </div>
                <div className="flex items-center gap-3 text-text-muted">
                  <span className={rec.exit_code === 0 ? 'text-accent-green' : 'text-accent-red'}>
                    exit {rec.exit_code}
                  </span>
                  <span>{timeAgo(rec.executed_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
