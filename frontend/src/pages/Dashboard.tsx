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
import { useAuth } from '../lib/auth'

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

  return (
    <div className="flex h-screen bg-surface-900 font-sans">
      {canBroadcast && !selectedServer && (
        <button
          onClick={() => setShowBroadcast(true)}
          className="fixed top-4 right-5 z-40 flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-text-secondary bg-surface-800 border border-border rounded-lg hover:border-accent-blue hover:text-accent-blue transition-colors shadow-lg"
          title="Broadcast a command to multiple servers"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="1.5" fill="currentColor" />
            <path d="M4.5 4.5a5 5 0 000 7M11.5 4.5a5 5 0 010 7M2.5 2.5a8 8 0 000 11M13.5 2.5a8 8 0 010 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Broadcast
        </button>
      )}

      <Sidebar
        servers={servers}
        selectedId={selectedId}
        onlineMap={onlineMap}
        onSelect={handleSelect}
        onAdd={handleAdd}
        onReorder={fetchServers}
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
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 border border-accent-blue/20">
              <span className="text-2xl font-mono text-accent-blue font-bold">
                {'>'}_
              </span>
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Welcome to ShellHub
            </h2>
            <p className="text-sm text-text-muted max-w-xs">
              Select a server from the sidebar to view details and run commands,
              or add a new one to get started.
            </p>
          </div>
          <div className="w-full max-w-lg">
            <div className="flex items-center gap-2 mb-3 px-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                <path d="M2 3h12M2 7h8M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Recent Activity</span>
            </div>
            <div className="bg-surface-800 border border-border rounded-xl p-3 max-h-[400px] overflow-y-auto">
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
        <BroadcastModal servers={servers} onClose={() => setShowBroadcast(false)} />
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
