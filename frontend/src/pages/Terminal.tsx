import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import type { Server } from '../lib/types'
import { getServers } from '../lib/api'
import ConnectionBar from '../components/ConnectionBar'
import CommandPanel from '../components/CommandPanel'
import TabBar, { type TabInfo } from '../components/TabBar'
import TerminalTab from '../components/TerminalTab'
import ServerPicker from '../components/ServerPicker'

function formatTime(totalSeconds: number): string {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

let tabCounter = 0
function generateTabId(): string {
  return `tab-${++tabCounter}-${Date.now()}`
}

interface TabState {
  id: string
  serverId: number
  server: Server | null
  connected: boolean
  elapsed: number
  recording: boolean
  recordingId: number | null
  termSize: { cols: number; rows: number }
}

export default function TerminalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [showPanel, setShowPanel] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showServerPicker, setShowServerPicker] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [disconnectedTab, setDisconnectedTab] = useState<TabState | null>(null)

  const timerRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const serversRef = useRef<Server[]>([])

  // Load servers
  useEffect(() => {
    getServers().then((servers) => {
      serversRef.current = servers
    })
  }, [])

  // Initialize first tab from URL
  useEffect(() => {
    if (!id) return
    const serverId = Number(id)

    getServers().then((servers) => {
      serversRef.current = servers
      const s = servers.find((sv) => sv.id === serverId)
      if (!s) {
        setNotFound(true)
        return
      }

      const tabId = generateTabId()
      const newTab: TabState = {
        id: tabId,
        serverId,
        server: s,
        connected: false,
        elapsed: 0,
        recording: false,
        recordingId: null,
        termSize: { cols: 80, rows: 24 },
      }
      setTabs([newTab])
      setActiveTabId(tabId)
    })
  }, [id])

  // Block tab close while connected
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (tabs.some((t) => t.connected)) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [tabs])

  // Keyboard shortcuts for tab management
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+T: new tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        setShowServerPicker(true)
        return
      }
      // Ctrl+W: close tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          handleCloseTab(activeTabId)
        }
        return
      }
      // Ctrl+1-9: switch tabs
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < tabs.length) {
          setActiveTabId(tabs[idx].id)
        }
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, tabs])

  const handleConnected = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, connected: true } : t))
    )
    // Start timer
    timerRefs.current[tabId] = setInterval(() => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, elapsed: t.elapsed + 1 } : t))
      )
    }, 1000)
  }, [])

  const handleDisconnected = useCallback((tabId: string) => {
    setTabs((prev) => {
      const updated = prev.map((t) =>
        t.id === tabId ? { ...t, connected: false, recording: false } : t
      )
      const tab = updated.find((t) => t.id === tabId)
      if (tab) {
        setDisconnectedTab(tab)
        setShowDisconnectModal(true)
      }
      return updated
    })
    if (timerRefs.current[tabId]) {
      clearInterval(timerRefs.current[tabId])
      delete timerRefs.current[tabId]
    }
  }, [])

  const handleRecordingStarted = useCallback((tabId: string, recId: number) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId ? { ...t, recording: true, recordingId: recId } : t
      )
    )
  }, [])

  const handleRecordingStopped = useCallback((tabId: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId ? { ...t, recording: false, recordingId: null } : t
      )
    )
  }, [])

  const handleTermSize = useCallback((tabId: string, cols: number, rows: number) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, termSize: { cols, rows } } : t))
    )
  }, [])

  const handleNewTab = useCallback(() => {
    setShowServerPicker(true)
  }, [])

  const handleServerSelect = useCallback((server: Server) => {
    const tabId = generateTabId()
    const newTab: TabState = {
      id: tabId,
      serverId: server.id,
      server,
      connected: false,
      elapsed: 0,
      recording: false,
      recordingId: null,
      termSize: { cols: 80, rows: 24 },
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(tabId)
    setShowServerPicker(false)
  }, [])

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId)
      if (tab?.connected) {
        const confirmed = window.confirm(
          `"${tab.server?.name}" is still connected. Close anyway?`
        )
        if (!confirmed) return
      }

      // Disconnect via DOM
      const el = document.querySelector(`[data-tab-id="${tabId}"]`)
      if (el) {
        (el as any).__disconnect?.()
      }

      if (timerRefs.current[tabId]) {
        clearInterval(timerRefs.current[tabId])
        delete timerRefs.current[tabId]
      }

      setTabs((prev) => {
        const newTabs = prev.filter((t) => t.id !== tabId)
        if (activeTabId === tabId && newTabs.length > 0) {
          setActiveTabId(newTabs[newTabs.length - 1].id)
        }
        if (newTabs.length === 0) {
          navigate('/')
        }
        return newTabs
      })
    },
    [tabs, activeTabId, navigate]
  )

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId)
  }, [])

  const handleToggleRecording = useCallback((tabId: string) => {
    const el = document.querySelector(`[data-tab-id="${tabId}"]`)
    if (el) {
      (el as any).__toggleRecording?.()
    }
  }, [])

  const handlePaste = useCallback(
    (text: string) => {
      const el = document.querySelector(`[data-tab-id="${activeTabId}"]`)
      if (el) {
        (el as any).__pasteText?.(text)
      }
    },
    [activeTabId]
  )

  const handleDisconnect = useCallback(() => {
    const el = document.querySelector(`[data-tab-id="${activeTabId}"]`)
    if (el) {
      (el as any).__disconnect?.()
    }
  }, [activeTabId])

  const handleBack = useCallback(() => {
    navigate('/')
  }, [navigate])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (notFound) {
    return (
      <div className="flex flex-col h-screen bg-surface-900 items-center justify-center gap-4">
        <div className="text-text-secondary text-lg">Server not found</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 text-sm bg-surface-700 text-text-primary rounded-md hover:bg-surface-600 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const tabInfos: TabInfo[] = tabs.map((t) => ({
    id: t.id,
    serverId: t.serverId,
    serverName: t.server?.name ?? 'Connecting...',
    connected: t.connected,
    recording: t.recording,
  }))

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      {/* Connection bar */}
      <ConnectionBar
        server={activeTab?.server ?? null}
        connected={activeTab?.connected ?? false}
        elapsed={activeTab?.elapsed ?? 0}
        recording={activeTab?.recording ?? false}
        onDisconnect={handleDisconnect}
        onBack={handleBack}
        onToggleRecording={() => activeTab && handleToggleRecording(activeTab.id)}
      />

      {/* Tab bar (only show if more than 1 tab) */}
      {tabs.length > 0 && (
        <TabBar
          tabs={tabInfos}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onNewTab={handleNewTab}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Terminal tabs area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 flex min-h-0 relative">
            {tabs.map((tab) => (
              <TerminalTab
                key={tab.id}
                serverId={tab.serverId}
                tabId={tab.id}
                active={tab.id === activeTabId}
                onConnected={handleConnected}
                onDisconnected={handleDisconnected}
                onRecordingStarted={handleRecordingStarted}
                onRecordingStopped={handleRecordingStopped}
                onTermSize={handleTermSize}
                onElapsedTick={() => {}}
                recording={tab.recording}
              />
            ))}
          </div>

          {/* Status bar */}
          {activeTab && (
            <div className="flex items-center justify-between bg-surface-800 border-t border-border px-4 py-1">
              <div className="flex items-center gap-3 text-xs font-mono text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      activeTab.connected ? 'bg-accent-green' : 'bg-accent-red'
                    }`}
                  />
                  SSH
                </span>
                {activeTab.server && (
                  <span>
                    {activeTab.server.username}@{activeTab.server.host}
                  </span>
                )}
                <span>UTF-8</span>
                {activeTab.recording && (
                  <span className="flex items-center gap-1 text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    REC
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-text-muted">
                <span>
                  {activeTab.termSize.cols} x {activeTab.termSize.rows}
                </span>
                <span>{formatTime(activeTab.elapsed)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Command panel */}
        {showPanel && activeTab?.connected && (
          <div className="relative z-10 flex-shrink-0 h-full">
            <CommandPanel
              server={activeTab.server}
              onPasteToTerminal={handlePaste}
              onClose={() => setShowPanel(false)}
            />
          </div>
        )}

        {/* Panel toggle button when closed */}
        {!showPanel && activeTab?.connected && (
          <button
            onClick={() => setShowPanel(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-surface-800 border border-border border-r-0 rounded-l-md px-1.5 py-3 text-text-muted hover:text-text-primary transition-colors"
            title="Open command panel"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 4L6 8L10 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Server picker modal */}
      {showServerPicker && (
        <ServerPicker
          onSelect={handleServerSelect}
          onClose={() => setShowServerPicker(false)}
        />
      )}

      {/* Disconnect modal */}
      {showDisconnectModal && disconnectedTab && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface-800 border border-border rounded-xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent-red-bg border border-accent-red-dim flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Session Ended
            </h3>
            <p className="text-sm text-text-muted mb-2">
              {disconnectedTab.server?.name && (
                <span className="text-text-secondary font-medium">
                  {disconnectedTab.server.name}
                </span>
              )}
            </p>
            <p className="text-xs text-text-muted mb-6">
              Session lasted {formatTime(disconnectedTab.elapsed)}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-surface-700 text-text-primary hover:bg-surface-600 transition-colors"
              >
                Keep Tab
              </button>
              <button
                onClick={() => {
                  setShowDisconnectModal(false)
                  if (tabs.length <= 1) {
                    handleBack()
                  } else {
                    handleCloseTab(disconnectedTab.id)
                  }
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors"
              >
                {tabs.length <= 1 ? 'Back to Dashboard' : 'Close Tab'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
