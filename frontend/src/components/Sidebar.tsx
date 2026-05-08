import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Server } from '../lib/types'
import { cn } from '../lib/utils'
import { reorderServers } from '../lib/api'
import { useAuth } from '../lib/auth'
import StatusDot from './StatusDot'
import Logo from './Logo'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SidebarProps {
  servers: Server[]
  selectedId: number | null
  onlineMap: Record<number, boolean>
  onSelect: (id: number) => void
  onAdd: () => void
  onReorder: () => void
}

function SortableServerItem({
  server,
  isSelected,
  isOnline,
  selectedId,
  onSelect,
}: {
  server: Server
  isSelected: boolean
  isOnline: boolean
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: server.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-center">
        <button
          {...listeners}
          className="px-1 cursor-grab text-text-dimmed hover:text-text-muted flex-shrink-0"
          tabIndex={-1}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
          >
            <circle cx="4" cy="2" r="1" />
            <circle cx="8" cy="2" r="1" />
            <circle cx="4" cy="6" r="1" />
            <circle cx="8" cy="6" r="1" />
            <circle cx="4" cy="10" r="1" />
            <circle cx="8" cy="10" r="1" />
          </svg>
        </button>
        <button
          onClick={() => onSelect(server.id)}
          className={cn(
            'flex-1 text-left px-3 py-2 rounded-lg mb-0.5 transition-all duration-200 group',
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
      </div>
    </div>
  )
}

export default function Sidebar({
  servers,
  selectedId,
  onlineMap,
  onSelect,
  onAdd,
  onReorder,
}: SidebarProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Find which group both items belong to
    let targetGroup: string | null = null
    let groupServers: Server[] = []
    for (const [group, gServers] of grouped.entries()) {
      const hasActive = gServers.some((s) => s.id === active.id)
      const hasOver = gServers.some((s) => s.id === over.id)
      if (hasActive && hasOver) {
        targetGroup = group
        groupServers = gServers
        break
      }
    }
    if (!targetGroup) return

    const oldIndex = groupServers.findIndex((s) => s.id === active.id)
    const newIndex = groupServers.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(groupServers, oldIndex, newIndex)

    // Compute new sort_order values for all servers in this group
    const orders = reordered.map((s, i) => ({
      id: s.id,
      sort_order: i,
    }))

    try {
      await reorderServers(orders)
      onReorder()
    } catch {
      // silently fail
    }
  }

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
          ref={searchRef}
          type="text"
          placeholder="Search servers... (Ctrl+K)"
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={groupServers.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {groupServers.map((server) => {
                  const isSelected = selectedId === server.id
                  const isOnline = onlineMap[server.id] ?? false
                  return (
                    <SortableServerItem
                      key={server.id}
                      server={server}
                      isSelected={isSelected}
                      isOnline={isOnline}
                      selectedId={selectedId}
                      onSelect={onSelect}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-text-muted text-center mt-4">
            No servers found.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {user?.role === 'superadmin' && (
          <button
            onClick={() => navigate('/recordings')}
            className="w-full py-2 text-sm text-text-muted flex items-center justify-center gap-2 border border-border rounded-lg hover:border-accent-blue hover:text-accent-blue transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="2.5" fill="currentColor" />
            </svg>
            Recordings
          </button>
        )}
        {user?.role === 'superadmin' && (
          <button
            onClick={() => navigate('/metrics')}
            className="w-full py-2 text-sm text-text-secondary border border-border rounded-lg hover:border-accent-blue hover:text-accent-blue transition-colors flex items-center justify-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 14V8h3v6H2zM6.5 14V4h3v10h-3zM11 14V1h3v13h-3z" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
            Metrics
          </button>
        )}
        <button
          onClick={onAdd}
          className="w-full py-2 text-sm text-text-secondary border border-dashed border-border rounded-lg hover:border-accent-blue hover:text-accent-blue transition-colors"
        >
          + Add Server
        </button>
        {user?.role === 'superadmin' && (
          <button
            onClick={() => navigate('/audit')}
            className="w-full py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors flex items-center justify-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 3h12M2 7h8M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Audit Trail
          </button>
        )}
      </div>
    </aside>
  )
}
