import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'

import { createTerminalSocket, sendResize } from '../lib/ws'
import TerminalSearch from './TerminalSearch'

interface TerminalTabProps {
  serverId: number
  tabId: string
  active: boolean
  onConnected: (tabId: string) => void
  onDisconnected: (tabId: string) => void
  onRecordingStarted: (tabId: string, recId: number) => void
  onRecordingStopped: (tabId: string) => void
  onTermSize: (tabId: string, cols: number, rows: number) => void
  onElapsedTick?: (tabId: string) => void
  recording: boolean
}

export default function TerminalTab({
  serverId,
  tabId,
  active,
  onConnected,
  onDisconnected,
  onRecordingStarted,
  onRecordingStopped,
  onTermSize,
  recording,
}: TerminalTabProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [connected, setConnected] = useState(false)
  const mountedRef = useRef(false)

  // Initialize terminal on mount
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      allowProposedApi: true,
      rightClickSelectsWord: true,
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
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(searchAddon)

    if (terminalRef.current) {
      term.open(terminalRef.current)
      requestAnimationFrame(() => fitAddon.fit())

      // Auto-copy on selection
      term.onSelectionChange(() => {
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {})
        }
      })

      // Right-click paste
      terminalRef.current.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
          term.clearSelection()
        } else {
          navigator.clipboard.readText().then((text) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(new TextEncoder().encode(text))
            }
          })
        }
      })
    }

    const ws = createTerminalSocket(serverId)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setConnected(true)
      onConnected(tabId)
      sendResize(ws, term.cols, term.rows)
    }

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        // JSON control message
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'recording_started') {
            onRecordingStarted(tabId, msg.id)
          } else if (msg.type === 'recording_stopped') {
            onRecordingStopped(tabId)
          }
        } catch {
          // ignore
        }
        return
      }
      term.write(new Uint8Array(event.data as ArrayBuffer))
    }

    ws.onclose = () => {
      setConnected(false)
      onDisconnected(tabId)
      term.write('\r\n\x1b[31mDisconnected.\x1b[0m\r\n')
    }

    ws.onerror = () => {
      term.write('\r\n\x1b[31mConnection error.\x1b[0m\r\n')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data))
      }
    })

    // Keyboard shortcuts
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true
      // Ctrl+C: copy if text selected, otherwise send SIGINT
      if (e.ctrlKey && !e.shiftKey && e.key === 'c' && e.type === 'keydown') {
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
          term.clearSelection()
          return false // don't send to terminal
        }
        // no selection - let SIGINT pass through
      }
      // Ctrl+Shift+C to copy
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        const sel = term.getSelection()
        if (sel) navigator.clipboard.writeText(sel)
        return false
      }
      // Ctrl+Shift+V to paste
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        navigator.clipboard.readText().then((text) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(new TextEncoder().encode(text))
          }
        })
        return false
      }
      // Ctrl+F to search
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        return false
      }
      return true
    })

    term.onResize(({ cols, rows }) => {
      sendResize(ws, cols, rows)
      onTermSize(tabId, cols, rows)
    })

    xtermRef.current = term
    wsRef.current = ws
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      ws.close()
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fit when tab becomes active
  useEffect(() => {
    if (active) {
      const timeout = setTimeout(() => {
        fitAddonRef.current?.fit()
        xtermRef.current?.focus()
      }, 0)
      return () => clearTimeout(timeout)
    }
  }, [active])

  // Expose paste function via a data attribute on the container
  const pasteText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(new TextEncoder().encode(text))
    }
  }, [])

  // Store pasteText on the DOM element for parent access
  useEffect(() => {
    const el = terminalRef.current?.parentElement
    if (el) {
      (el as any).__pasteText = pasteText;
      (el as any).__disconnect = () => wsRef.current?.close();
      (el as any).__isConnected = () => connected;
      (el as any).__toggleRecording = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          if (recording) {
            wsRef.current.send(JSON.stringify({ type: 'stop_recording' }))
          } else {
            wsRef.current.send(JSON.stringify({ type: 'start_recording' }))
          }
        }
      }
    }
  }, [pasteText, connected, recording])

  // Toggle recording via prop callback - send ws message
  useEffect(() => {
    // This is handled via the __toggleRecording method on the DOM
  }, [recording])

  return (
    <div
      className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative"
      style={{ display: active ? 'flex' : 'none' }}
      data-tab-id={tabId}
    >
      {/* Search overlay */}
      {showSearch && (
        <TerminalSearch
          searchAddon={searchAddonRef.current}
          onClose={() => setShowSearch(false)}
        />
      )}

      <div ref={terminalRef} className="flex-1 min-h-0 p-1 overflow-hidden" />
    </div>
  )
}
