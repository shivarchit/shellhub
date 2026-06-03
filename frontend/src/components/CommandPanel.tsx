import { useState, useCallback } from 'react'
import type { Server, ExecResult } from '../lib/types'
import { execCommand } from '../lib/api'
import { cn } from '../lib/utils'

const DESTRUCTIVE_PATTERNS = [/rm\s+-rf/, /\bdrop\b/i, /\bdelete\b/i, /\btruncate\b/i, /mkfs/, /dd\s+if=/]

interface CommandPanelProps {
  server: Server | null
  onPasteToTerminal: (text: string) => void
  onClose: () => void
}

interface LastExec {
  output: string
  exitCode: number
  duration: number
  commandName: string
}

export default function CommandPanel({
  server,
  onPasteToTerminal,
  onClose,
}: CommandPanelProps) {
  const [lastExec, setLastExec] = useState<LastExec | null>(null)
  const [runningIdx, setRunningIdx] = useState<number | null>(null)

  const handleRun = useCallback(
    async (commandText: string, commandName: string, idx: number) => {
      if (!server || runningIdx !== null) return

      const isDestructive = DESTRUCTIVE_PATTERNS.some(p => p.test(commandText))
      if (isDestructive) {
        const confirmed = window.confirm(
          `Warning: "${commandName}" contains a potentially destructive operation.\n\nCommand: ${commandText}\n\nAre you sure?`
        )
        if (!confirmed) return
      }

      setRunningIdx(idx)
      const start = performance.now()
      try {
        const result: ExecResult = await execCommand(server.id, commandText, commandName)
        const elapsed = Math.round(performance.now() - start)
        setLastExec({
          output: result.output,
          exitCode: result.exit_code,
          duration: elapsed,
          commandName,
        })
      } catch {
        const elapsed = Math.round(performance.now() - start)
        setLastExec({
          output: 'Failed to execute command.',
          exitCode: -1,
          duration: elapsed,
          commandName,
        })
      } finally {
        setRunningIdx(null)
      }
    },
    [server, runningIdx]
  )

  const commands = server?.quick_commands ?? []

  return (
    <div className="flex flex-col w-72 h-full bg-surface-800 border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">
          Quick Commands
        </h3>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 4L4 12M4 4L12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Command list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {commands.length === 0 && (
          <p className="text-xs text-text-muted text-center mt-4">
            No quick commands configured.
          </p>
        )}
        {commands.map((cmd, idx) => (
          <div
            key={idx}
            className={cn(
              'rounded-lg border border-border p-3 transition-all duration-200',
              'hover:border-accent-green hover:bg-surface-700'
            )}
          >
            <div className="text-xs font-bold text-text-primary mb-1">
              {cmd.name}
            </div>
            <div className="text-xs font-mono text-text-muted truncate mb-2">
              {cmd.command}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onPasteToTerminal(cmd.command + '\n')}
                className="flex-1 py-1 text-[11px] font-medium rounded bg-accent-blue-dim text-accent-blue hover:opacity-80 transition-opacity"
              >
                Paste
              </button>
              <button
                onClick={() => handleRun(cmd.command, cmd.name, idx)}
                disabled={runningIdx !== null}
                className={cn(
                  'flex-1 py-1 text-[11px] font-medium rounded border transition-opacity',
                  runningIdx === idx
                    ? 'bg-accent-amber-dim text-accent-amber border-accent-amber-dim cursor-wait'
                    : 'bg-accent-green-bg text-accent-green border-accent-green-dim hover:opacity-80'
                )}
              >
                {runningIdx === idx ? 'Running...' : 'Run'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Last Execution */}
      {lastExec && (
        <div className="border-t border-border p-3">
          <div className="text-[11px] font-semibold text-text-secondary mb-1.5">
            Last Execution
          </div>
          <div className="text-xs text-text-muted mb-1 truncate">
            {lastExec.commandName}
          </div>
          <div className="bg-surface-900 rounded p-2 mb-2 max-h-20 overflow-y-auto">
            <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap break-all">
              {lastExec.output
                .split('\n')
                .slice(0, 4)
                .join('\n')}
            </pre>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-mono',
                lastExec.exitCode === 0
                  ? 'bg-accent-green-bg text-accent-green'
                  : 'bg-accent-red-bg text-accent-red'
              )}
            >
              exit {lastExec.exitCode}
            </span>
            <span className="text-[10px] text-text-muted font-mono">
              {lastExec.duration}ms
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
