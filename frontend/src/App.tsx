import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import Dashboard from './pages/Dashboard'
import Terminal from './pages/Terminal'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Audit from './pages/Audit'
import Recordings from './pages/Recordings'
import Metrics from './pages/Metrics'
import Guide from './pages/Guide'
import Status from './pages/Status'
import ToastProvider from './components/ToastProvider'
import { AuthProvider, useAuth } from './lib/auth'
import { ThemeProvider } from './lib/theme'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authenticated, setupRequired, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    )
  }

  if (!authenticated || setupRequired) {
    return <Login />
  }

  return <>{children}</>
}

function RequirePermission({ permission, children }: { permission: keyof import('./lib/auth').UserPermissions; children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user?.permissions?.[permission]) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/terminal/:id" element={<ProtectedRoute><RequirePermission permission="can_open_terminal"><Terminal /></RequirePermission></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/audit" element={<ProtectedRoute><RequirePermission permission="can_view_audit"><Audit /></RequirePermission></ProtectedRoute>} />
      <Route path="/recordings" element={<ProtectedRoute><RequirePermission permission="can_view_recordings"><Recordings /></RequirePermission></ProtectedRoute>} />
      <Route path="/metrics" element={<ProtectedRoute><RequirePermission permission="can_view_metrics"><Metrics /></RequirePermission></ProtectedRoute>} />
      <Route path="/guide" element={<ProtectedRoute><Guide /></ProtectedRoute>} />
      <Route path="/status" element={<ProtectedRoute><Status /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
