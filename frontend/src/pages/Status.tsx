import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { getServers, pingServer, getMetrics } from '../lib/api'
import type { Server, MetricsResponse } from '../lib/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Sparkline({ points }: { points: number[] }) {
  if (!points.length) return null
  const width = 80
  const height = 30
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1 || 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent-blue"
      />
    </svg>
  )
}

function uptimeColor(pct: number): string {
  if (pct >= 95) return 'text-accent-green'
  if (pct >= 80) return 'text-accent-amber'
  return 'text-accent-red'
}

function uptimeBarColor(pct: number): string {
  if (pct >= 95) return 'bg-accent-green'
  if (pct >= 80) return 'bg-accent-amber'
  return 'bg-accent-red'
}

export default function Status() {
  const navigate = useNavigate()
  const [servers, setServers] = useState<Server[]>([])
  const [onlineMap, setOnlineMap] = useState<Record<number, boolean>>({})
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [pingTimes, setPingTimes] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [svrs, met] = await Promise.all([
          getServers(),
          getMetrics('7d'),
        ])
        setServers(svrs)
        setMetrics(met)

        const now = new Date().toISOString()
        const results = await Promise.allSettled(
          svrs.map((s) => pingServer(s.id))
        )
        const online: Record<number, boolean> = {}
        const times: Record<number, string> = {}
        results.forEach((r, i) => {
          online[svrs[i].id] = r.status === 'fulfilled' && r.value.online
          times[svrs[i].id] = now
        })
        setOnlineMap(online)
        setPingTimes(times)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const grouped = servers.reduce<Record<string, Server[]>>((acc, s) => {
    const key = s.group || 'Ungrouped'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  const getUptime = (serverId: number): number | null => {
    if (!metrics?.uptimes) return null
    const entry = metrics.uptimes.find((u) => u.server_id === serverId)
    return entry ? entry.uptime : null
  }

  const getLatencyPoints = (serverId: number): number[] => {
    if (!metrics?.latencies) return []
    const points = metrics.latencies[String(serverId)]
    if (!points) return []
    return points.slice(-7).map((p) => p.avg_ms)
  }

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-surface-700 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Status</h1>
            <p className="text-xs text-text-muted font-mono">server health overview</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-text-muted text-xs font-mono">
          {metrics?.summary && (
            <span>
              {metrics.summary.online_servers}/{metrics.summary.total_servers} online
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-text-muted font-mono text-sm">pinging servers...</div>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([group, groupServers]) => (
              <div key={group}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                    {group}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-surface-700 text-text-muted text-xs font-mono">
                    {groupServers.length}
                  </span>
                </div>

                {/* Server grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {groupServers.map((server) => {
                    const online = onlineMap[server.id] ?? false
                    const uptime = getUptime(server.id)
                    const latency = getLatencyPoints(server.id)
                    const pingedAt = pingTimes[server.id]

                    return (
                      <div
                        key={server.id}
                        className="bg-surface-800 border border-border rounded-xl p-4 hover:border-border-medium transition-all duration-150 hover:scale-[1.01]"
                      >
                        {/* Status + Name */}
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              online ? 'bg-accent-green' : 'bg-accent-red'
                            }`}
                          />
                          <span className="text-sm font-medium text-text-primary truncate">
                            {server.name}
                          </span>
                        </div>

                        {/* Host:port */}
                        <div className="text-xs text-text-muted font-mono mb-3">
                          {server.host}:{server.port}
                        </div>

                        {/* Status label */}
                        <div className="flex items-center justify-between mb-3">
                          <span
                            className={`text-xs font-mono ${
                              online ? 'text-accent-green' : 'text-accent-red'
                            }`}
                          >
                            {online ? 'Online' : 'Offline'}
                          </span>
                          {uptime !== null && (
                            <span className={`text-xs font-mono ${uptimeColor(uptime)}`}>
                              {uptime.toFixed(1)}% up
                            </span>
                          )}
                        </div>

                        {/* Uptime bar */}
                        {uptime !== null && (
                          <div className="w-full h-1 bg-surface-700 rounded-full mb-3">
                            <div
                              className={`h-full rounded-full ${uptimeBarColor(uptime)}`}
                              style={{ width: `${Math.min(uptime, 100)}%` }}
                            />
                          </div>
                        )}

                        {/* Sparkline */}
                        {latency.length > 0 && (
                          <div className="mb-2">
                            <Sparkline points={latency} />
                          </div>
                        )}

                        {/* Last pinged */}
                        {pingedAt && (
                          <div className="text-[10px] text-text-muted font-mono">
                            pinged {timeAgo(pingedAt)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
