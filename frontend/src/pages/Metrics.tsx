import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MetricsResponse } from '../lib/types'
import { getMetrics } from '../lib/api'

type TimeRange = '24h' | '7d' | '30d'

function SummaryCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface-800 rounded-xl border border-border p-5 hover:border-border-medium transition-colors">
      <p className="text-[11px] text-text-muted mb-2 uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-3xl font-bold text-text-primary tabular-nums">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1.5">{sub}</p>}
    </div>
  )
}

function BarChart({ data, maxVal, color }: { data: { key: string; value: number }[]; maxVal: number; color: string }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">No data for this period</div>
    )
  }
  return (
    <div>
      <div className="flex items-end gap-[3px] h-40">
        {data.map((d) => {
          const height = maxVal > 0 ? (d.value / maxVal) * 100 : 0
          return (
            <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-700 text-text-primary text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none z-10">
                {d.value}
              </div>
              <div
                className={`w-full rounded-t transition-all duration-300 min-h-[2px] ${color}`}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-[3px] mt-2">
        {data.map((d, i) => (
          <div key={d.key} className="flex-1 text-center">
            {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
              <span className="text-[10px] text-text-muted">{formatDateLabel(d.key)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StackedBarChart({ data }: { data: { key: string; success: number; failure: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">No data for this period</div>
    )
  }
  const maxVal = Math.max(...data.map(d => d.success + d.failure), 1)
  return (
    <div>
      <div className="flex items-end gap-[3px] h-40">
        {data.map((d) => {
          const successH = maxVal > 0 ? (d.success / maxVal) * 100 : 0
          const failureH = maxVal > 0 ? (d.failure / maxVal) * 100 : 0
          return (
            <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-700 text-text-primary text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none z-10">
                {d.success + d.failure} ({d.failure} failed)
              </div>
              <div className="w-full flex flex-col justify-end" style={{ height: `${Math.max(successH + failureH, 2)}%` }}>
                {d.failure > 0 && (
                  <div
                    className="w-full bg-accent-red rounded-t"
                    style={{ height: `${(d.failure / (d.success + d.failure)) * 100}%`, minHeight: '2px' }}
                  />
                )}
                <div
                  className="w-full bg-accent-green"
                  style={{ height: `${(d.success / (d.success + d.failure || 1)) * 100}%`, minHeight: d.success > 0 ? '2px' : '0' }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-[3px] mt-2">
        {data.map((d, i) => (
          <div key={d.key} className="flex-1 text-center">
            {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
              <span className="text-[10px] text-text-muted">{formatDateLabel(d.key)}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent-green" />
          <span className="text-[10px] text-text-muted">Success</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent-red" />
          <span className="text-[10px] text-text-muted">Failed</span>
        </div>
      </div>
    </div>
  )
}

function HorizontalBarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">No data for this period</div>
    )
  }
  const maxVal = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-text-secondary w-28 truncate flex-shrink-0" title={d.label}>{d.label}</span>
          <div className="flex-1 h-5 bg-surface-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-blue rounded-full transition-all duration-300"
              style={{ width: `${(d.value / maxVal) * 100}%` }}
            />
          </div>
          <span className="text-xs text-text-muted w-10 text-right font-mono">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

function SVGLineChart({ series, height = 140 }: { series: { name: string; points: { x: number; y: number }[]; color: string }[]; height?: number }) {
  if (series.length === 0 || series.every(s => s.points.length === 0)) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">No data for this period</div>
    )
  }

  const width = 400
  const padding = 12

  const allYs = series.flatMap(s => s.points.map(p => p.y))
  const maxY = Math.max(...allYs, 1)
  const allXs = series.flatMap(s => s.points.map(p => p.x))
  const minX = Math.min(...allXs, 0)
  const maxX = Math.max(...allXs, 1)

  const scaleX = (x: number) => padding + ((x - minX) / (maxX - minX || 1)) * (width - padding * 2)
  const scaleY = (y: number) => height - padding - (y / maxY) * (height - padding * 2)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet" style={{ height: `${height}px` }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => (
        <line
          key={frac}
          x1={padding}
          y1={scaleY(frac * maxY)}
          x2={width - padding}
          y2={scaleY(frac * maxY)}
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-surface-600"
          strokeDasharray="4 4"
        />
      ))}
      {/* Lines */}
      {series.map(s => {
        if (s.points.length < 2) return null
        const path = s.points.map((p, i) =>
          `${i === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`
        ).join(' ')
        return (
          <path
            key={s.name}
            d={path}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}
      {/* Dots */}
      {series.map(s =>
        s.points.map((p, i) => (
          <circle
            key={`${s.name}-${i}`}
            cx={scaleX(p.x)}
            cy={scaleY(p.y)}
            r="3"
            fill={s.color}
          />
        ))
      )}
    </svg>
  )
}

function UptimeChart({ data }: { data: { server_name: string; uptime: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">No uptime data yet</div>
    )
  }
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const color = d.uptime >= 99 ? 'bg-accent-green' : d.uptime >= 95 ? 'bg-yellow-500' : 'bg-accent-red'
        return (
          <div key={d.server_name} className="flex items-center gap-3">
            <span className="text-xs text-text-secondary w-28 truncate flex-shrink-0" title={d.server_name}>
              {d.server_name}
            </span>
            <div className="flex-1 h-5 bg-surface-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all duration-300`}
                style={{ width: `${d.uptime}%` }}
              />
            </div>
            <span className="text-xs text-text-muted w-14 text-right font-mono">
              {d.uptime.toFixed(1)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`
  }
  return dateStr
}

const LINE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export default function Metrics() {
  const navigate = useNavigate()
  const [range, setRange] = useState<TimeRange>('7d')
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getMetrics(range)
      .then((data) => {
        if (!cancelled) setMetrics(data)
      })
      .catch(() => {
        if (!cancelled) setMetrics(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [range])

  const connectionData = useMemo(() => {
    if (!metrics?.connections) return []
    return metrics.connections.map(c => ({ key: c.date, value: c.count }))
  }, [metrics])

  const execData = useMemo(() => {
    if (!metrics?.executions) return []
    return metrics.executions.map(e => ({ key: e.date, success: e.success, failure: e.failure }))
  }, [metrics])

  const topServersData = useMemo(() => {
    if (!metrics?.top_servers) return []
    return metrics.top_servers.map(s => ({ label: s.server_name, value: s.count }))
  }, [metrics])

  const latencySeries = useMemo(() => {
    if (!metrics?.latencies) return []
    return Object.entries(metrics.latencies).map(([name, points], idx) => ({
      name,
      color: LINE_COLORS[idx % LINE_COLORS.length],
      points: (points || []).map((p, i) => ({ x: i, y: p.avg_ms })),
    }))
  }, [metrics])

  const connectionMax = useMemo(() => {
    return Math.max(...connectionData.map(d => d.value), 1)
  }, [connectionData])

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-700 transition-colors"
            title="Back to Dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-text-primary">Metrics Dashboard</h1>
        </div>

        {/* Time range selector */}
        <div className="flex items-center gap-1 bg-surface-700 rounded-lg p-1">
          {(['24h', '7d', '30d'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                range === r
                  ? 'bg-accent-blue text-white'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !metrics ? (
          <div className="text-center py-12 text-text-muted">Failed to load metrics</div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Total Servers" value={metrics.summary?.total_servers ?? 0} />
              <SummaryCard
                label="Online Now"
                value={metrics.summary?.online_servers ?? 0}
                sub={`of ${metrics.summary?.total_servers ?? 0}`}
              />
              <SummaryCard label="Commands Today" value={metrics.summary?.total_execs_today ?? 0} />
              <SummaryCard
                label="Avg Uptime"
                value={`${(metrics.summary?.avg_uptime ?? 0).toFixed(1)}%`}
                sub={`last ${range}`}
              />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Uptime Per Server */}
              <div className="bg-surface-800 rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">Server Uptime</h3>
                <UptimeChart data={(metrics.uptimes || []).map(u => ({ server_name: u.server_name, uptime: u.uptime }))} />
              </div>

              {/* Connections Over Time */}
              <div className="bg-surface-800 rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">Connections Over Time</h3>
                <BarChart data={connectionData} maxVal={connectionMax} color="bg-accent-blue" />
              </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Command Executions */}
              <div className="bg-surface-800 rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">Command Executions</h3>
                <StackedBarChart data={execData} />
              </div>

              {/* Top Servers */}
              <div className="bg-surface-800 rounded-xl border border-border p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">Top Servers by Activity</h3>
                <HorizontalBarChart data={topServersData} />
              </div>
            </div>

            {/* Charts Row 3 */}
            <div className="bg-surface-800 rounded-xl border border-border p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Average Latency Trend</h3>
              {latencySeries.length > 0 ? (
                <>
                  <SVGLineChart series={latencySeries} height={140} />
                  <div className="flex flex-wrap items-center gap-4 mt-3">
                    {latencySeries.map(s => (
                      <div key={s.name} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-[10px] text-text-muted">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-text-muted text-sm">No latency data yet</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
