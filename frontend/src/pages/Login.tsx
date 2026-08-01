import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../lib/auth'
import Logo from '../components/Logo'

const BOOT_LINES = [
  '[boot] ShellHub v1.0 initializing...',
  '[auth] Loading encryption module...',
  '[auth] AES-256-GCM ready',
  '[ssh]  Key exchange algorithms loaded',
  '[net]  Binding port 8080...',
  '[net]  Server listening on 0.0.0.0:8080',
  '[sys]  System tray initialized',
  '[ok]   Ready for connections',
]

const SETUP_STEPS = [
  { label: 'Welcome', desc: 'First-time setup' },
  { label: 'Account', desc: 'Create admin credentials' },
  { label: 'Ready', desc: 'Start managing servers' },
]

export default function Login() {
  const { login, setupRequired, register, authenticated } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [showLogin, setShowLogin] = useState(false)
  const isSetup = setupRequired && !showLogin
  const [setupStep, setSetupStep] = useState(0)

  const [visibleLines, setVisibleLines] = useState(0)
  const [showCursor, setShowCursor] = useState(false)

  useEffect(() => {
    if (authenticated) {
      navigate('/', { replace: true })
    }
  }, [authenticated, navigate])

  useEffect(() => {
    if (visibleLines < BOOT_LINES.length) {
      const timer = setTimeout(() => {
        setVisibleLines((v) => v + 1)
      }, 400)
      return () => clearTimeout(timer)
    } else {
      setShowCursor(true)
    }
  }, [visibleLines])

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
    <>
      <style>{`
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 15px rgb(var(--sh-accent-blue) / 0.3), 0 0 30px rgb(var(--sh-accent-blue) / 0.1); }
          50% { box-shadow: 0 0 25px rgb(var(--sh-accent-blue) / 0.5), 0 0 50px rgb(var(--sh-accent-blue) / 0.2); }
        }
        @keyframes line-appear {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .boot-line {
          animation: line-appear 0.3s ease-out forwards;
        }
        .scan-line {
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgb(var(--sh-accent-blue) / 0.015) 2px,
            rgb(var(--sh-accent-blue) / 0.015) 4px
          );
        }
        .grid-bg {
          background-image:
            linear-gradient(rgb(var(--sh-border) / 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgb(var(--sh-border) / 0.5) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>

      <div className="min-h-screen flex flex-col lg:flex-row bg-surface-900">
        {/* Left Panel — Terminal boot sequence */}
        <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-center items-center overflow-hidden">
          {/* Grid background */}
          <div className="absolute inset-0 grid-bg" />
          {/* Scan-line overlay */}
          <div className="absolute inset-0 scan-line pointer-events-none" />

          <div className="relative z-10 w-full max-w-lg px-12">
            <div className="mb-6">
              <span className="font-mono text-xs text-text-muted">ssh root@shellhub — 80x24</span>
              <div className="mt-1 h-px bg-border" />
            </div>
            <div className="font-mono text-sm leading-relaxed space-y-1">
              {BOOT_LINES.slice(0, visibleLines).map((line, i) => {
                const isOk = line.startsWith('[ok]')
                const isAuth = line.startsWith('[auth]')
                const isSsh = line.startsWith('[ssh]')
                const isNet = line.startsWith('[net]')
                let color = 'text-text-muted'
                if (isOk) color = 'text-accent-green'
                else if (isAuth) color = 'text-accent-blue'
                else if (isSsh) color = 'text-accent-amber'
                else if (isNet) color = 'text-text-secondary'

                return (
                  <div key={i} className={`boot-line ${color}`}>
                    {line}
                  </div>
                )
              })}
              {showCursor && (
                <span
                  className="inline-block text-accent-green font-mono"
                  style={{ animation: 'blink 1s step-end infinite' }}
                >
                  _
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel — Form */}
        <div className="flex-1 flex items-center justify-center px-4 py-12 lg:py-0">
          <div className="w-full max-w-sm">
            {/* Logo / Title */}
            <div className="text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
                style={{ animation: 'glow-pulse 3s ease-in-out infinite' }}
              >
                <Logo size={48} />
              </div>
              <h1 className="text-3xl font-bold text-text-primary">ShellHub</h1>
              <p className="text-sm text-text-muted mt-1">
                {isSetup ? 'Create your admin account to get started' : 'Sign in to manage your servers'}
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="bg-surface-800/60 backdrop-blur-sm border border-border rounded-xl p-6 space-y-4 shadow-lg shadow-black/20"
            >
              {/* Setup wizard steps */}
              {isSetup && (
                <div className="flex items-center gap-2 mb-2">
                  {SETUP_STEPS.map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                        i < setupStep ? 'bg-accent-green/20 border-accent-green text-accent-green' :
                        i === setupStep ? 'bg-accent-blue/20 border-accent-blue text-accent-blue' :
                        'border-border text-text-muted'
                      }`}>
                        {i < setupStep ? '✓' : i + 1}
                      </div>
                      {i < SETUP_STEPS.length - 1 && (
                        <div className={`w-6 h-px ${i < setupStep ? 'bg-accent-green' : 'bg-border'}`} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Setup Step 0: Welcome */}
              {isSetup && setupStep === 0 && (
                <>
                  <h2 className="text-lg font-semibold text-text-primary">Welcome to ShellHub</h2>
                  <p className="text-sm text-text-muted">
                    Let's get you set up. You'll create an admin account that will be used to manage servers, users, and settings.
                  </p>
                  <div className="space-y-2 text-xs text-text-secondary">
                    <div className="flex items-center gap-2">
                      <span className="text-accent-green">✓</span> Encrypted credential storage (AES-256-GCM)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-accent-green">✓</span> Role-based access control
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-accent-green">✓</span> Full audit trail
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSetupStep(1)}
                    className="w-full py-2.5 text-sm font-medium rounded-lg bg-accent-blue text-on-accent hover:bg-accent-blue/80 transition-colors"
                  >
                    Get Started
                  </button>
                </>
              )}

              {/* Setup Step 1: Account creation (or Login form) */}
              {(!isSetup || setupStep === 1) && (
                <>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {isSetup ? 'Create Admin Account' : 'Login'}
                  </h2>

                  {error && (
                    <div className="px-3 py-2 text-sm bg-accent-red-bg border border-accent-red-dim rounded-lg text-accent-red">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5 font-mono">
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
                    <label className="block text-sm font-medium text-text-secondary mb-1.5 font-mono">
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
                      <label className="block text-sm font-medium text-text-secondary mb-1.5 font-mono">
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
                    className="w-full py-2.5 text-sm font-medium rounded-lg bg-accent-blue text-on-accent hover:bg-accent-blue/80 transition-colors disabled:opacity-50"
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
                </>
              )}

            </form>
          </div>
        </div>
      </div>
    </>
  )
}
