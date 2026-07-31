import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { Server, GlobalCommand } from '../lib/types'
import { execCommand, getGlobalCommands } from '../lib/api'
import { cn } from '../lib/utils'
import {
  hasCustomVariables,
  getCustomVariables,
  resolveBuiltinVariables,
  resolveCustomVariables,
} from '../lib/templates'
import TemplateModal from './TemplateModal'

// Same list CommandCard/CommandPanel guard on — kept local so this file stays self-contained.
const DESTRUCTIVE_PATTERNS = [/rm\s+-rf/, /\bdrop\b/i, /\bdelete\b/i, /\btruncate\b/i, /mkfs/, /dd\s+if=/]

type CardStatus = 'running' | 'done' | 'failed'
interface CardState {
  status: CardStatus
  output: string
  exitCode?: number
  duration: number
}

interface BroadcastModalProps {
  servers: Server[]
  onClose: () => void
}

export default function BroadcastModal({ servers, onClose }: BroadcastModalProps) {
  const [command, setCommand] = useState('')
  const [commandName, setCommandName] = useState<string | undefined>(undefined)
  const [selected, setSelected] = useState<Set<number>>(() => new Set(servers.map((s) => s.id)))
  const [results, setResults] = useState<Record<number, CardState>>({})
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [globalCommands, setGlobalCommands] = useState<GlobalCommand[]>([])
  const [showTemplate, setShowTemplate] = useState(false)
  const startRef = useRef(0)

  useEffect(() => {
    getGlobalCommands().then(setGlobalCommands).catch(() => {})
  }, [])

  // Escape closes (unless mid-run — avoid dropping in-flight state accidentally).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, onClose])

  // Elapsed timer while any card is running.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed(performance.now() - startRef.current), 100)
    return () => clearInterval(id)
  }, [running])

  const grouped = useMemo(() => {
    const m = new Map<string, Server[]>()
    for (const s of servers) {
      const g = s.group || 'Ungrouped'
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(s)
    }
    return m
  }, [servers])

  const targets = useMemo(() => servers.filter((s) => selected.has(s.id)), [servers, selected])

  const counts = useMemo(() => {
    let done = 0, failed = 0, run = 0
    for (const r of Object.values(results)) {
      if (r.status === 'done') done++
      else if (r.status === 'failed') failed++
      else run++
    }
    return { done, failed, run, total: done + failed + run }
  }, [results])

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const selectGroup = (group: Server[]) =>
    setSelected((prev) => {
      const next = new Set(prev)
      group.forEach((s) => next.add(s.id))
      return next
    })

  const runBroadcast = useCallback(
    async (values: Record<string, string>) => {
      const cmd = command.trim()
      const list = servers.filter((s) => selected.has(s.id))
      setResults(Object.fromEntries(list.map((s) => [s.id, { status: 'running', output: '', duration: 0 } as CardState])))
      startRef.current = performance.now()
      setElapsed(0)
      setRunning(true)

      await Promise.allSettled(
        list.map(async (server) => {
          const resolved = resolveCustomVariables(resolveBuiltinVariables(cmd, server), values)
          const start = performance.now()
          try {
            const r = await execCommand(server.id, resolved, commandName)
            setResults((prev) => ({
              ...prev,
              [server.id]: {
                status: r.exit_code === 0 ? 'done' : 'failed',
                output: r.output || '(no output)',
                exitCode: r.exit_code,
                duration: Math.round(performance.now() - start),
              },
            }))
          } catch (err) {
            setResults((prev) => ({
              ...prev,
              [server.id]: {
                status: 'failed',
                output: err instanceof Error ? err.message : 'Command failed',
                duration: Math.round(performance.now() - start),
              },
            }))
          }
        })
      )
      setRunning(false)
    },
    [command, commandName, selected, servers]
  )

  const handleRun = () => {
    const cmd = command.trim()
    if (running || !cmd || selected.size === 0) return
    if (DESTRUCTIVE_PATTERNS.some((p) => p.test(cmd))) {
      const ok = window.confirm(
        `Warning: this command contains a potentially destructive operation and will run on ${selected.size} server(s).\n\nCommand: ${cmd}\n\nAre you sure?`
      )
      if (!ok) return
    }
    if (hasCustomVariables(cmd)) {
      setShowTemplate(true)
      return
    }
    runBroadcast({})
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={running ? undefined : onClose} />

      <div className="relative z-10 w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col bg-surface-800 border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-text-primary">Broadcast</h3>
            <span className="text-xs text-text-muted">one command · many servers</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors text-lg">
            &times;
          </button>
        </div>

        {/* Command bar */}
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-3 border-b border-border">
          <div className="flex flex-1 min-w-[240px] items-center gap-2.5 bg-surface-900 border border-border-medium rounded-lg px-3.5 py-2.5">
            <span className="font-mono text-sm text-accent-green">$</span>
            <input
              value={command}
              onChange={(e) => {
                setCommand(e.target.value)
                setCommandName(undefined)
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleRun()}
              placeholder="uptime && df -h /"
              className="flex-1 bg-transparent font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
          {globalCommands.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const gc = globalCommands.find((g) => String(g.id) === e.target.value)
                if (gc) {
                  setCommand(gc.command)
                  setCommandName(gc.name)
                }
              }}
              className="bg-surface-900 border border-border-medium rounded-lg px-3 py-2.5 text-sm text-text-secondary focus:outline-none focus:border-accent-blue"
            >
              <option value="">Saved command…</option>
              {globalCommands.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleRun}
            disabled={running || !command.trim() || selected.size === 0}
            className="bg-accent-blue text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? 'Running…' : `Run on ${selected.size} server${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>

        {/* Target chips */}
        <div className="flex flex-wrap gap-2 px-5 py-3.5 border-b border-border">
          {[...grouped.entries()].map(([group, groupServers]) => (
            <div key={group} className="flex flex-wrap gap-2">
              {groupServers.map((s) => {
                const on = selected.has(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors',
                      on
                        ? 'border-accent-blue bg-accent-blue/10 text-text-primary'
                        : 'border-border-medium text-text-secondary hover:text-text-primary'
                    )}
                  >
                    <span className={cn('w-1.5 h-1.5 rounded-full', on ? 'bg-accent-blue' : 'bg-text-muted')} />
                    {s.name}
                    <span className="text-[10px] text-text-muted uppercase">{group}</span>
                  </button>
                )
              })}
              <button
                onClick={() => selectGroup(groupServers)}
                className="inline-flex items-center text-xs px-3 py-1.5 rounded-full border border-dashed border-border-medium text-text-muted hover:text-text-primary transition-colors"
              >
                + all {group}
              </button>
            </div>
          ))}
        </div>

        {/* Summary line */}
        {counts.total > 0 && (
          <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-surface-700 text-xs text-text-secondary">
            <span className="font-semibold text-accent-green">{counts.done} done</span>
            <span className="font-semibold text-accent-red">{counts.failed} failed</span>
            <span className="font-semibold text-accent-amber">{counts.run} running</span>
            <div className="flex flex-1 h-1.5 rounded-full bg-surface-500 overflow-hidden">
              <span className="bg-accent-green" style={{ width: `${(counts.done / counts.total) * 100}%` }} />
              <span className="bg-accent-red" style={{ width: `${(counts.failed / counts.total) * 100}%` }} />
              <span className="bg-accent-amber animate-pulse" style={{ width: `${(counts.run / counts.total) * 100}%` }} />
            </div>
            <span className="font-mono text-text-muted">{(elapsed / 1000).toFixed(1)}s elapsed</span>
          </div>
        )}

        {/* Results grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {counts.total === 0 ? (
            <p className="text-sm text-text-muted text-center py-10">
              Select targets and run a command to see live per-server results.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {targets.map((s) => {
                const r = results[s.id]
                if (!r) return null
                return (
                  <div key={s.id} className="border border-border rounded-xl bg-surface-700 p-3.5 text-xs">
                    <div className="flex items-center gap-2 mb-2 text-[13px] font-semibold text-text-primary">
                      {r.status === 'running' ? (
                        <span className="w-2.5 h-2.5 border-2 border-accent-amber border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span
                          className={cn('w-2 h-2 rounded-full', r.status === 'done' ? 'bg-accent-green' : 'bg-accent-red')}
                        />
                      )}
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto font-mono font-normal text-[11px] text-text-muted">
                        {r.status === 'running'
                          ? 'running…'
                          : r.exitCode !== undefined && r.exitCode !== 0
                            ? `exit ${r.exitCode}`
                            : `${r.duration}ms`}
                      </span>
                    </div>
                    <pre
                      className={cn(
                        'bg-surface-900 rounded-lg px-2.5 py-2 font-mono text-[11.5px] max-h-28 overflow-auto whitespace-pre-wrap break-words',
                        r.status === 'failed' ? 'text-accent-red' : 'text-text-secondary'
                      )}
                    >
                      {r.status === 'running' ? 'waiting for output…' : r.output}
                    </pre>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showTemplate && (
        <TemplateModal
          commandName={commandName || 'command'}
          variables={getCustomVariables(command)}
          onSubmit={(values) => {
            setShowTemplate(false)
            runBroadcast(values)
          }}
          onCancel={() => setShowTemplate(false)}
        />
      )}
    </div>
  )
}
