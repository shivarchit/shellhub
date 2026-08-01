import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import type { Server, FileEntry } from '../lib/types'
import { getServers, listFiles, deleteFile, mkdir, uploadFiles, downloadFileUrl } from '../lib/api'
import { cn } from '../lib/utils'

function formatBytes(n: number): string {
  if (n === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function modAgo(dateStr: string): string {
  const t = Date.parse(dateStr)
  if (Number.isNaN(t)) return '—'
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.is_dir) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-accent-blue shrink-0">
        <path d="M1.5 4a1 1 0 011-1h3l1.5 1.5h6a1 1 0 011 1V12a1 1 0 01-1 1h-10.5a1 1 0 01-1-1V4z" fill="currentColor" fillOpacity="0.7" />
      </svg>
    )
  }
  if (/\.(tar|gz|zip|tgz|bz2|xz|7z|rar)$/i.test(entry.name)) {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-accent-amber shrink-0">
        <rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 2v4M6.5 4H8m0 2h1.5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
      <path d="M4 1.5h5L12.5 5v9a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5v-12a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 1.5V5h3.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

interface Transfer {
  id: string
  name: string
  size: number
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

let transferCounter = 0

export default function Files() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const serverId = Number(id)

  const [server, setServer] = useState<Server | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [cwd, setCwd] = useState('.')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [dropRow, setDropRow] = useState(false)
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getServers().then((servers) => {
      const s = servers.find((sv) => sv.id === serverId)
      if (!s) setNotFound(true)
      else setServer(s)
    })
  }, [serverId])

  const refresh = () => {
    setLoading(true)
    setError('')
    setSelected(null)
    listFiles(serverId, cwd)
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!server) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, cwd])

  const atRoot = cwd === '.'
  const segments = useMemo(() => (atRoot ? [] : cwd.split('/').filter(Boolean)), [cwd, atRoot])

  const enterDir = (name: string) => setCwd(atRoot ? name : `${cwd}/${name}`)
  const goUp = () => {
    if (atRoot) return
    const parts = cwd.split('/').filter(Boolean)
    parts.pop()
    setCwd(parts.length ? parts.join('/') : '.')
  }
  const goTo = (index: number) => {
    if (index < 0) setCwd('.')
    else setCwd(segments.slice(0, index + 1).join('/'))
  }

  const joinPath = (name: string) => (atRoot ? name : `${cwd}/${name}`)

  const handleUpload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    for (const file of list) {
      const tid = `t-${++transferCounter}`
      setTransfers((prev) => [
        { id: tid, name: file.name, size: file.size, progress: 0, status: 'uploading' },
        ...prev,
      ])
      try {
        await uploadFiles(serverId, cwd, [file], (loaded, total) => {
          const pct = total ? Math.round((loaded / total) * 100) : 0
          setTransfers((prev) => prev.map((t) => (t.id === tid ? { ...t, progress: pct } : t)))
        })
        setTransfers((prev) => prev.map((t) => (t.id === tid ? { ...t, progress: 100, status: 'done' } : t)))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'failed'
        setTransfers((prev) => prev.map((t) => (t.id === tid ? { ...t, status: 'error', error: msg } : t)))
      }
    }
    refresh()
  }

  const handleDelete = (e: FileEntry) => {
    if (!window.confirm(`Delete "${e.name}"?`)) return
    deleteFile(serverId, joinPath(e.name))
      .then(refresh)
      .catch((err) => window.alert(err.message))
  }

  const handleMkdir = () => {
    const name = window.prompt('New folder name')
    if (!name) return
    mkdir(serverId, joinPath(name))
      .then(refresh)
      .catch((err) => window.alert(err.message))
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    setDropRow(false)
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files)
  }
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-900 gap-4">
        <p className="text-text-muted">Server not found.</p>
        <button onClick={() => navigate('/')} className="px-4 py-2 text-sm text-on-accent bg-accent-blue rounded-lg">
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <button
          onClick={() => navigate('/')}
          className="text-text-muted hover:text-text-primary text-sm"
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold text-text-primary">Files</h1>
        {server && (
          <span
            className="text-sm text-text-muted font-mono truncate max-w-xs"
            title={`${server.username}@${server.host}`}
          >
            {server.username}@{server.host}
          </span>
        )}
      </div>

      <div className="flex-1 grid grid-cols-[4fr_5fr] gap-0 p-6 min-h-0">
        {/* Left pane — This Mac */}
        <div className="bg-surface-800 rounded-l-lg border border-border border-r-0 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text-primary truncate">This Mac</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 px-2.5 py-1 text-xs font-medium text-text-secondary bg-surface-700 border border-border rounded hover:bg-surface-600 transition-colors"
            >
              Upload to {server?.name ?? 'server'} →
            </button>
          </div>
          <div className="p-4 flex flex-col gap-4 overflow-y-auto">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={() => setDragging(true)}
              onDragOver={onDragOver}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'border-2 border-dashed rounded-lg py-10 text-center text-sm cursor-pointer transition-colors',
                dragging
                  ? 'border-accent-blue bg-accent-blue/10 text-accent-blue shadow-glow-blue'
                  : 'border-border text-text-muted hover:border-accent-blue/50'
              )}
            >
              {dragging ? (
                <>Drop files here — uploading to <b className="font-mono">{atRoot ? '~' : '/' + cwd}</b></>
              ) : (
                <>Drop files here or click to browse</>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) handleUpload(e.target.files)
                e.target.value = ''
              }}
            />

            {/* Transfer queue */}
            <div className="flex flex-col gap-2">
              {transfers.length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">No transfers yet.</p>
              )}
              {transfers.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2 bg-surface-700 rounded-lg text-xs">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
                    <path d="M4 1.5h5L12.5 5v9a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5v-12a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  <span className="font-mono text-text-primary truncate flex-1">{t.name}</span>
                  <span className="text-text-muted whitespace-nowrap">{formatBytes(t.size)}</span>
                  {t.status === 'uploading' && (
                    <>
                      <span className="w-24 h-1.5 rounded-full bg-surface-600 overflow-hidden">
                        <span
                          className="block h-full bg-gradient-to-r from-accent-green to-accent-blue transition-all"
                          style={{ width: `${t.progress}%` }}
                        />
                      </span>
                      <span className="text-text-muted w-9 text-right">{t.progress}%</span>
                    </>
                  )}
                  {t.status === 'done' && <span className="text-accent-green whitespace-nowrap">done</span>}
                  {t.status === 'error' && (
                    <span className="text-accent-red whitespace-nowrap" title={t.error}>✕ error</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right pane — server */}
        <div
          onDragEnter={() => setDropRow(true)}
          onDragOver={onDragOver}
          onDragLeave={() => setDropRow(false)}
          onDrop={onDrop}
          className={cn(
            'bg-surface-800 rounded-r-lg border flex flex-col min-h-0',
            dropRow ? 'border-accent-blue border-dashed shadow-glow-blue' : 'border-border'
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-accent-green shrink-0" />
              <span className="text-sm font-semibold text-text-primary truncate">{server?.name ?? 'Server'}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selected && !selected.is_dir ? (
                <a
                  href={downloadFileUrl(serverId, joinPath(selected.name))}
                  className="px-2.5 py-1 text-xs font-medium text-text-secondary bg-surface-700 border border-border rounded hover:bg-surface-600 transition-colors"
                  title={`Download ${selected.name}`}
                >
                  ← Download to Mac
                </a>
              ) : (
                <span
                  className="px-2.5 py-1 text-xs font-medium text-text-muted bg-surface-700 border border-border rounded opacity-50 cursor-not-allowed"
                  title="Select a file to download"
                >
                  ← Download to Mac
                </span>
              )}
              <button onClick={handleMkdir} className="px-2.5 py-1 text-xs text-text-secondary bg-surface-700 border border-border rounded hover:bg-surface-600">
                New Folder
              </button>
              <button onClick={refresh} className="px-2.5 py-1 text-xs text-text-secondary bg-surface-700 border border-border rounded hover:bg-surface-600">
                ⟳
              </button>
            </div>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border text-xs font-mono min-w-0">
            <button
              onClick={goUp}
              disabled={atRoot}
              title="Up one directory"
              className="px-1.5 py-0.5 rounded text-text-secondary bg-surface-700 border border-border hover:bg-surface-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↑
            </button>
            <button className="text-text-secondary hover:text-accent-blue" onClick={() => goTo(-1)}>~</button>
            {segments.map((seg, i) => (
              <span key={i} className="flex items-center gap-1.5 min-w-0">
                <span className="text-text-dimmed">/</span>
                <button
                  className={cn(
                    'truncate hover:text-accent-blue',
                    i === segments.length - 1 ? 'text-text-primary' : 'text-text-secondary'
                  )}
                  onClick={() => goTo(i)}
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            <span className="flex-1">Name</span>
            <span className="w-20 text-right">Size</span>
            <span className="w-24 text-right">Modified</span>
            <span className="w-24 text-right">Mode</span>
            <span className="w-14" />
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-sm">
            {error && <p className="px-4 py-3 text-accent-red text-xs">{error}</p>}
            {loading && <p className="px-4 py-3 text-text-muted text-xs">Loading…</p>}
            {!atRoot && (
              <div
                onClick={goUp}
                className="flex items-center gap-2 px-4 py-1.5 hover:bg-surface-700 cursor-pointer text-text-secondary"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-accent-blue shrink-0">
                  <path d="M1.5 4a1 1 0 011-1h3l1.5 1.5h6a1 1 0 011 1V12a1 1 0 01-1 1h-10.5a1 1 0 01-1-1V4z" fill="currentColor" fillOpacity="0.7" />
                </svg>{' '}
                ..
              </div>
            )}
            {entries.map((e) => (
              <div
                key={e.name}
                onClick={() => (e.is_dir ? enterDir(e.name) : setSelected(e))}
                className={cn(
                  'flex items-center gap-2 px-4 py-1.5 cursor-pointer group',
                  selected?.name === e.name ? 'bg-surface-700' : 'hover:bg-surface-700'
                )}
              >
                <span className="flex-1 flex items-center gap-2 min-w-0">
                  <FileIcon entry={e} />
                  <span className="text-text-primary truncate">{e.name}</span>
                </span>
                <span className="text-text-muted w-20 text-right">{e.is_dir ? '—' : formatBytes(e.size)}</span>
                <span className="text-text-muted w-24 text-right" title={e.mod_time}>{modAgo(e.mod_time)}</span>
                <span className="text-text-muted w-24 text-right">{e.mode}</span>
                <span className="w-14 text-right flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100">
                  {!e.is_dir && (
                    <a
                      href={downloadFileUrl(serverId, joinPath(e.name))}
                      onClick={(ev) => ev.stopPropagation()}
                      className="text-accent-blue hover:underline text-xs"
                    >
                      ↓
                    </a>
                  )}
                  <button
                    onClick={(ev) => { ev.stopPropagation(); handleDelete(e) }}
                    className="text-accent-red hover:underline text-xs"
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
            {!loading && !error && entries.length === 0 && (
              <p className="px-4 py-6 text-text-muted text-xs text-center">Empty directory.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
