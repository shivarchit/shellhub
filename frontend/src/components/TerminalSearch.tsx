import { useState, useRef, useEffect, useCallback } from 'react'
import type { SearchAddon } from '@xterm/addon-search'
import { cn } from '../lib/utils'

interface TerminalSearchProps {
  searchAddon: SearchAddon | null
  onClose: () => void
}

export default function TerminalSearch({ searchAddon, onClose }: TerminalSearchProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [matchCount, setMatchCount] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(
    (direction: 'next' | 'prev') => {
      if (!searchAddon || !query) return
      const opts = { caseSensitive, regex }
      if (direction === 'next') {
        searchAddon.findNext(query, opts)
      } else {
        searchAddon.findPrevious(query, opts)
      }
    },
    [searchAddon, query, caseSensitive, regex]
  )

  useEffect(() => {
    if (!searchAddon) return
    if (!query) {
      searchAddon.clearDecorations()
      setMatchCount('')
      return
    }
    const opts = { caseSensitive, regex }
    searchAddon.findNext(query, opts)
    setMatchCount('')
  }, [searchAddon, query, caseSensitive, regex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      searchAddon?.clearDecorations()
      onClose()
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        doSearch('prev')
      } else {
        doSearch('next')
      }
    }
  }

  return (
    <div className="absolute top-0 right-0 z-20 flex items-center gap-2 bg-surface-800 border border-border rounded-bl-lg px-3 py-2 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        className="w-48 px-2 py-1 text-sm bg-surface-900 border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
      />

      {matchCount && (
        <span className="text-xs text-text-muted font-mono">{matchCount}</span>
      )}

      {/* Case sensitivity toggle */}
      <button
        onClick={() => setCaseSensitive(!caseSensitive)}
        className={cn(
          'px-1.5 py-1 text-xs font-mono rounded border transition-colors',
          caseSensitive
            ? 'bg-accent-blue-dim text-accent-blue border-accent-blue-dim'
            : 'text-text-muted border-border hover:text-text-primary'
        )}
        title="Case Sensitive"
      >
        Aa
      </button>

      {/* Regex toggle */}
      <button
        onClick={() => setRegex(!regex)}
        className={cn(
          'px-1.5 py-1 text-xs font-mono rounded border transition-colors',
          regex
            ? 'bg-accent-blue-dim text-accent-blue border-accent-blue-dim'
            : 'text-text-muted border-border hover:text-text-primary'
        )}
        title="Regular Expression"
      >
        .*
      </button>

      {/* Prev */}
      <button
        onClick={() => doSearch('prev')}
        className="p-1 text-text-muted hover:text-text-primary transition-colors"
        title="Previous Match (Shift+Enter)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M12 10L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Next */}
      <button
        onClick={() => doSearch('next')}
        className="p-1 text-text-muted hover:text-text-primary transition-colors"
        title="Next Match (Enter)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Close */}
      <button
        onClick={() => {
          searchAddon?.clearDecorations()
          onClose()
        }}
        className="p-1 text-text-muted hover:text-text-primary transition-colors"
        title="Close (Escape)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
