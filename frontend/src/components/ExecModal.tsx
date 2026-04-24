import type { ExecResult, QuickCommand } from '../lib/types'
import { cn } from '../lib/utils'

interface ExecModalProps {
  result: ExecResult | null
  command: QuickCommand | null
  duration: number
  onClose: () => void
  onRerun: () => void
}

export default function ExecModal({
  result,
  command,
  duration,
  onClose,
  onRerun,
}: ExecModalProps) {
  if (!result || !command) return null

  const success = result.exit_code === 0

  const handleCopy = () => {
    navigator.clipboard.writeText(result.output)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-surface-800 border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-text-primary">
              {command.name}
            </h3>
            {command.tag && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-600 text-text-secondary">
                {command.tag}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        {/* Command line */}
        <div className="px-5 py-3 border-b border-border">
          <code className="text-xs font-mono text-text-secondary">
            $ {command.command}
          </code>
        </div>

        {/* Exit status */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-border">
          <span
            className={cn(
              'text-sm font-medium',
              success ? 'text-accent-green' : 'text-accent-red'
            )}
          >
            {success ? '✓' : '✗'}
          </span>
          <span className="text-xs text-text-secondary">
            Exit code: {result.exit_code}
          </span>
        </div>

        {/* Output */}
        <div className="px-5 py-4 max-h-80 overflow-y-auto">
          <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-words leading-relaxed">
            {result.output || '(no output)'}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-text-muted">
            Completed in {duration}ms
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-700 rounded-md hover:bg-surface-600 transition-colors"
            >
              Copy Output
            </button>
            <button
              onClick={onRerun}
              className="px-3 py-1.5 text-xs font-medium text-accent-blue bg-accent-blue-dim rounded-md hover:opacity-80 transition-opacity"
            >
              Re-run
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-700 rounded-md hover:bg-surface-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
