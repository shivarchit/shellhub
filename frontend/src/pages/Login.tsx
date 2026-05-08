import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { login, setupRequired, register } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [showLogin, setShowLogin] = useState(false)
  const isSetup = setupRequired && !showLogin

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required')
      return
    }

    if (isSetup) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
    }

    setLoading(true)
    try {
      if (isSetup) {
        await register(username, password)
      } else {
        await login(username, password)
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-accent-blue">
              <path
                d="M4 17L10 11L4 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 19H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">ShellHub</h1>
          <p className="text-sm text-text-muted mt-1">
            {isSetup ? 'Create your admin account to get started' : 'Sign in to manage your servers'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-surface-800 border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {isSetup ? 'Setup' : 'Login'}
          </h2>

          {error && (
            <div className="px-3 py-2 text-sm bg-accent-red-bg border border-accent-red-dim rounded-lg text-accent-red">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-900 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
              placeholder="admin"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Password
            </label>
            <input
              type="password"
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-900 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
              placeholder={isSetup ? 'Min. 6 characters' : 'Enter password'}
            />
          </div>

          {isSetup && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Confirm Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-900 border border-border rounded-md text-text-primary focus:outline-none focus:border-accent-blue"
                placeholder="Repeat password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-medium rounded-lg bg-accent-blue text-white hover:bg-accent-blue/80 transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isSetup ? 'Create Account' : 'Sign In'}
          </button>

          {isSetup && (
            <p className="text-xs text-text-muted text-center">
              Your password is also used to encrypt stored server credentials.
            </p>
          )}

          {setupRequired && (
            <div className="pt-2 border-t border-border mt-2">
              {isSetup ? (
                <button
                  type="button"
                  onClick={() => setShowLogin(true)}
                  className="w-full text-center text-xs text-accent-blue hover:underline"
                >
                  Already have an account? Sign In
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowLogin(false)}
                  className="w-full text-center text-xs text-accent-blue hover:underline"
                >
                  Create a new account instead
                </button>
              )}
            </div>
          )}

        </form>
      </div>
    </div>
  )
}
