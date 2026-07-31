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

function fileIcon(e: FileEntry): string {
  if (e.is_dir) return '📁'
  if (/\.(tar|gz|zip|tgz|bz2|xz|7z|rar)$/i.test(e.name)) return '📦'
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(e.name)) return '🖼'
  return '📄'
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
        <button onClick={() => navigate('/')} className="px-4 py-2 text-sm text-white bg-accent-blue rounded-lg">
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
          <span className="text-sm text-text-muted font-mono">
            {server.username}@{server.host}
          </span>
        )}
      </div>

      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] gap-0 p-6 min-h-0">
        {/* Left pane — This Mac */}
        <div className="bg-surface-800 rounded-l-lg border border-border flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text-primary">💻 This Mac</span>
            <span className="text-xs text-text-muted">drop files to upload</span>
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
                <>⬇ Drop files here — uploading to <b className="font-mono">{atRoot ? '~' : '/' + cwd}</b></>
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
                  <span>📦</span>
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
                  {t.status === 'done' && <span className="text-accent-green whitespace-nowrap">✓ done</span>}
                  {t.status === 'error' && (
                    <span className="text-accent-red whitespace-nowrap" title={t.error}>✕ error</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center gutter — transfer arrows */}
        <div className="flex flex-col items-center justify-center gap-2 px-3 border-y border-border bg-surface-800">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="animate-pulse">
            <path d="M4 12h14m0 0l-5-5m5 5l-5 5" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ transform: 'rotate(180deg)' }} className="animate-pulse">
            <path d="M4 12h14m0 0l-5-5m5 5l-5 5" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-accent-green shrink-0" />
              <span className="text-sm font-semibold text-text-primary truncate">{server?.name ?? 'Server'}</span>
              <span className="text-xs text-text-muted font-mono truncate">
                <button className="hover:text-accent-blue" onClick={() => goTo(-1)}>~</button>
                {segments.map((seg, i) => (
                  <span key={i}>
                    <span className="text-text-muted">/</span>
                    <button className="hover:text-accent-blue" onClick={() => goTo(i)}>{seg}</button>
                  </span>
                ))}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleMkdir} className="px-2.5 py-1 text-xs text-text-secondary bg-surface-700 border border-border rounded hover:bg-surface-600">
                New Folder
              </button>
              <button onClick={refresh} className="px-2.5 py-1 text-xs text-text-secondary bg-surface-700 border border-border rounded hover:bg-surface-600">
                ⟳
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-sm">
            {error && <p className="px-4 py-3 text-accent-red text-xs">{error}</p>}
            {loading && <p className="px-4 py-3 text-text-muted text-xs">Loading…</p>}
            {!atRoot && (
              <div
                onClick={goUp}
                className="flex items-center gap-2 px-4 py-1.5 hover:bg-surface-700 cursor-pointer text-text-secondary"
              >
                <span>📁</span> ..
              </div>
            )}
            {entries.map((e) => (
              <div
                key={e.name}
                onClick={() => e.is_dir && enterDir(e.name)}
                className={cn(
                  'flex items-center gap-2 px-4 py-1.5 hover:bg-surface-700 group',
                  e.is_dir && 'cursor-pointer'
                )}
              >
                <span>{fileIcon(e)}</span>
                <span className="flex-1 text-text-primary truncate">{e.name}</span>
                <span className="text-text-muted w-20 text-right">{e.is_dir ? '—' : formatBytes(e.size)}</span>
                <span className="text-text-muted w-24 text-right">{e.mode}</span>
                <span className="w-24 text-right flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100">
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
