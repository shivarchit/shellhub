import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import type { Server, FileEntry, Transfer } from '../lib/types'
import {
  getServers,
  listFiles,
  deleteFile,
  mkdir,
  uploadFiles,
  downloadFileUrl,
  listLocalFiles,
  mkdirLocal,
  pullFile,
  pushFile,
  getTransfers,
} from '../lib/api'
import { useAuth } from '../lib/auth'
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
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" className="text-accent-blue shrink-0">
        <path d="M1.6 3.4h4l1.2 1.7h7.6v7.5H1.6z" />
      </svg>
    )
  }
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" className="text-text-muted shrink-0">
      <path d="M3.4 1.6h6l3.2 3.2v9.6H3.4z" />
      <path d="M9.4 1.6v3.2h3.2" />
    </svg>
  )
}

const UpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 13V3.6" />
    <path d="M4 7.4L8 3.4l4 4" />
  </svg>
)
const NewFolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
    <path d="M1.6 3.4h4l1.2 1.7h7.6v7.5H1.6z" />
    <path d="M8 7.6v3.4M6.3 9.3h3.4" strokeLinecap="round" />
  </svg>
)
const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8" />
    <path d="M13.6 2.2v3.2h-3.2" />
  </svg>
)

const iconBtn =
  'p-1.5 rounded text-text-secondary hover:bg-surface-700 hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
const smallBtn =
  'shrink-0 px-2.5 py-1 text-xs font-medium text-text-secondary bg-surface-700 border border-border rounded hover:bg-surface-600 transition-colors'

/** dataTransfer payload for in-page row drags. */
interface DragPayload {
  side: 'local' | 'remote'
  path: string
  name: string
}
const DRAG_TYPE = 'application/x-shellhub-file'

function readPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DRAG_TYPE)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DragPayload
  } catch {
    return null
  }
}

/** Clears a drop highlight only when the pointer truly left the pane. */
function leftPane(e: React.DragEvent): boolean {
  const to = e.relatedTarget as Node | null
  return !to || !e.currentTarget.contains(to)
}

let uploadCounter = 0

