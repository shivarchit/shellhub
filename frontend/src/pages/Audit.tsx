import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ExecRecord, ExecHistoryFilter, Server } from '../lib/types'
import { getAllExecHistory, exportExecHistoryCSV, getServers } from '../lib/api'
import { cn } from '../lib/utils'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PAGE_SIZE = 50

export default function Audit() {
  const navigate = useNavigate()
  const [records, setRecords] = useState<ExecRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [servers, setServers] = useState<Server[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Filters
  const [filterServerId, setFilterServerId] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterExitCode, setFilterExitCode] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  useEffect(() => {
    getServers().then(setServers).catch(() => setServers([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const filter: ExecHistoryFilter = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }
      if (filterServerId) filter.server_id = parseInt(filterServerId)
      if (filterSearch) filter.search = filterSearch
      if (filterExitCode !== '') filter.exit_code = parseInt(filterExitCode)
      if (filterDateFrom) filter.date_from = filterDateFrom
      if (filterDateTo) filter.date_to = filterDateTo

      const result = await getAllExecHistory(filter)
      setRecords(result.records)
      setTotal(result.total)
    } catch {
      setRecords([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, filterServerId, filterSearch, filterExitCode, filterDateFrom, filterDateTo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleExport = () => {
    const filter: ExecHistoryFilter = {}
    if (filterServerId) filter.server_id = parseInt(filterServerId)
    if (filterSearch) filter.search = filterSearch
    if (filterExitCode !== '') filter.exit_code = parseInt(filterExitCode)
    if (filterDateFrom) filter.date_from = filterDateFrom
    if (filterDateTo) filter.date_to = filterDateTo
    exportExecHistoryCSV(filter)
  }

  const handleClearFilters = () => {
    setFilterServerId('')
    setFilterSearch('')
    setFilterExitCode('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setPage(0)
  }

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-700 transition-colors"
            title="Back to Dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 4L6 8L10 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-text-primary">
            Command Audit Trail
          </h1>
          <span className="text-xs text-text-muted bg-surface-700 px-2 py-0.5 rounded-full">
            {total} total
          </span>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b border-border bg-surface-800/50">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search commands..."
            value={filterSearch}
            onChange={(e) => { setFilterSearch(e.target.value); setPage(0) }}
            className="px-3 py-1.5 text-sm bg-surface-900 border border-border rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue w-64"
          />
          <select
            value={filterServerId}
            onChange={(e) => { setFilterServerId(e.target.value); setPage(0) }}
            className="px-3 py-1.5 text-sm bg-surface-900 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
          >
            <option value="">All Servers</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={filterExitCode}
            onChange={(e) => { setFilterExitCode(e.target.value); setPage(0) }}
            className="px-3 py-1.5 text-sm bg-surface-900 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
          >
            <option value="">All Results</option>
            <option value="0">Success (exit 0)</option>
            <option value="1">Failed (non-zero)</option>
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0) }}
            className="px-3 py-1.5 text-sm bg-surface-900 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
            placeholder="From"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => { setFilterDateTo(e.target.value); setPage(0) }}
            className="px-3 py-1.5 text-sm bg-surface-900 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
            placeholder="To"
          />
          {(filterServerId || filterSearch || filterExitCode || filterDateFrom || filterDateTo) && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-primary bg-surface-700 rounded-md transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20 text-text-muted text-sm">
            No command executions found.
          </div>
        ) : (
          <div className="space-y-1">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_150px_2fr_80px_80px_120px] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <span>Server</span>
              <span>Command Name</span>
              <span>Command</span>
              <span>Exit</span>
              <span>Duration</span>
              <span>Time</span>
            </div>

            {records.map((rec) => (
              <div key={rec.id}>
                <div
                  onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                  className="grid grid-cols-[1fr_150px_2fr_80px_80px_120px] gap-3 px-4 py-2.5 bg-surface-800 rounded-lg text-xs cursor-pointer hover:bg-surface-700 transition-colors items-center"
                >
                  <span className="text-text-primary font-medium truncate">
                    {rec.server_name || `Server #${rec.server_id}`}
                  </span>
                  <span className="text-text-secondary truncate">
                    {rec.command_name}
                  </span>
                  <span className="text-text-muted font-mono truncate">
                    {rec.command_text}
                  </span>
                  <span className={cn(
                    'font-medium',
                    rec.exit_code === 0 ? 'text-accent-green' : 'text-accent-red'
                  )}>
                    {rec.exit_code === 0 ? 'OK' : `exit ${rec.exit_code}`}
                  </span>
                  <span className="text-text-muted">
                    {rec.duration_ms > 0 ? `${rec.duration_ms}ms` : '-'}
                  </span>
                  <span className="text-text-muted" title={rec.executed_at}>
                    {timeAgo(rec.executed_at)}
                  </span>
                </div>

                {/* Expanded output */}
                {expandedId === rec.id && (
                  <div className="mx-4 mt-1 mb-2 p-4 bg-surface-900 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-text-muted uppercase">Output</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(rec.output)}
                        className="text-xs text-text-muted hover:text-text-primary transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                      {rec.output || '(no output)'}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-surface-800">
          <span className="text-xs text-text-muted">
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-surface-700 text-text-secondary hover:bg-surface-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-text-muted">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-surface-700 text-text-secondary hover:bg-surface-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
