import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSettings, updateSettings } from '../lib/api'

export default function Settings() {
  const navigate = useNavigate()
  const [pingInterval, setPingInterval] = useState('30')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s.ping_interval) setPingInterval(s.ping_interval)
      })
      .catch(() => {})
  }, [])

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
        </div>
      </div>
    </div>
  )
}
