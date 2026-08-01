import { cn } from '../lib/utils'

export interface TabInfo {
  id: string
  serverId: number
  serverName: string
  connected: boolean
  recording: boolean
}

interface TabBarProps {
  tabs: TabInfo[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
}

export default function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: TabBarProps) {
  return (
    <div className="flex items-center bg-surface-800 border-b border-border px-1 min-h-[36px]">
      {tabs.map((tab, idx) => (
        <div
          key={tab.id}
          onClick={() => onSelectTab(tab.id)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer border-r border-border transition-colors max-w-[180px] group',
            tab.id === activeTabId
              ? 'bg-surface-900 text-text-primary'
              : 'bg-surface-800 text-text-muted hover:bg-surface-700 hover:text-text-secondary'
          )}
        >
          {/* Status dot */}
          <span
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              tab.connected ? 'bg-accent-green' : 'bg-accent-red'
            )}
          />

          {/* Recording indicator */}
          {tab.recording && (
            <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse flex-shrink-0" />
          )}

          {/* Tab name */}
          <span className="truncate font-medium">
            {tab.serverName}
          </span>

          {/* Keyboard shortcut hint */}
          {idx < 9 && tab.id === activeTabId && (
            <span className="text-[10px] text-text-dimmed ml-auto flex-shrink-0">
              {idx + 1}
            </span>
          )}

          {/* Close button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCloseTab(tab.id)
            }}
            className="ml-1 p-0.5 rounded text-text-dimmed hover:text-text-primary hover:bg-surface-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            title="Close tab"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}

      {/* New tab button */}
      <button
        onClick={onNewTab}
        className="flex items-center justify-center w-7 h-7 ml-1 text-text-muted hover:text-text-primary hover:bg-surface-700 rounded transition-colors"
        title="New tab (Ctrl+T)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
