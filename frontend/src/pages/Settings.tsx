import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSettings, updateSettings, exportData, importData, getAuditLog, getLoginAttempts, getGlobalCommands, createGlobalCommand, updateGlobalCommand, deleteGlobalCommand } from '../lib/api'
import type { AuditEntry, LoginAttempt, GlobalCommand, GlobalCommandInput } from '../lib/types'
import { useAuth } from '../lib/auth'

export default function Settings() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [pingInterval, setPingInterval] = useState('30')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [importFile, setImportFile] = useState<any>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([])
  const [activeTab, setActiveTab] = useState<'general' | 'commands' | 'security'>('general')
  const [globalCmds, setGlobalCmds] = useState<GlobalCommand[]>([])
  const [editingGlobal, setEditingGlobal] = useState<GlobalCommand | null>(null)
  const [showGlobalForm, setShowGlobalForm] = useState(false)
  const [globalForm, setGlobalForm] = useState<GlobalCommandInput>({
    name: '', command: '', tag: '', description: '', is_template: false, sort_order: 0,
  })

  const actionColors: Record<string, string> = {
    server_create: 'bg-accent-green-bg text-accent-green border-accent-green-dim',
    server_update: 'bg-surface-600 text-accent-blue border-border',
    server_delete: 'bg-accent-red-bg text-accent-red border-accent-red-dim',
    command_exec: 'bg-surface-600 text-text-primary border-border',
    terminal_connect: 'bg-accent-green-bg text-accent-green border-accent-green-dim',
    terminal_disconnect: 'bg-accent-red-bg text-accent-red border-accent-red-dim',
  }

  const fetchGlobalCmds = () => {
    getGlobalCommands().then(setGlobalCmds).catch(() => setGlobalCmds([]))
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
    getLoginAttempts()
      .then(setLoginAttempts)
      .catch(() => setLoginAttempts([]))
    fetchGlobalCmds()
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

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleGlobalFormReset = () => {
    setGlobalForm({ name: '', command: '', tag: '', description: '', is_template: false, sort_order: 0 })
    setEditingGlobal(null)
    setShowGlobalForm(false)
  }

  const handleGlobalSave = async () => {
    if (!globalForm.name || !globalForm.command) return
    try {
      if (editingGlobal) {
        await updateGlobalCommand(editingGlobal.id, globalForm)
      } else {
        await createGlobalCommand(globalForm)
      }
      handleGlobalFormReset()
      fetchGlobalCmds()
    } catch (e) {
      console.error(e)
    }
  }

  const handleGlobalEdit = (cmd: GlobalCommand) => {
    setEditingGlobal(cmd)
    setGlobalForm({
      name: cmd.name,
      command: cmd.command,
      tag: cmd.tag,
      description: cmd.description,
      is_template: cmd.is_template,
      sort_order: cmd.sort_order,
    })
    setShowGlobalForm(true)
  }

  const handleGlobalDelete = async (id: number) => {
    if (!window.confirm('Delete this global command?')) return
    try {
      await deleteGlobalCommand(id)
      fetchGlobalCmds()
    } catch (e) {
      console.error(e)
    }
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
          <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-text-secondary hover:text-accent-red hover:border-accent-red-dim transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4">
        {(['general', 'commands', 'security'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab
                ? 'bg-surface-800 text-text-primary border border-border border-b-0'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab === 'general' ? 'General' : tab === 'commands' ? 'Commands' : 'Security & Audit'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 pt-0">
        <div className="max-w-xl mx-auto">
          {activeTab === 'general' && (
            <>
              {/* General section */}
              <div className="bg-surface-800 border border-border rounded-xl p-6 mt-4">
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
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                    Audit Log
                  </h2>
                  <button
                    onClick={() => navigate('/audit')}
                    className="px-3 py-1.5 text-xs font-medium text-accent-blue bg-accent-blue-dim rounded-md hover:opacity-80 transition-opacity"
                  >
                    Full Audit Trail
                  </button>
                </div>
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
            </>
          )}

          {activeTab === 'commands' && (
            <>
              {/* Global Commands section */}
              <div className="bg-surface-800 border border-border rounded-xl p-6 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                    Global Commands
                  </h2>
                  <button
                    onClick={() => { handleGlobalFormReset(); setShowGlobalForm(true) }}
                    className="px-3 py-1.5 text-xs font-medium text-accent-blue bg-accent-blue-dim rounded-md hover:opacity-80 transition-opacity"
                  >
                    + Add Command
                  </button>
                </div>
                <p className="text-xs text-text-muted mb-4">
                  Global commands are available on all servers. Use {'{{variable_name}}'} or {'{{variable_name:default}}'} for templates.
                </p>

                {showGlobalForm && (
                  <div className="mb-4 p-4 bg-surface-900 border border-border rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
                        <input
                          type="text"
                          value={globalForm.name}
                          onChange={(e) => setGlobalForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm bg-surface-800 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
                          placeholder="e.g. Check Disk Space"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1">Tag</label>
                        <input
                          type="text"
                          value={globalForm.tag}
                          onChange={(e) => setGlobalForm(f => ({ ...f, tag: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm bg-surface-800 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
                          placeholder="e.g. monitoring"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Command</label>
                      <input
                        type="text"
                        value={globalForm.command}
                        onChange={(e) => setGlobalForm(f => ({ ...f, command: e.target.value }))}
                        className="w-full px-3 py-1.5 text-sm bg-surface-800 border border-border rounded-md text-text-primary font-mono focus:outline-none focus:border-accent-blue"
                        placeholder="e.g. df -h or docker logs {{container_name}} --tail {{lines:100}}"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
                      <input
                        type="text"
                        value={globalForm.description}
                        onChange={(e) => setGlobalForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full px-3 py-1.5 text-sm bg-surface-800 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
                        placeholder="Optional description"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={globalForm.is_template}
                          onChange={(e) => setGlobalForm(f => ({ ...f, is_template: e.target.checked }))}
                          className="accent-accent-blue"
                        />
                        Template (has variables)
                      </label>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleGlobalSave}
                        className="px-4 py-1.5 text-xs font-medium text-white bg-accent-blue rounded-md hover:opacity-90 transition-opacity"
                      >
                        {editingGlobal ? 'Update' : 'Add'}
                      </button>
                      <button
                        onClick={handleGlobalFormReset}
                        className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-700 rounded-md hover:bg-surface-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {globalCmds.length === 0 ? (
                  <p className="text-sm text-text-muted">No global commands yet.</p>
                ) : (
                  <div className="space-y-2">
                    {globalCmds.map((cmd) => (
                      <div
                        key={cmd.id}
                        className="flex items-center justify-between px-3 py-2.5 bg-surface-700 rounded-lg"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">{cmd.name}</span>
                            {cmd.tag && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-600 text-text-secondary">
                                {cmd.tag}
                              </span>
                            )}
                            {cmd.is_template && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-blue-dim text-accent-blue">
                                template
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-text-muted truncate mt-0.5">{cmd.command}</p>
                          {cmd.description && (
                            <p className="text-xs text-text-muted mt-0.5">{cmd.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 ml-3">
                          <button
                            onClick={() => handleGlobalEdit(cmd)}
                            className="px-2 py-1 text-xs text-text-muted hover:text-text-primary transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleGlobalDelete(cmd.id)}
                            className="px-2 py-1 text-xs text-accent-red hover:opacity-80 transition-opacity"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'security' && (
            <>
              {/* Login Audit section */}
              <div className="bg-surface-800 border border-border rounded-xl p-6 mt-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
                  Login Attempts
                </h2>
                <p className="text-xs text-text-muted mb-4">
                  Accounts are locked after 5 failed attempts in 10 minutes (auto-unlock after 30 min).
                </p>
                {loginAttempts.length === 0 ? (
                  <p className="text-sm text-text-muted">No login attempts recorded.</p>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto space-y-1.5">
                    {loginAttempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        className="flex items-center justify-between px-3 py-2 bg-surface-700 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${
                              attempt.success
                                ? 'bg-accent-green-bg text-accent-green border-accent-green-dim'
                                : 'bg-accent-red-bg text-accent-red border-accent-red-dim'
                            }`}
                          >
                            {attempt.success ? 'success' : 'failed'}
                          </span>
                          <span className="text-text-primary font-medium">
                            {attempt.username}
                          </span>
                          <span className="text-text-muted">
                            from {attempt.ip || 'unknown'}
                          </span>
                        </div>
                        <span className="text-text-muted">{attempt.created_at}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Security Info */}
              <div className="bg-surface-800 border border-border rounded-xl p-6 mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4">
                  Security Info
                </h2>
                <div className="space-y-3 text-sm text-text-secondary">
                  <div className="flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent-green mt-0.5 shrink-0">
                      <path d="M13.3 4.7L6.5 11.5L2.7 7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Passwords hashed with bcrypt</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent-green mt-0.5 shrink-0">
                      <path d="M13.3 4.7L6.5 11.5L2.7 7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Server credentials encrypted at rest (AES-256-GCM)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent-green mt-0.5 shrink-0">
                      <path d="M13.3 4.7L6.5 11.5L2.7 7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Session tokens in httpOnly cookies (24h expiry)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent-green mt-0.5 shrink-0">
                      <path d="M13.3 4.7L6.5 11.5L2.7 7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Rate limiting: 5 failed attempts locks account for 30 min</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
