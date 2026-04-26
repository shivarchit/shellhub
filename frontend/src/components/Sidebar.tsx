import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Server } from '../lib/types'
import { cn } from '../lib/utils'
import StatusDot from './StatusDot'
import Logo from './Logo'

interface SidebarProps {
  servers: Server[]
  selectedId: number | null
  onlineMap: Record<number, boolean>
  onSelect: (id: number) => void
  onAdd: () => void
}

export default function Sidebar({
  servers,
  selectedId,
  onlineMap,
  onSelect,
  onAdd,
}: SidebarProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return servers
    const q = search.toLowerCase()
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q)
    )
  }, [servers, search])

  const grouped = useMemo(() => {
    const map = new Map<string, Server[]>()
    for (const s of filtered) {
      const group = s.group || 'Ungrouped'
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(s)
    }
    return map
  }, [filtered])

  return (
    <aside className="flex flex-col w-64 h-full bg-surface-800 border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-text-primary font-semibold text-lg tracking-tight">
            ShellHub
          </span>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-700 transition-colors"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M6.5 1.5L6.1 3.2a5 5 0 00-1.3.8L3.2 3.4l-1.5 2.6 1.5 1.2a5 5 0 000 1.6l-1.5 1.2 1.5 2.6 1.6-.6a5 5 0 001.3.8l.4 1.7h3l.4-1.7a5 5 0 001.3-.8l1.6.6 1.5-2.6-1.5-1.2a5 5 0 000-1.6l1.5-1.2-1.5-2.6-1.6.6a5 5 0 00-1.3-.8L9.5 1.5h-3zM8 5.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <input
          type="text"
          placeholder="Search servers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-surface-900 border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
        />
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {[...grouped.entries()].map(([group, groupServers]) => (
          <div key={group} className="mb-3">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {group}
              </span>
              <span className="text-[10px] text-text-dimmed bg-surface-700 px-1.5 py-0.5 rounded-full">
                {groupServers.length}
              </span>
            </div>
            {groupServers.map((server) => {
              const isSelected = selectedId === server.id
              const isOnline = onlineMap[server.id] ?? false
              return (
                <button
                  key={server.id}
                  onClick={() => onSelect(server.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg mb-0.5 transition-all duration-200 group',
                    isSelected
                      ? cn(
                          'bg-surface-700/60 border-l-2',
                          isOnline
                            ? 'border-l-accent-green shadow-glow-green'
                            : 'border-l-accent-red shadow-glow-red'
                        )
                      : cn(
                          'border-l-2 border-l-transparent hover:bg-surface-700/40',
                          selectedId !== null
                            ? 'opacity-30 hover:opacity-100'
                            : 'opacity-100'
                        )
                  )}
                >
                  <div className="flex items-center gap-2">
                    <StatusDot online={isOnline} size="sm" />
                    <span className="text-sm font-medium text-text-primary truncate">
                      {server.name}
                    </span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 pl-4 truncate font-mono">
                    {server.host}:{server.port}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-text-muted text-center mt-4">
            No servers found.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={onAdd}
          className="w-full py-2 text-sm text-text-secondary border border-dashed border-border rounded-lg hover:border-accent-blue hover:text-accent-blue transition-colors"
        >
          + Add Server
        </button>
      </div>
    </aside>
  )
}
