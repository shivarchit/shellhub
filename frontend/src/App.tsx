import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Terminal from './pages/Terminal'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Audit from './pages/Audit'
import Recordings from './pages/Recordings'
import ToastProvider from './components/ToastProvider'
import { AuthProvider, useAuth } from './lib/auth'

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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/terminal/:id" element={<ProtectedRoute><Terminal /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/audit" element={<ProtectedRoute><Audit /></ProtectedRoute>} />
      <Route path="/recordings" element={<ProtectedRoute><Recordings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
