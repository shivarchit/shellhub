import { createContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { cn } from '../lib/utils'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  duration: number
  exiting?: boolean
}

export interface ToastContextValue {
  addToast: (message: string, type: Toast['type'], duration?: number) => void
}

export const ToastContext = createContext<ToastContextValue>({
  addToast: () => {},
})

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const addToast = useCallback((message: string, type: Toast['type'], duration = 3000) => {
    const id = String(++counterRef.current)
    setToasts(prev => [...prev, { id, message, type, duration }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 300)
    }, duration)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto px-4 py-3 rounded-lg border text-sm font-medium shadow-lg min-w-[280px] max-w-[400px]',
              toast.exiting ? 'animate-toast-out' : 'animate-toast-in',
              toast.type === 'success' && 'bg-accent-green-bg border-accent-green-dim text-accent-green',
              toast.type === 'error' && 'bg-accent-red-bg border-accent-red-dim text-accent-red',
              toast.type === 'info' && 'bg-surface-700 border-border text-text-primary',
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
