import { useState } from 'react'
import type { TemplateVariable } from '../lib/types'

interface TemplateModalProps {
  commandName: string
  variables: TemplateVariable[]
  onSubmit: (values: Record<string, string>) => void
  onCancel: () => void
}

export default function TemplateModal({
  commandName,
  variables,
  onSubmit,
  onCancel,
}: TemplateModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const v of variables) {
      initial[v.name] = v.defaultValue
    }
    return initial
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(values)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="relative z-10 w-full max-w-md mx-4 bg-surface-800 border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              Template Variables
            </h3>
            <p className="text-xs text-text-muted mt-0.5">{commandName}</p>
          </div>
          <button
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {variables.map((v) => (
            <div key={v.name}>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                {v.name}
              </label>
              <input
                type="text"
                value={values[v.name] || ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                }
                placeholder={v.defaultValue || `Enter ${v.name}`}
                className="w-full px-3 py-2 text-sm bg-surface-900 border border-border rounded-md text-text-primary font-mono focus:outline-none focus:border-accent-blue"
                autoFocus={variables.indexOf(v) === 0}
              />
              {v.defaultValue && (
                <p className="text-xs text-text-muted mt-1">
                  Default: {v.defaultValue}
                </p>
              )}
            </div>
          ))}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-700 rounded-md hover:bg-surface-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-accent-blue rounded-md hover:opacity-90 transition-opacity"
            >
              Run Command
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
