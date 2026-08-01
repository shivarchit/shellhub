import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { AuditEntry } from '../lib/types'
import { getAuditLog } from '../lib/api'
import { useAuth } from '../lib/auth'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

const actionIcons: Record<string, { icon: string; color: string }> = {
  terminal_connect: { icon: '→', color: 'text-accent-green' },
  terminal_disconnect: { icon: '←', color: 'text-text-muted' },
  command_exec: { icon: '$', color: 'text-accent-blue' },
  server_create: { icon: '+', color: 'text-accent-green' },
  server_update: { icon: '~', color: 'text-accent-amber' },
  server_delete: { icon: '×', color: 'text-accent-red' },
  global_command_create: { icon: '+', color: 'text-accent-green' },
  global_command_update: { icon: '~', color: 'text-accent-amber' },
  global_command_delete: { icon: '×', color: 'text-accent-red' },
}

export default function ActivityFeed() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAuditLog(25, 0)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-4 h-4 border border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-xs text-text-muted text-center py-4">
        No recent activity
      </div>
    )
  }

  return (
    <div>
      {/* Scroll the rows, not the card, so the "View all" footer stays put. */}
      <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
      {entries.map((entry) => {
        const meta = actionIcons[entry.action] || { icon: '•', color: 'text-text-muted' }
        return (
          <div
            key={entry.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-700/40 transition-colors"
          >
            <span className={`font-mono text-sm font-bold w-4 flex-shrink-0 mt-0.5 ${meta.color}`}>
              {meta.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-secondary font-medium truncate">
                  {entry.username || 'system'}
                </span>
                <span className="text-xs text-text-muted">
                  {entry.action.replace(/_/g, ' ')}
                </span>
                {entry.server_name && (
                  <span className="text-xs text-text-muted truncate">
                    on <span className="text-text-secondary">{entry.server_name}</span>
                  </span>
                )}
              </div>
              {/* details is the server name for server_* actions - already shown above. */}
              {entry.details && entry.details !== entry.server_name && (
                <p className="text-xs text-text-muted font-mono truncate mt-0.5">
                  {entry.details}
                </p>
              )}
            </div>
            <span className="text-xs text-text-dimmed flex-shrink-0 tabular-nums">
              {timeAgo(entry.created_at)}
            </span>
          </div>
        )
      })}
      </div>
      {user?.permissions?.can_view_audit && (
        <button
          onClick={() => navigate('/audit')}
          className="w-full mt-1 pt-2 border-t border-border text-xs text-text-muted hover:text-accent-blue transition-colors"
        >
          View all
        </button>
      )}
    </div>
  )
}
