import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSettings, updateSettings, exportData, importData, getAuditLog } from '../lib/api'
import type { AuditEntry } from '../lib/types'

export default function Settings() {
  const navigate = useNavigate()
  const [pingInterval, setPingInterval] = useState('30')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [importFile, setImportFile] = useState<any>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])

  const actionColors: Record<string, string> = {
    server_create: 'bg-accent-green-bg text-accent-green border-accent-green-dim',
    server_update: 'bg-surface-600 text-accent-blue border-border',
    server_delete: 'bg-accent-red-bg text-accent-red border-accent-red-dim',
    command_exec: 'bg-surface-600 text-text-primary border-border',
    terminal_connect: 'bg-accent-green-bg text-accent-green border-accent-green-dim',
    terminal_disconnect: 'bg-accent-red-bg text-accent-red border-accent-red-dim',
  }

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s.ping_interval) setPingInterval(s.ping_interval)
      })
      .catch(() => {})
    getAuditLog()
      .then(setAuditEntries)
      .catch(() => setAuditEntries([]))
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        setImportFile(data)
        setImportResult('')
      } catch {
        setImportFile(null)
        setImportResult('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    try {
      const result = await importData(importFile, importMode)
      setImportResult(`Imported ${result.imported} servers`)
      setImportFile(null)
    } catch (e) {
      setImportResult('Import failed')
    } finally {
      setImporting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await updateSettings({ ping_interval: pingInterval })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-800">
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
        <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto">
          {/* General section */}
          <div className="bg-surface-800 border border-border rounded-xl p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
              General
            </h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Ping Interval (minutes)
              </label>
              <input
                type="number"
                min="1"
                value={pingInterval}
                onChange={(e) => setPingInterval(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-900 border border-border rounded-md text-text-primary font-mono focus:outline-none focus:border-accent-blue"
              />
              <p className="text-xs text-text-muted mt-1.5">
                How often to check server online/offline status
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              {saved && (
                <span className="text-sm text-accent-green">Settings saved</span>
              )}
            </div>
          </div>

          {/* Export & Import section */}
          <div className="bg-surface-800 border border-border rounded-xl p-6 mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
              Export & Import
            </h2>

            {/* Export */}
            <div className="mb-6">
              <p className="text-sm text-text-secondary mb-2">
                Download all servers and settings as a JSON file.
              </p>
              <button
                onClick={exportData}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors"
              >
                Export Data
              </button>
            </div>

            {/* Import */}
            <div>
              <p className="text-sm text-text-secondary mb-2">
                Import servers and settings from a JSON file.
              </p>
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="block w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-surface-700 file:text-text-primary hover:file:bg-surface-600 file:cursor-pointer file:transition-colors"
              />

              {importFile && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-text-primary">
                    Found {importFile.servers?.length ?? 0} server(s) in file
                  </p>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="accent-accent-blue"
                      />
                      Merge
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="accent-accent-blue"
                      />
                      Replace all
                    </label>
                  </div>

                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-green text-white hover:bg-accent-green/80 transition-colors disabled:opacity-50"
                  >
                    {importing ? 'Importing...' : 'Import'}
                  </button>
                </div>
              )}

              {importResult && (
                <p className={`mt-3 text-sm ${importResult.startsWith('Import') && !importResult.includes('failed') ? 'text-accent-green' : 'text-red-400'}`}>
                  {importResult}
                </p>
              )}
            </div>
          </div>

          {/* Audit Log section */}
          <div className="bg-surface-800 border border-border rounded-xl p-6 mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
              Audit Log
            </h2>
            {auditEntries.length === 0 ? (
              <p className="text-sm text-text-muted">No audit entries yet.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-1.5">
                {auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-3 py-2 bg-surface-700 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${
                          actionColors[entry.action] || 'bg-surface-600 text-text-muted border-border'
                        }`}
                      >
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                      {entry.details && (
                        <span className="text-text-primary truncate max-w-[200px]">
                          {entry.details}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-text-muted">
                      {entry.server_id !== null && (
                        <span>Server #{entry.server_id}</span>
                      )}
                      <span>{entry.created_at}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
