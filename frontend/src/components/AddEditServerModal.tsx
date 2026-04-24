import { useState, useEffect } from 'react'
import type { Server, ServerInput, QuickCommand } from '../lib/types'

interface AddEditServerModalProps {
  server: Server | null
  onSave: (s: ServerInput) => Promise<void>
  onClose: () => void
}

function emptyCommand(): QuickCommand {
  return { name: '', command: '', tag: '' }
}

export default function AddEditServerModal({
  server,
  onSave,
  onClose,
}: AddEditServerModalProps) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(22)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [group, setGroup] = useState('')
  const [commands, setCommands] = useState<QuickCommand[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (server) {
      setName(server.name)
      setHost(server.host)
      setPort(server.port)
      setUsername(server.username)
      setPassword(server.password)
      setGroup(server.group)
      setCommands(server.quick_commands?.length ? [...server.quick_commands] : [])
    } else {
      setName('')
      setHost('')
      setPort(22)
      setUsername('')
      setPassword('')
      setGroup('')
      setCommands([])
    }
  }, [server])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        name,
        host,
        port,
        username,
        password,
        group,
        quick_commands: commands.filter((c) => c.name && c.command),
      })
    } finally {
      setSaving(false)
    }
  }

  const updateCommand = (
    index: number,
    field: keyof QuickCommand,
    value: string
  ) => {
    setCommands((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    )
  }

  const removeCommand = (index: number) => {
    setCommands((prev) => prev.filter((_, i) => i !== index))
  }

  const inputClass =
    'w-full px-3 py-2 text-sm bg-surface-900 border border-border text-text-primary rounded-md focus:outline-none focus:border-accent-blue placeholder:text-text-muted'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-surface-800 border border-border rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-lg font-semibold text-text-primary">
            {server ? 'Edit Server' : 'Add Server'}
          </h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Server"
                className={inputClass}
              />
            </div>

            {/* Host + Port */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Host
                </label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.100"
                  className={inputClass}
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Port
                </label>
                <input
                  type="number"
                  required
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root"
                className={inputClass}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className={inputClass}
              />
            </div>

            {/* Group */}
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Group
              </label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="Production"
                className={inputClass}
              />
            </div>

            {/* Quick Commands */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-text-secondary">
                  Quick Commands
                </label>
                <button
                  type="button"
                  onClick={() => setCommands((prev) => [...prev, emptyCommand()])}
                  className="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
                >
                  + Add Command
                </button>
              </div>
              <div className="space-y-3">
                {commands.map((cmd, i) => (
                  <div
                    key={i}
                    className="p-3 bg-surface-900 rounded-lg border border-border space-y-2"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cmd.name}
                        onChange={(e) => updateCommand(i, 'name', e.target.value)}
                        placeholder="Name"
                        className={inputClass}
                      />
                      <input
                        type="text"
                        value={cmd.tag}
                        onChange={(e) => updateCommand(i, 'tag', e.target.value)}
                        placeholder="Tag"
                        className={`${inputClass} w-28`}
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={cmd.command}
                        onChange={(e) =>
                          updateCommand(i, 'command', e.target.value)
                        }
                        placeholder="command --flag"
                        className={`${inputClass} font-mono`}
                      />
                      <button
                        type="button"
                        onClick={() => removeCommand(i)}
                        className="shrink-0 text-text-muted hover:text-accent-red transition-colors text-sm px-1"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary bg-surface-700 rounded-md hover:bg-surface-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-blue rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving...' : server ? 'Save Changes' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
