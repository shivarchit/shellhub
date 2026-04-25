import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

import type { Server } from '../lib/types'
import { getServers } from '../lib/api'
import { createTerminalSocket, sendResize } from '../lib/ws'
import ConnectionBar from '../components/ConnectionBar'
import CommandPanel from '../components/CommandPanel'

function formatTime(totalSeconds: number): string {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export default function TerminalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [server, setServer] = useState<Server | null>(null)
  const [connected, setConnected] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [showPanel, setShowPanel] = useState(true)
  const [termSize, setTermSize] = useState({ cols: 80, rows: 24 })
  const [notFound, setNotFound] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)

  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const connectedRef = useRef(false)

  // Block tab close / browser navigation while connected
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (connectedRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Keep ref in sync with state
  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  // Main mount effect
  useEffect(() => {
    if (!id) return

    const serverId = Number(id)

    getServers().then((servers) => {
      const s = servers.find((sv) => sv.id === serverId)
      if (s) {
        setServer(s)
      } else {
        setNotFound(true)
      }
    })

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background: '#06090f',
        foreground: '#e8edf5',
        cursor: '#22c55e',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
        black: '#06090f',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e8edf5',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    if (terminalRef.current) {
      term.open(terminalRef.current)
      requestAnimationFrame(() => fitAddon.fit())
    }

    const ws = createTerminalSocket(serverId)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setConnected(true)
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1)
      }, 1000)
      sendResize(ws, term.cols, term.rows)
    }

    ws.onmessage = (event: MessageEvent) => {
      term.write(new Uint8Array(event.data as ArrayBuffer))
    }

    ws.onclose = () => {
      setConnected(false)
      if (timerRef.current) clearInterval(timerRef.current)
      term.write('\r\n\x1b[31mDisconnected.\x1b[0m\r\n')
      setShowDisconnectModal(true)
    }

    ws.onerror = () => {
      term.write('\r\n\x1b[31mConnection error.\x1b[0m\r\n')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data))
      }
    })

    term.onResize(({ cols, rows }) => {
      sendResize(ws, cols, rows)
      setTermSize({ cols, rows })
    })

    xtermRef.current = term
    wsRef.current = ws
    fitAddonRef.current = fitAddon

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (timerRef.current) clearInterval(timerRef.current)
      ws.close()
      term.dispose()
    }
  }, [id])

  // Re-fit terminal when panel toggles
  useEffect(() => {
    const timeout = setTimeout(() => fitAddonRef.current?.fit(), 0)
    return () => clearTimeout(timeout)
  }, [showPanel])

  const handlePaste = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(new TextEncoder().encode(text))
    }
  }, [])

  const handleDisconnect = useCallback(() => {
    wsRef.current?.close()
  }, [])

  const handleBack = useCallback(() => {
    navigate('/')
  }, [navigate])

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

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      {/* Connection bar */}
      <ConnectionBar
        server={server}
        connected={connected}
        elapsed={elapsed}
        onDisconnect={handleDisconnect}
        onBack={handleBack}
      />

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Terminal area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={terminalRef} className="flex-1 min-h-0 p-1" />

          {/* Status bar */}
          <div className="flex items-center justify-between bg-surface-800 border-t border-border px-4 py-1">
            <div className="flex items-center gap-3 text-xs font-mono text-text-muted">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-accent-green' : 'bg-accent-red'}`} />
                SSH
              </span>
              {server && (
                <span>
                  {server.username}@{server.host}
                </span>
              )}
              <span>UTF-8</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-text-muted">
              <span>
                {termSize.cols} x {termSize.rows}
              </span>
              <span>{formatTime(elapsed)}</span>
            </div>
          </div>
        </div>

        {/* Command panel */}
        {showPanel && connected && (
          <CommandPanel
            server={server}
            onPasteToTerminal={handlePaste}
            onClose={() => setShowPanel(false)}
          />
        )}

        {/* Panel toggle button when closed */}
        {!showPanel && connected && (
          <button
            onClick={() => setShowPanel(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-surface-800 border border-border border-r-0 rounded-l-md px-1.5 py-3 text-text-muted hover:text-text-primary transition-colors"
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

      {/* Disconnect modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface-800 border border-border rounded-xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent-red-bg border border-accent-red-dim flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">Session Ended</h3>
            <p className="text-sm text-text-muted mb-2">
              {server?.name && (
                <span className="text-text-secondary font-medium">{server.name}</span>
              )}
            </p>
            <p className="text-xs text-text-muted mb-6">
              Session lasted {formatTime(elapsed)}
            </p>
            <button
              onClick={handleBack}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
