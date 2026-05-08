import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

interface AuthState {
  authenticated: boolean
  setupRequired: boolean
  loading: boolean
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
  })

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setState({
          authenticated: data.authenticated,
          setupRequired: data.setup_required,
          loading: false,
        })
      } else {
        setState({ authenticated: false, setupRequired: false, loading: false })
      }
    } catch {
      setState({ authenticated: false, setupRequired: false, loading: false })
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
    setState((s) => ({ ...s, authenticated: true, setupRequired: false }))
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
    setState((s) => ({ ...s, authenticated: true, setupRequired: false }))
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setState((s) => ({ ...s, authenticated: false }))
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
