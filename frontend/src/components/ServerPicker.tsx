import { useState, useEffect } from 'react'
import type { Server } from '../lib/types'
import { getServers } from '../lib/api'

interface ServerPickerProps {
  onSelect: (server: Server) => void
  onClose: () => void
}

export default function ServerPicker({ onSelect, onClose }: ServerPickerProps) {
  const [servers, setServers] = useState<Server[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getServers().then(setServers)
  }, [])

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.host.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface-800 border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">
            Open Terminal
          </h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <input
          type="text"
          placeholder="Search servers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 text-sm bg-surface-900 border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue mb-3"
        />

        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map((server) => (
            <button
              key={server.id}
              onClick={() => onSelect(server)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface-700 transition-colors group"
            >
              <div className="text-sm font-medium text-text-primary group-hover:text-accent-blue transition-colors">
                {server.name}
              </div>
              <div className="text-xs font-mono text-text-muted">
                {server.username}@{server.host}:{server.port}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-4">
              No servers found.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
