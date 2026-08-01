import { useEffect, useState, useCallback, memo, useRef } from 'react'
import type { ServerStats } from '../lib/types'
import { getServerStats } from '../lib/api'

const CACHE_TTL_MS = 5 * 60 * 1000
const statsCache = new Map<number, { data: ServerStats; timestamp: number }>()

interface ServerStatsWidgetProps {
  serverId: number
  online: boolean
}

// All five stat cards share one anatomy: label / big value / fixed-height
// slot / mono footnote, so the eye-lines align across the row.
const GRID = 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3'

function barColor(pct: number): string {
  return pct > 80 ? 'bg-accent-red' : pct > 60 ? 'bg-accent-amber' : 'bg-accent-green'
}

function MetricCard({
  label,
  value,
  unit,
  pct,
  footnote,
}: {
  label: string
  value: string
  unit?: string
  // No stats-history endpoint exists, so cards without a ratio (uptime, load)
  // get a flat track instead of a sparkline. Swap in a spark when one lands.
  pct?: number
  footnote: string
}) {
  return (
    <div className="bg-surface-800 rounded-lg border border-border p-4 flex flex-col">
      <p className="text-xs text-text-muted mb-1.5">{label}</p>
      <p className="text-xl font-semibold text-text-primary leading-none truncate" title={`${value}${unit ?? ''}`}>
        {value}
        {unit && <span className="text-sm font-normal text-text-muted">{unit}</span>}
      </p>
      <div className="h-2 my-3 w-full bg-surface-700 rounded-full overflow-hidden">
        {pct !== undefined && (
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
          />
        )}
      </div>
      <p className="text-[10px] font-mono text-text-muted mt-auto truncate">{footnote}</p>
    </div>
  )
}

function formatMem(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`
  }
  return `${mb} MB`
}

function ServerStatsWidget({ serverId, online }: ServerStatsWidgetProps) {
  const [stats, setStats] = useState<ServerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  const fetchStats = useCallback(async (force = false) => {
    if (!online) {
      setStats(null)
      setError(null)
      setLoading(false)
      return
    }

    const cached = statsCache.get(serverId)
    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setStats(cached.data)
      setError(cached.data.online ? null : (cached.data.error || 'Server unreachable'))
      setLoading(false)
      return
    }

    try {
      const data = await getServerStats(serverId)
      statsCache.set(serverId, { data, timestamp: Date.now() })
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
    fetchedRef.current = false
  }, [serverId])

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    fetchStats()
  }, [fetchStats])

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
        <div className={GRID}>
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
      <div className={GRID}>
        <MetricCard
          label="CPU"
          value={stats.cpu.toFixed(0)}
          unit="%"
          pct={stats.cpu}
          footnote={`1m load ${stats.load_1.toFixed(2)}`}
        />
        <MetricCard
          label="Memory"
          value={formatMem(stats.mem_used_mb)}
          unit={` / ${formatMem(stats.mem_total_mb)}`}
          pct={memPct}
          footnote={`${memPct.toFixed(0)}% used`}
        />
        <MetricCard
          label="Disk"
          value={`${stats.disk_used_gb} GB`}
          unit={` / ${stats.disk_total_gb} GB`}
          pct={diskPct}
          footnote={`${diskPct.toFixed(0)}% used`}
        />
        <MetricCard
          label="Uptime"
          value={stats.uptime || 'N/A'}
          footnote="since last boot"
        />
        <MetricCard
          label="Load Average"
          value={stats.load_1.toFixed(2)}
          unit={` ${stats.load_5.toFixed(2)} ${stats.load_15.toFixed(2)}`}
          footnote="1m / 5m / 15m"
        />
      </div>
    </div>
  )
}

export default memo(ServerStatsWidget)
