import { useState, useRef, useCallback } from 'react'
import type { QuickCommand, ExecResult } from '../lib/types'
import { execCommand } from '../lib/api'
import { cn } from '../lib/utils'
import { useToast } from '../lib/useToast'

const DESTRUCTIVE_PATTERNS = [/rm\s+-rf/, /\bdrop\b/i, /\bdelete\b/i, /\btruncate\b/i, /mkfs/, /dd\s+if=/]

interface CommandCardProps {
  command: QuickCommand
  serverId: number
  onExecComplete: (result: ExecResult, command: QuickCommand) => void
}

export default function CommandCard({
  command,
  serverId,
  onExecComplete,
}: CommandCardProps) {
  const { addToast } = useToast()
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'failed'>(
    'idle'
  )
  const [duration, setDuration] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleRun = useCallback(async () => {
    if (status === 'running') return

    const isDestructive = DESTRUCTIVE_PATTERNS.some(p => p.test(command.command))
    if (isDestructive) {
      const confirmed = window.confirm(
        `Warning: "${command.name}" contains a potentially destructive operation.\n\nCommand: ${command.command}\n\nAre you sure?`
      )
      if (!confirmed) return
    }

    setStatus('running')
    const start = performance.now()
    try {
      const result = await execCommand(serverId, command.command)
      const elapsed = Math.round(performance.now() - start)
      setDuration(elapsed)
      if (result.exit_code === 0) {
        setStatus('done')
        addToast(`${command.name} completed`, 'success')
      } else {
        setStatus('failed')
        addToast(`${command.name} failed`, 'error')
      }
      onExecComplete(result, command)
    } catch {
      setDuration(Math.round(performance.now() - start))
      setStatus('failed')
      addToast(`${command.name} failed`, 'error')
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setStatus('idle')
      setDuration(0)
    }, 3000)
  }, [status, serverId, command, onExecComplete, addToast])

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border bg-surface-800 transition-all duration-300',
        status === 'done'
          ? 'border-accent-green/50 shadow-glow-green'
          : status === 'failed'
            ? 'border-accent-red/50 shadow-glow-red'
            : 'border-border'
      )}
    >
      {/* Running progress bar */}
      {status === 'running' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent-amber-dim">
          <div className="h-full bg-accent-amber animate-progress" />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-text-primary truncate">
              {command.name}
            </h4>
            <p className="text-xs font-mono text-text-muted truncate mt-0.5">
              {command.command}
            </p>
          </div>
          {command.tag && (
            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-surface-600 text-text-secondary">
              {command.tag}
            </span>
          )}
        </div>

        <button
          onClick={handleRun}
          disabled={status === 'running'}
          className={cn(
            'w-full py-1.5 text-xs font-medium rounded-md transition-all duration-200',
            status === 'idle' &&
              'bg-surface-700 text-text-secondary hover:bg-surface-600 hover:text-text-primary',
            status === 'running' &&
              'bg-accent-amber-dim text-accent-amber cursor-wait',
            status === 'done' && 'bg-accent-green-dim text-accent-green',
            status === 'failed' && 'bg-accent-red-dim text-accent-red'
          )}
        >
          {status === 'idle' && 'Run'}
          {status === 'running' && 'Running...'}
          {status === 'done' && `✓ ${duration}ms`}
          {status === 'failed' && `✗ Failed (${duration}ms)`}
        </button>
      </div>
    </div>
  )
}
