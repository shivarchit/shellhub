import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import type { SessionRecording } from '../lib/types'
import { getRecordings, getRecording, deleteRecording } from '../lib/api'
import Logo from '../components/Logo'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'Z')
  return d.toLocaleString()
}

interface AsciicastEvent {
  time: number
  type: string
  data: string
}

function parseAsciicast(data: string): { header: any; events: AsciicastEvent[] } {
  const lines = data.trim().split('\n')
  if (lines.length === 0) return { header: {}, events: [] }

  let header: any = {}
  const events: AsciicastEvent[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const parsed = JSON.parse(line)
      if (i === 0 && parsed.version) {
        header = parsed
      } else if (Array.isArray(parsed) && parsed.length >= 3) {
        events.push({
          time: parsed[0],
          type: parsed[1],
          data: parsed[2],
        })
      }
    } catch {
      // skip malformed lines
    }
  }

  return { header, events }
}

function RecordingPlayer({
  recording,
  onClose,
}: {
  recording: SessionRecording
  onClose: () => void
}) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const eventsRef = useRef<AsciicastEvent[]>([])
  const playingRef = useRef(false)
  const speedRef = useRef(1)
  const eventIndexRef = useRef(0)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    if (!recording.data) return

    const { events } = parseAsciicast(recording.data)
    eventsRef.current = events.filter((e) => e.type === 'o')

    if (events.length > 0) {
      setDuration(events[events.length - 1].time)
    }

    const term = new XTerm({
      cursorBlink: false,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      disableStdin: true,
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
      cols: recording.cols || 80,
      rows: recording.rows || 24,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    if (terminalRef.current) {
      term.open(terminalRef.current)
      requestAnimationFrame(() => fitAddon.fit())
    }

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      timeoutRef.current.forEach(clearTimeout)
      term.dispose()
    }
  }, [recording])

  const stopPlayback = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    timeoutRef.current.forEach(clearTimeout)
    timeoutRef.current = []
  }, [])

  const playFromIndex = useCallback(
    (startIdx: number) => {
      const events = eventsRef.current
      const term = xtermRef.current
      if (!term || events.length === 0) return

      playingRef.current = true
      setPlaying(true)
      eventIndexRef.current = startIdx

      const scheduleNext = (idx: number) => {
        if (idx >= events.length || !playingRef.current) {
          stopPlayback()
          return
        }

        const event = events[idx]
        const prevTime = idx > 0 ? events[idx - 1].time : 0
        let delay = (event.time - prevTime) * 1000 / speedRef.current

        // Skip idle: cap delay at 2 seconds
        if (delay > 2000) delay = 200

        const timeout = setTimeout(() => {
          if (!playingRef.current) return
          term.write(event.data)
          eventIndexRef.current = idx + 1
          setCurrentTime(event.time)
          if (duration > 0) {
            setProgress((event.time / duration) * 100)
          }
          scheduleNext(idx + 1)
        }, delay)

        timeoutRef.current.push(timeout)
      }

      if (startIdx === 0) {
        // Reset terminal for fresh start
        term.reset()
      }

      scheduleNext(startIdx)
    },
    [duration, stopPlayback]
  )

  const handlePlayPause = useCallback(() => {
    if (playing) {
      stopPlayback()
    } else {
      const idx = eventIndexRef.current >= eventsRef.current.length ? 0 : eventIndexRef.current
      if (idx === 0) {
        xtermRef.current?.reset()
      }
      playFromIndex(idx)
    }
  }, [playing, stopPlayback, playFromIndex])

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pct = parseFloat(e.target.value)
      const targetTime = (pct / 100) * duration
      stopPlayback()

      // Replay all events up to targetTime instantly
      const term = xtermRef.current
      const events = eventsRef.current
      if (!term) return

      term.reset()
      let idx = 0
      for (let i = 0; i < events.length; i++) {
        if (events[i].time <= targetTime) {
          term.write(events[i].data)
          idx = i + 1
        } else {
          break
        }
      }
      eventIndexRef.current = idx
      setCurrentTime(targetTime)
      setProgress(pct)
    },
    [duration, stopPlayback]
  )

  const handleDownload = useCallback(() => {
    if (!recording.data) return
    const blob = new Blob([recording.data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${recording.server_name}-${recording.started_at}.cast`
    a.click()
    URL.revokeObjectURL(url)
  }, [recording])

  return (
    <div className="flex flex-col h-full">
      {/* Player header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-800 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h3 className="text-sm font-semibold text-text-primary">
            {recording.server_name}
          </h3>
          <span className="text-xs text-text-muted">
            {formatDate(recording.started_at)}
          </span>
        </div>
        <button
          onClick={handleDownload}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-surface-700 text-text-secondary border border-border hover:bg-surface-600 transition-colors"
        >
          Download .cast
        </button>
      </div>

      {/* Terminal */}
      <div className="flex-1 min-h-0 p-1 overflow-hidden">
        <div ref={terminalRef} className="h-full" />
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-4 px-4 py-3 bg-surface-800 border-t border-border">
        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          className="p-2 text-text-primary hover:text-accent-blue transition-colors"
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2L14 8L4 14V2Z" />
            </svg>
          )}
        </button>

        {/* Time */}
        <span className="text-xs font-mono text-text-muted min-w-[60px]">
          {currentTime.toFixed(1)}s
        </span>

        {/* Seek bar */}
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={progress}
          onChange={handleSeek}
          className="flex-1 h-1.5 bg-surface-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue"
        />

        {/* Duration */}
        <span className="text-xs font-mono text-text-muted min-w-[60px] text-right">
          {duration.toFixed(1)}s
        </span>

        {/* Speed */}
        <div className="flex items-center gap-1">
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-1.5 py-0.5 text-[11px] font-mono rounded ${
                speed === s
                  ? 'bg-accent-blue-dim text-accent-blue'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function RecordingsPage() {
  const navigate = useNavigate()
  const [recordings, setRecordings] = useState<SessionRecording[]>([])
  const [selectedRecording, setSelectedRecording] = useState<SessionRecording | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRecordings()
  }, [])

  const loadRecordings = async () => {
    setLoading(true)
    try {
      const recs = await getRecordings()
      setRecordings(recs)
    } catch {
      // ignore
    }
    setLoading(false)
  }

  const handleSelect = async (rec: SessionRecording) => {
    try {
      const full = await getRecording(rec.id)
      setSelectedRecording(full)
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Delete this recording?')) return
    try {
      await deleteRecording(id)
      setRecordings((prev) => prev.filter((r) => r.id !== id))
      if (selectedRecording?.id === id) {
        setSelectedRecording(null)
      }
    } catch {
      // ignore
    }
  }

  if (selectedRecording) {
    return (
      <div className="flex flex-col h-screen bg-surface-900">
        <RecordingPlayer
          recording={selectedRecording}
          onClose={() => setSelectedRecording(null)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-surface-800 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <Logo size={24} />
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            Session Recordings
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="text-text-muted text-center py-8">Loading...</div>
        )}

        {!loading && recordings.length === 0 && (
          <div className="text-center py-12">
            <div className="text-text-muted text-lg mb-2">No recordings yet</div>
            <p className="text-text-dimmed text-sm">
              Start a recording from the terminal by clicking the "Record" button.
            </p>
          </div>
        )}

        {!loading && recordings.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-2">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                onClick={() => handleSelect(rec)}
                className="flex items-center justify-between px-4 py-3 bg-surface-800 border border-border rounded-lg hover:border-accent-blue cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-4">
                  {/* Play icon */}
                  <div className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center text-text-muted group-hover:text-accent-blue transition-colors">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2L14 8L4 14V2Z" />
                    </svg>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-text-primary">
                      {rec.server_name}
                    </div>
                    <div className="text-xs text-text-muted">
                      {formatDate(rec.started_at)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono text-text-muted">
                    {formatDuration(rec.duration_seconds)}
                  </span>
                  <span className="text-xs text-text-dimmed">
                    {rec.cols}x{rec.rows}
                  </span>
                  <button
                    onClick={(e) => handleDelete(rec.id, e)}
                    className="p-1.5 text-text-dimmed hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete recording"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
