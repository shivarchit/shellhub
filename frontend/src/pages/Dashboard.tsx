import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import type { Server, ExecResult, QuickCommand, ServerInput } from '../lib/types'
import {
  getServers,
  createServer,
  updateServer,
  deleteServer,
  pingServer,
  execCommand,
  getSettings,
} from '../lib/api'
import Sidebar from '../components/Sidebar'
import ServerDetail from '../components/ServerDetail'
import AddEditServerModal from '../components/AddEditServerModal'
import ExecModal from '../components/ExecModal'
import ActivityFeed from '../components/ActivityFeed'
import BroadcastModal from '../components/BroadcastModal'
import Logo from '../components/Logo'
import StatusDot from '../components/StatusDot'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

interface ExecState {
  result: ExecResult
  command: QuickCommand
  duration: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [servers, setServers] = useState<Server[]>([])
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [onlineMap, setOnlineMap] = useState<Record<number, boolean>>({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [execResult, setExecResult] = useState<ExecState | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const [duplicateData, setDuplicateData] = useState<ServerInput | null>(null)
  const [loading, setLoading] = useState(true)
  const [pingInterval, setPingInterval] = useState(30 * 60 * 1000)

  const pingAll = useCallback(async (serverList: Server[]) => {
    const results = await Promise.allSettled(
      serverList.map((s) => pingServer(s.id))
    )
    const map: Record<number, boolean> = {}
    serverList.forEach((s, i) => {
      const r = results[i]
      map[s.id] = r.status === 'fulfilled' && r.value.online
    })
    setOnlineMap(map)
  }, [])

  const fetchServers = useCallback(async () => {
    const list = await getServers()
    setServers(list)
    setLoading(false)
    await pingAll(list)
  }, [pingAll])

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

  useEffect(() => {
    getSettings()
      .then((s) => {
        const min = parseInt(s.ping_interval || '30', 10)
        if (min > 0) setPingInterval(min * 60 * 1000)
      })
      .catch(() => {})
  }, [])

  const serversRef = useRef(servers)
  useEffect(() => {
    serversRef.current = servers
  }, [servers])

  useEffect(() => {
    if (pingInterval <= 0) return
    const id = setInterval(() => {
      const currentServers = serversRef.current
      if (currentServers.length === 0) return
      Promise.allSettled(currentServers.map((s) => pingServer(s.id))).then(
        (results) => {
          const map: Record<number, boolean> = {}
          currentServers.forEach((s, i) => {
            const r = results[i]
            map[s.id] = r.status === 'fulfilled' && r.value.online
          })
          setOnlineMap(map)
        }
      )
    }, pingInterval)
    return () => clearInterval(id)
  }, [pingInterval])

  const selectedServer = servers.find((s) => s.id === selectedId) ?? null

  const handleSelect = (id: number) => {
    setSelectedId(id)
  }

  const handleAdd = () => {
    setShowAddModal(true)
  }

  const handleEdit = () => {
    if (selectedServer) {
      setEditingServer(selectedServer)
    }
  }

  const handleDuplicate = () => {
    const srv = servers.find((s) => s.id === selectedId)
    if (!srv) return
    setEditingServer(null)
    setDuplicateData({
      name: `${srv.name} (Copy)`,
      host: srv.host,
      port: srv.port,
      username: srv.username,
      password: srv.password,
      group: srv.group,
      auth_type: srv.auth_type,
      private_key: srv.private_key,
      sort_order: 0,
      quick_commands: srv.quick_commands ?? [],
    })
    setShowAddModal(true)
  }

  const handleDelete = async () => {
    if (selectedId === null) return
    await deleteServer(selectedId)
    setSelectedId(null)
    await fetchServers()
  }

  const handleOpenTerminal = () => {
    if (selectedId !== null) {
      navigate(`/terminal/${selectedId}`)
    }
  }

  const handleSave = async (input: ServerInput) => {
    if (editingServer) {
      await updateServer(editingServer.id, input)
    } else {
      await createServer(input)
    }
    setShowAddModal(false)
    setEditingServer(null)
    setDuplicateData(null)
    await fetchServers()
  }

  const handleExecComplete = (result: ExecResult, command: QuickCommand) => {
    setExecResult({ result, command, duration: 0 })
  }

  const handleRerun = async () => {
    if (!execResult || selectedId === null || rerunning) return
    const { command } = execResult
    setRerunning(true)
    const start = performance.now()
    try {
      const result = await execCommand(selectedId, command.command, command.name)
      const elapsed = Math.round(performance.now() - start)
      setExecResult({ result, command, duration: elapsed })
    } catch (err) {
      const elapsed = Math.round(performance.now() - start)
      setExecResult({
        result: { output: err instanceof Error ? err.message : 'Command failed', exit_code: -1 },
        command,
        duration: elapsed,
      })
    } finally {
      setRerunning(false)
    }
  }

  const canBroadcast = user?.permissions?.can_exec_commands && servers.length > 0
  const onlineCount = servers.filter((s) => onlineMap[s.id]).length

  // Fleet health groups, in sidebar order.
  const groups: [string, Server[]][] = []
  for (const s of servers) {
    const name = s.group || 'Ungrouped'
    const found = groups.find(([g]) => g === name)
    if (found) found[1].push(s)
    else groups.push([name, [s]])
  }

  return (
    <div className="flex h-screen bg-surface-900 font-sans">
      <Sidebar
        servers={servers}
        selectedId={selectedId}
        onlineMap={onlineMap}
        onSelect={handleSelect}
        onAdd={handleAdd}
        onReorder={fetchServers}
        onHome={() => setSelectedId(null)}
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        </div>
      ) : selectedServer ? (
        <ServerDetail
          server={selectedServer}
          online={onlineMap[selectedServer.id] ?? false}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onOpenTerminal={handleOpenTerminal}
          onExecComplete={handleExecComplete}
        />
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Page header, aligned to the content column */}
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-text-primary">Overview</h1>
              <p className="text-xs text-text-muted">
                {servers.length === 0
                  ? 'No servers yet'
                  : `${onlineCount} of ${servers.length} server${servers.length === 1 ? '' : 's'} online`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {user?.permissions?.can_manage_servers && (
                <button
                  onClick={handleAdd}
                  className="px-3.5 py-2 text-sm font-medium text-text-secondary bg-surface-700 border border-border rounded-lg hover:bg-surface-600 transition-colors"
                >
                  Add Server
                </button>
              )}
              {canBroadcast && (
                <button
                  onClick={() => setShowBroadcast(true)}
                  className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-on-accent bg-accent-blue rounded-lg hover:opacity-90 transition-opacity"
                  title="Broadcast a command to multiple servers"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                    <path d="M4.5 4.5a5 5 0 000 7M11.5 4.5a5 5 0 010 7M2.5 2.5a8 8 0 000 11M13.5 2.5a8 8 0 010 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Broadcast
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Compact welcome strip */}
            <div className="flex items-center gap-3 bg-surface-800 border border-border rounded-xl px-4 py-3 mb-6">
              <Logo size={28} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  Welcome back, {user?.username ?? 'there'}
                </p>
                <p className="text-xs text-text-muted">
                  Select a server from the sidebar to open details, or run a command across the fleet.
                </p>
              </div>
            </div>

            {/* Fleet health */}
            {groups.length > 0 && (
              <>
                <p className="text-xs font-mono text-text-muted uppercase tracking-wider mb-2.5">Fleet health</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
                  {groups.map(([name, list]) => {
                    const up = list.filter((s) => onlineMap[s.id]).length
                    const degraded = up < list.length
                    return (
                      <div
                        key={name}
                        className={cn(
                          'bg-surface-800 border rounded-xl px-4 py-3',
                          degraded ? 'border-accent-red-dim' : 'border-border'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-text-primary truncate">{name}</span>
                          <span
                            className={cn(
                              'text-xs font-mono shrink-0',
                              degraded ? 'text-accent-red' : 'text-accent-green'
                            )}
                          >
                            {up}/{list.length} up
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden my-2.5">
                          <div
                            className={cn('h-full rounded-full transition-all', degraded ? 'bg-accent-red' : 'bg-accent-green')}
                            style={{ width: `${(up / list.length) * 100}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => handleSelect(s.id)}
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border transition-colors',
                                onlineMap[s.id]
                                  ? 'bg-surface-700 border-border text-text-secondary hover:text-text-primary'
                                  : 'bg-accent-red-bg border-accent-red-dim text-accent-red'
                              )}
                            >
                              <StatusDot online={!!onlineMap[s.id]} size="sm" />
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Recent activity */}
            <p className="text-xs font-mono text-text-muted uppercase tracking-wider mb-2.5">Recent Activity</p>
            <div className="bg-surface-800 border border-border rounded-xl p-3">
              <ActivityFeed />
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Server Modal */}
      {(showAddModal || editingServer) && (
        <AddEditServerModal
          server={editingServer}
          initialData={duplicateData ?? undefined}
          onSave={handleSave}
          onClose={() => {
            setShowAddModal(false)
            setEditingServer(null)
            setDuplicateData(null)
          }}
        />
      )}

      {/* Broadcast Modal */}
      {showBroadcast && (
        <BroadcastModal servers={servers} onlineMap={onlineMap} onClose={() => setShowBroadcast(false)} />
      )}

      {/* Exec Result Modal */}
      <ExecModal
        result={execResult?.result ?? null}
        command={execResult?.command ?? null}
        duration={execResult?.duration ?? 0}
        rerunning={rerunning}
        onClose={() => setExecResult(null)}
        onRerun={handleRerun}
      />
    </div>
  )
}