export default function Files() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'superadmin'
  const serverId = Number(id)

  const [server, setServer] = useState<Server | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Remote pane
  const [cwd, setCwd] = useState('.')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<FileEntry | null>(null)

  // Local pane
  const [localPath, setLocalPath] = useState('')
  const [home, setHome] = useState('')
  const [localEntries, setLocalEntries] = useState<FileEntry[]>([])
  const [localError, setLocalError] = useState('')
  const [localSelected, setLocalSelected] = useState<FileEntry | null>(null)

  // Transfers: browser uploads live client-side, server-side copies are polled.
  const [uploads, setUploads] = useState<Transfer[]>([])
  const [serverTransfers, setServerTransfers] = useState<Transfer[]>([])
  const [polling, setPolling] = useState(false)

  const [dropLocal, setDropLocal] = useState(false)
  const [dropRemote, setDropRemote] = useState(false)
  const [dragging, setDragging] = useState(false)
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

  const refreshLocal = useCallback(
    (path?: string) => {
      if (!isSuperAdmin) return
      setLocalError('')
      setLocalSelected(null)
      listLocalFiles(path)
        .then((l) => {
          setLocalPath(l.path)
          setHome(l.home)
          setLocalEntries(l.entries)
        })
        .catch((e) => setLocalError(e.message))
    },
    [isSuperAdmin]
  )

  useEffect(() => {
    refreshLocal()
  }, [refreshLocal])

  // Poll server-side transfer progress while anything is in flight; once the
  // queue goes idle, re-list both panes so the copied file shows up.
  useEffect(() => {
    if (!polling) return
    const tick = () =>
      getTransfers()
        .then((list) => {
          setServerTransfers(list)
          if (!list.some((t) => t.status === 'active')) {
            setPolling(false)
            refreshLocal(localPath)
            refresh()
          }
        })
        .catch(() => setPolling(false))
    tick()
    const iv = setInterval(tick, 500)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, localPath, cwd])

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
  const joinLocal = (name: string) => `${localPath.replace(/\/$/, '')}/${name}`
  const displayLocal = home && localPath.startsWith(home) ? '~' + localPath.slice(home.length) : localPath
  const localAtRoot = localPath === '/'

  // ---- transfers ----

  const startPull = (remote: string) => {
    if (!isSuperAdmin || !localPath) return
    pullFile(serverId, remote, localPath)
      .then(() => setPolling(true))
      .catch((e) => window.alert(e.message))
  }

  const startPush = (local: string) => {
    if (!isSuperAdmin) return
    pushFile(serverId, local, cwd === '.' ? '.' : cwd)
      .then(() => setPolling(true))
      .catch((e) => window.alert(e.message))
  }

  const handleUpload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    for (const file of list) {
      const tid = `u-${++uploadCounter}`
      setUploads((prev) => [
        { id: tid, name: file.name, direction: 'push', total: file.size, done: 0, status: 'active' },
        ...prev,
      ])
      try {
        await uploadFiles(serverId, cwd, [file], (loaded) => {
          setUploads((prev) => prev.map((t) => (t.id === tid ? { ...t, done: loaded } : t)))
        })
        setUploads((prev) => prev.map((t) => (t.id === tid ? { ...t, done: file.size, status: 'done' } : t)))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'failed'
        setUploads((prev) => prev.map((t) => (t.id === tid ? { ...t, status: 'error', error: msg } : t)))
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

  const handleLocalMkdir = () => {
    const name = window.prompt('New folder name')
    if (!name) return
    mkdirLocal(joinLocal(name))
      .then(() => refreshLocal(localPath))
      .catch((err) => window.alert(err.message))
  }

  // ---- drag & drop ----

  const dragStart = (e: React.DragEvent, side: 'local' | 'remote', entry: FileEntry, path: string) => {
    if (entry.is_dir) {
      e.preventDefault()
      return
    }
    const payload: DragPayload = { side, path, name: entry.name }
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
    setDragging(true)
  }

  const onLocalDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropLocal(false)
    setDragging(false)
    const p = readPayload(e)
    if (p?.side === 'remote') startPull(p.path)
    else if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files)
  }

  const onRemoteDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropRemote(false)
    setDragging(false)
    const p = readPayload(e)
    if (p?.side === 'local') startPush(p.path)
    else if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files)
  }

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const transfers = [...uploads, ...serverTransfers]

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
    // h-screen, not min-h-screen: panes scroll internally instead of the page.
    <div className="h-screen overflow-hidden bg-surface-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <button onClick={() => navigate('/')} className="text-text-muted hover:text-text-primary text-sm">
          ← Back
        </button>
        <h1 className="text-lg font-semibold text-text-primary">SFTP</h1>
        {server && (
          <span className="text-sm text-text-muted font-mono truncate max-w-xs" title={`${server.username}@${server.host}`}>
            {server.username}@{server.host}
          </span>
        )}
      </div>

      <div className="flex-1 grid grid-cols-2 gap-0 p-6 min-h-0">
        {/* ---------- Left pane: this Mac ---------- */}
        <div
          onDragOver={allowDrop}
          onDragEnter={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes('Files')) setDropLocal(true) }}
          onDragLeave={(e) => { if (leftPane(e)) setDropLocal(false) }}
          onDrop={onLocalDrop}
          className={cn(
            'relative bg-surface-800 rounded-l-lg border border-border border-r-0 flex flex-col min-h-0',
            dropLocal && 'ring-2 ring-inset ring-accent-blue bg-accent-blue/5'
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary truncate">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" className="text-text-muted">
                <rect x="2" y="2.5" width="12" height="8.5" rx="1.2" />
                <path d="M1 13.5h14" strokeLinecap="round" />
              </svg>
              This Mac
            </span>
            <button
              onClick={() => (localSelected && !localSelected.is_dir ? startPush(joinLocal(localSelected.name)) : fileInputRef.current?.click())}
              className={smallBtn}
              title={localSelected ? `Push ${localSelected.name}` : 'Choose files to upload'}
            >
              Upload to {server?.name ?? 'server'} →
            </button>
          </div>

          {isSuperAdmin ? (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border min-w-0">
                <button
                  onClick={() => refreshLocal(localPath.replace(/\/[^/]+$/, '') || '/')}
                  disabled={localAtRoot}
                  title="Up one level"
                  className={iconBtn}
                >
                  <UpIcon />
                </button>
                <span className="flex-1 font-mono text-xs text-text-primary truncate" title={localPath}>
                  {displayLocal}
                </span>
                <button onClick={handleLocalMkdir} title="New folder" className={iconBtn}>
                  <NewFolderIcon />
                </button>
                <button onClick={() => refreshLocal(localPath)} title="Refresh" className={iconBtn}>
                  <RefreshIcon />
                </button>
              </div>

              {/* Column headers */}
              <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                <span className="flex-1">Name</span>
                <span className="w-20 text-right">Size</span>
                <span className="w-24 text-right">Modified</span>
              </div>

              <div className="flex-1 overflow-y-auto font-mono text-sm min-h-0">
                {localError && <p className="px-4 py-3 text-accent-red text-xs">{localError}</p>}
                {localEntries.map((e) => (
                  <div
                    key={e.name}
                    draggable={!e.is_dir}
                    onDragStart={(ev) => dragStart(ev, 'local', e, joinLocal(e.name))}
                    onDragEnd={() => setDragging(false)}
                    onClick={() => (e.is_dir ? refreshLocal(joinLocal(e.name)) : setLocalSelected(e))}
                    className={cn(
                      'flex items-center gap-2 px-4 py-1.5 cursor-pointer',
                      localSelected?.name === e.name ? 'bg-surface-700' : 'hover:bg-surface-700'
                    )}
                  >
                    <span className="flex-1 flex items-center gap-2 min-w-0">
                      <FileIcon entry={e} />
                      <span className="text-text-primary truncate">{e.name}</span>
                    </span>
                    <span className="text-text-muted w-20 text-right">{e.is_dir ? '—' : formatBytes(e.size)}</span>
                    <span className="text-text-muted w-24 text-right" title={e.mod_time}>{modAgo(e.mod_time)}</span>
                  </div>
                ))}
                {!localError && localEntries.length === 0 && (
                  <p className="px-4 py-6 text-text-muted text-xs text-center">Empty directory.</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 p-4 overflow-y-auto">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg py-10 text-center text-sm text-text-muted hover:border-accent-blue/50 cursor-pointer transition-colors"
              >
                Drop files here or click to browse
              </div>
            </div>
          )}

          {/* Compact dropzone + transfer queue */}
          <div className="border-t border-border px-3 py-2.5 bg-surface-800/50 shrink-0">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 border border-dashed border-border-medium rounded-lg px-3 py-2 text-[11.5px] text-text-muted hover:border-accent-blue/60 hover:text-text-secondary cursor-pointer transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2.6v7.2" />
                <path d="M5 6.9l3 3 3-3" />
                <path d="M2.6 12.6h10.8" />
              </svg>
              Drop files here, or click to browse this Mac
            </div>
            <div className="mt-2 flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              {transfers.length === 0 && (
                <p className="text-[11px] text-text-muted text-center py-2">No transfers yet.</p>
              )}
              {transfers.map((t) => {
                const pct = t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : t.status === 'done' ? 100 : 0
                return (
                  <div key={t.id} className="px-3 py-2 bg-surface-700 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-text-primary truncate">{t.name}</span>
                      <span
                        className={cn(
                          'font-mono text-[11px] whitespace-nowrap',
                          t.status === 'done' ? 'text-accent-green' : t.status === 'error' ? 'text-accent-red' : 'text-text-muted'
                        )}
                        title={t.error}
                      >
                        {t.status === 'error' ? 'error' : t.status === 'done' ? 'done' : `${pct}%`}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-surface-600 overflow-hidden my-1.5">
                      <span
                        className={cn(
                          'block h-full transition-all',
                          t.status === 'error' ? 'bg-accent-red' : t.status === 'done' ? 'bg-accent-green' : 'bg-accent-blue'
                        )}
                        style={{ width: `${t.status === 'error' ? 100 : pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[10.5px] text-text-muted">
                      <span>
                        {t.direction === 'pull' ? '←' : '→'} {t.direction === 'pull' ? 'from' : 'to'} {server?.name ?? 'server'}
                      </span>
                      <span>
                        {formatBytes(t.done)}
                        {t.total > 0 ? ` / ${formatBytes(t.total)}` : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
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

          {dropLocal && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="px-3.5 py-2 rounded-lg bg-accent-blue text-on-accent text-xs font-semibold shadow-lg">
                Drop to copy to <span className="font-mono font-normal">{displayLocal || 'this Mac'}</span>
              </span>
            </div>
          )}
        </div>

        {/* ---------- Right pane: server ---------- */}
        <div
          onDragOver={allowDrop}
          onDragEnter={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE) || e.dataTransfer.types.includes('Files')) setDropRemote(true) }}
          onDragLeave={(e) => { if (leftPane(e)) setDropRemote(false) }}
          onDrop={onRemoteDrop}
          className={cn(
            'relative bg-surface-800 rounded-r-lg border border-border flex flex-col min-h-0',
            dropRemote && 'ring-2 ring-inset ring-accent-blue bg-accent-blue/5'
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-accent-green shrink-0" />
              <span className="text-sm font-semibold text-text-primary truncate">{server?.name ?? 'Server'}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selected && !selected.is_dir ? (
                isSuperAdmin ? (
                  <button onClick={() => startPull(joinPath(selected.name))} className={smallBtn} title={`Pull ${selected.name} to ${displayLocal}`}>
                    ← Download to Mac
                  </button>
                ) : (
                  <a href={downloadFileUrl(serverId, joinPath(selected.name))} className={smallBtn} title={`Download ${selected.name}`}>
                    ← Download to Mac
                  </a>
                )
              ) : (
                <span className="px-2.5 py-1 text-xs font-medium text-text-muted bg-surface-700 border border-border rounded opacity-50 cursor-not-allowed" title="Select a file to download">
                  ← Download to Mac
                </span>
              )}
              <button onClick={handleMkdir} title="New folder" className={iconBtn}>
                <NewFolderIcon />
              </button>
              <button onClick={refresh} title="Refresh" className={iconBtn}>
                <RefreshIcon />
              </button>
            </div>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border text-xs font-mono min-w-0">
            <button onClick={goUp} disabled={atRoot} title="Up one directory" className={iconBtn}>
              <UpIcon />
            </button>
            <button className="text-text-secondary hover:text-accent-blue" onClick={() => goTo(-1)}>~</button>
            {segments.map((seg, i) => (
              <span key={i} className="flex items-center gap-1.5 min-w-0">
                <span className="text-text-dimmed">/</span>
                <button
                  className={cn('truncate hover:text-accent-blue', i === segments.length - 1 ? 'text-text-primary' : 'text-text-secondary')}
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
            <span className="w-14" />
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-sm min-h-0">
            {error && <p className="px-4 py-3 text-accent-red text-xs">{error}</p>}
            {loading && <p className="px-4 py-3 text-text-muted text-xs">Loading…</p>}
            {!atRoot && (
              <div onClick={goUp} className="flex items-center gap-2 px-4 py-1.5 hover:bg-surface-700 cursor-pointer text-text-secondary">
                <FileIcon entry={{ name: '..', size: 0, mode: '', is_dir: true, mod_time: '' }} /> ..
              </div>
            )}
            {entries.map((e) => (
              <div
                key={e.name}
                draggable={!e.is_dir}
                onDragStart={(ev) => dragStart(ev, 'remote', e, joinPath(e.name))}
                onDragEnd={() => setDragging(false)}
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
                <span className="text-text-muted w-24 text-right" title={`${e.mod_time} · ${e.mode}`}>{modAgo(e.mod_time)}</span>
                <span className="w-14 text-right flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100">
                  {!e.is_dir && (
                    <a
                      href={downloadFileUrl(serverId, joinPath(e.name))}
                      onClick={(ev) => ev.stopPropagation()}
                      title="Download in browser"
                      className="text-accent-blue hover:underline text-xs"
                    >
                      ↓
                    </a>
                  )}
                  <button onClick={(ev) => { ev.stopPropagation(); handleDelete(e) }} className="text-accent-red hover:underline text-xs">
                    ✕
                  </button>
                </span>
              </div>
            ))}
            {!loading && !error && entries.length === 0 && (
              <p className="px-4 py-6 text-text-muted text-xs text-center">Empty directory.</p>
            )}
          </div>

          <div className="px-4 py-2 border-t border-border bg-surface-800/50 font-mono text-[10.5px] text-text-muted shrink-0">
            {entries.length} items · streaming over SFTP as {server?.username ?? '—'}
            {dragging && isSuperAdmin && ' · drop a row on the other pane to copy'}
          </div>

          {dropRemote && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="px-3.5 py-2 rounded-lg bg-accent-blue text-on-accent text-xs font-semibold shadow-lg">
                Drop to copy to <span className="font-mono font-normal">{atRoot ? '~' : cwd}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
