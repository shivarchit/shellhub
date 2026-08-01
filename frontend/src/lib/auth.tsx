import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

export interface UserPermissions {
  can_view_recordings: boolean
  can_view_metrics: boolean
  can_view_audit: boolean
  can_manage_servers: boolean
  can_exec_commands: boolean
  can_open_terminal: boolean
  can_view_db: boolean
}

interface UserInfo {
  id: number
  username: string
  role: string
  permissions: UserPermissions
}

interface AuthState {
  authenticated: boolean
  setupRequired: boolean
  loading: boolean
  user: UserInfo | null
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    authenticated: false,
    setupRequired: false,
    loading: true,
    user: null,
  })

  const fetchUser = async (): Promise<UserInfo | null> => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (res.ok) return await res.json()
    } catch {
      // ignore - treated as "no user yet"
    }
    return null
  }

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        // Permissions gate routing, so stay in loading until the user (and its
        // permissions) has settled - otherwise a reload of /audit renders with
        // user=null and RequirePermission bounces to "/".
        const user = data.authenticated ? await fetchUser() : null
        setState({
          authenticated: data.authenticated,
          setupRequired: data.setup_required,
          loading: false,
          user,
        })
      } else {
        setState({ authenticated: false, setupRequired: false, loading: false, user: null })
      }
    } catch {
      setState({ authenticated: false, setupRequired: false, loading: false, user: null })
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Login failed' }))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const user = await fetchUser()
    setState((s) => ({ ...s, authenticated: true, setupRequired: false, user }))
  }

  const register = async (username: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Registration failed' }))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const user = await fetchUser()
    setState((s) => ({ ...s, authenticated: true, setupRequired: false, user }))
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setState((s) => ({ ...s, authenticated: false, user: null }))
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
