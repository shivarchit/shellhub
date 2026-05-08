import type { Server } from '../lib/types'
import { cn } from '../lib/utils'
import Logo from './Logo'

interface ConnectionBarProps {
  server: Server | null
  connected: boolean
  elapsed: number
  recording?: boolean
  onDisconnect: () => void
  onBack: () => void
  onToggleRecording?: () => void
}

function formatTime(totalSeconds: number): string {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export default function ConnectionBar({
  server,
  connected,
  elapsed,
  recording = false,
  onDisconnect,
  onBack,
  onToggleRecording,
}: ConnectionBarProps) {
  return (
    <div className="flex items-center justify-between bg-surface-800 border-b border-border px-5 py-2.5">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {connected ? (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Logo size={24} />
            <span className="font-semibold text-text-secondary">ShellHub</span>
          </div>
        ) : (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <Logo size={24} />
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Dashboard
          </button>
        )}

        <div className="w-px h-5 bg-border" />

        {/* Connection badge */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            connected
              ? 'bg-accent-green-bg text-accent-green border border-accent-green-dim'
              : 'bg-accent-red-bg text-accent-red border border-accent-red-dim'
          )}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected
                ? 'bg-accent-green animate-pulse'
                : 'bg-accent-red'
            )}
          />
          {connected ? 'Connected' : 'Disconnected'}
        </div>

        {server && (
          <>
            <span className="text-sm font-semibold text-text-primary">
              {server.name}
            </span>
            <span className="text-xs font-mono text-text-muted">
              {server.username}@{server.host}:{server.port}
            </span>
          </>
        )}

        <span className="text-xs font-mono text-text-secondary">
          {formatTime(elapsed)}
        </span>

        {/* Recording indicator */}
        {recording && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {connected && onToggleRecording && (
          <button
            onClick={onToggleRecording}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
              recording
                ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                : 'bg-surface-700 text-text-secondary border-border hover:bg-surface-600'
            )}
          >
            {recording ? 'Stop Recording' : 'Record'}
          </button>
        )}

        {connected ? (
          <button
            onClick={onDisconnect}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-red-bg text-accent-red border border-accent-red-dim hover:bg-accent-red-dim transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onBack}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors"
          >
            Back to Dashboard
          </button>
        )}
      </div>
    </div>
  )
}
