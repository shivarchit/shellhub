import { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = ['dark', 'midnight', 'light', 'nord', 'dracula', 'matrix'] as const
export type Theme = (typeof THEMES)[number]

const STORAGE_KEY = 'shellhub-theme'

function readTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return (THEMES as readonly string[]).includes(stored ?? '') ? (stored as Theme) : 'dark'
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  themes: readonly Theme[]
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
