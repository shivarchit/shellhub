import type { Server } from '../lib/types'
import { cn } from '../lib/utils'
import Logo from './Logo'

interface ConnectionBarProps {
  server: Server | null
  connected: boolean
  elapsed: number
  onDisconnect: () => void
  onBack: () => void
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
  onDisconnect,
  onBack,
}: ConnectionBarProps) {
  return (
    <div className="flex items-center justify-between bg-surface-800 border-b border-border px-5 py-2.5">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <Logo size={24} />
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </button>

        {/* Vertical divider */}
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
      </div>

      {/* Right section */}
      <div className="flex items-center">
        <button
          onClick={onDisconnect}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent-red-bg text-accent-red border border-accent-red-dim hover:bg-accent-red-dim transition-colors"
        >
          Disconnect
        </button>
      </div>
    </div>
  )
}
