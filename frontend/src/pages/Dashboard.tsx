import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Server, ExecResult, QuickCommand, ServerInput } from '../lib/types'
import {
  getServers,
  createServer,
  updateServer,
  deleteServer,
  pingServer,
} from '../lib/api'
import Sidebar from '../components/Sidebar'
import ServerDetail from '../components/ServerDetail'
import AddEditServerModal from '../components/AddEditServerModal'
import ExecModal from '../components/ExecModal'

interface ExecState {
  result: ExecResult
  command: QuickCommand
  duration: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [servers, setServers] = useState<Server[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [onlineMap, setOnlineMap] = useState<Record<number, boolean>>({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [execResult, setExecResult] = useState<ExecState | null>(null)

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
    await pingAll(list)
  }, [pingAll])

  useEffect(() => {
    fetchServers()
  }, [fetchServers])

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
    await fetchServers()
  }

  const handleExecComplete = (result: ExecResult, command: QuickCommand) => {
    setExecResult({ result, command, duration: 0 })
  }

  const handleRerun = async () => {
    if (!execResult || selectedId === null) return
    const { command } = execResult
    setExecResult(null)
    const start = performance.now()
    try {
      const result = await import('../lib/api').then((api) =>
        api.execCommand(selectedId, command.command)
      )
      const elapsed = Math.round(performance.now() - start)
      setExecResult({ result, command, duration: elapsed })
    } catch {
      // silently fail on rerun
    }
  }

  return (
    <div className="flex h-screen bg-surface-900 font-sans">
      <Sidebar
        servers={servers}
        selectedId={selectedId}
        onlineMap={onlineMap}
        onSelect={handleSelect}
        onAdd={handleAdd}
      />

      {selectedServer ? (
        <ServerDetail
          server={selectedServer}
          online={onlineMap[selectedServer.id] ?? false}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onOpenTerminal={handleOpenTerminal}
          onExecComplete={handleExecComplete}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
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
        </div>
      )}

      {/* Add/Edit Server Modal */}
      {(showAddModal || editingServer) && (
        <AddEditServerModal
          server={editingServer}
          onSave={handleSave}
          onClose={() => {
            setShowAddModal(false)
            setEditingServer(null)
          }}
        />
      )}

      {/* Exec Result Modal */}
      <ExecModal
        result={execResult?.result ?? null}
        command={execResult?.command ?? null}
        duration={execResult?.duration ?? 0}
        onClose={() => setExecResult(null)}
        onRerun={handleRerun}
      />
    </div>
  )
}
