import { useEffect, useState, useCallback } from 'react'
import type { ServerStats } from '../lib/types'
import { getServerStats } from '../lib/api'

interface ServerStatsWidgetProps {
  serverId: number
  online: boolean
  refreshInterval?: number // seconds, default 60
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function CircularProgress({ value, size = 64 }: { value: number; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const color = value > 80 ? '#ef4444' : value > 60 ? '#f59e0b' : '#22c55e'

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
        className="text-surface-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-500"
      />
    </svg>
  )
}

function formatMem(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`
  }
  return `${mb} MB`
}

export default function ServerStatsWidget({ serverId, online, refreshInterval = 60 }: ServerStatsWidgetProps) {
  const [stats, setStats] = useState<ServerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    if (!online) {
      setStats(null)
      setError(null)
      setLoading(false)
      return
    }
    try {
      const data = await getServerStats(serverId)
      setStats(data)
      setError(data.online ? null : (data.error || 'Server unreachable'))
    } catch {
      setError('Failed to fetch stats')
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [serverId, online])

  useEffect(() => {
    setLoading(true)
    fetchStats()
    const id = setInterval(fetchStats, refreshInterval * 1000)
    return () => clearInterval(id)
  }, [fetchStats, refreshInterval])

  if (!online) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">System Stats</h2>
        <div className="bg-surface-800 rounded-lg border border-border p-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-red-bg text-accent-red text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
            Server Offline
          </div>
          <p className="text-xs text-text-muted mt-2">Stats unavailable while server is offline</p>
        </div>
      </div>
    )
  }

  if (loading && !stats) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">System Stats</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-surface-800 rounded-lg border border-border p-4 animate-pulse">
              <div className="h-3 bg-surface-700 rounded w-16 mb-3" />
              <div className="h-6 bg-surface-700 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">System Stats</h2>
        <div className="bg-surface-800 rounded-lg border border-border p-6 text-center">
          <p className="text-sm text-accent-red">{error}</p>
        </div>
      </div>
    )
  }

  if (!stats || !stats.online) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">System Stats</h2>
        <div className="bg-surface-800 rounded-lg border border-border p-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-red-bg text-accent-red text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-accent-red" />
            Unreachable
          </div>
          {stats?.error && <p className="text-xs text-text-muted mt-2">{stats.error}</p>}
        </div>
      </div>
    )
  }

  const memPct = stats.mem_total_mb > 0 ? (stats.mem_used_mb / stats.mem_total_mb) * 100 : 0
  const diskPct = stats.disk_total_gb > 0 ? (stats.disk_used_gb / stats.disk_total_gb) * 100 : 0

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-text-primary mb-3">System Stats</h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* CPU */}
        <div className="bg-surface-800 rounded-lg border border-border p-4 flex flex-col items-center">
          <p className="text-xs text-text-muted mb-2 self-start">CPU</p>
          <div className="relative">
            <CircularProgress value={stats.cpu} size={56} />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-text-primary transform rotate-0">
              {stats.cpu.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Memory */}
        <div className="bg-surface-800 rounded-lg border border-border p-4">
          <p className="text-xs text-text-muted mb-2">Memory</p>
          <p className="text-sm font-semibold text-text-primary mb-2">
            {formatMem(stats.mem_used_mb)} / {formatMem(stats.mem_total_mb)}
          </p>
          <ProgressBar
            value={stats.mem_used_mb}
            max={stats.mem_total_mb}
            color={memPct > 80 ? 'bg-accent-red' : memPct > 60 ? 'bg-yellow-500' : 'bg-accent-green'}
          />
          <p className="text-[10px] text-text-muted mt-1">{memPct.toFixed(0)}% used</p>
        </div>

        {/* Disk */}
        <div className="bg-surface-800 rounded-lg border border-border p-4">
          <p className="text-xs text-text-muted mb-2">Disk</p>
          <p className="text-sm font-semibold text-text-primary mb-2">
            {stats.disk_used_gb} GB / {stats.disk_total_gb} GB
          </p>
          <ProgressBar
            value={stats.disk_used_gb}
            max={stats.disk_total_gb}
            color={diskPct > 80 ? 'bg-accent-red' : diskPct > 60 ? 'bg-yellow-500' : 'bg-accent-green'}
          />
          <p className="text-[10px] text-text-muted mt-1">{diskPct.toFixed(0)}% used</p>
        </div>

        {/* Uptime */}
        <div className="bg-surface-800 rounded-lg border border-border p-4">
          <p className="text-xs text-text-muted mb-2">Uptime</p>
          <p className="text-sm font-semibold text-text-primary">{stats.uptime || 'N/A'}</p>
        </div>

        {/* Load Average */}
        <div className="bg-surface-800 rounded-lg border border-border p-4">
          <p className="text-xs text-text-muted mb-2">Load Average</p>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-text-primary">{stats.load_1.toFixed(2)}</span>
            <span className="text-xs text-text-muted">{stats.load_5.toFixed(2)}</span>
            <span className="text-xs text-text-dimmed">{stats.load_15.toFixed(2)}</span>
          </div>
          <p className="text-[10px] text-text-muted mt-1">1m / 5m / 15m</p>
        </div>
      </div>
    </div>
  )
}
