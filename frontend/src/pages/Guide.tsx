import { useState } from 'react'
import { useNavigate } from 'react-router'

interface Section {
  id: string
  icon: React.ReactNode
  title: string
  tagline: string
  steps: string[]
  tips?: string[]
  shortcuts?: { key: string; desc: string }[]
}

const sections: Section[] = [
  {
    id: 'servers',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="7" cy="7" r="1" fill="currentColor" />
        <circle cx="7" cy="17" r="1" fill="currentColor" />
      </svg>
    ),
    title: 'Adding Servers',
    tagline: 'Connect your infrastructure',
    steps: [
      'Click "+ Add Server" in the sidebar footer',
      'Enter name, host/IP, port (default 22), and SSH username',
      'Choose auth: Password or SSH Private Key (PEM format)',
      'Optionally assign a group (e.g., "Production", "Staging")',
      'Save — the server appears in the sidebar immediately',
      'Drag to reorder servers within groups',
    ],
    tips: [
      'All credentials encrypted at rest (AES-256-GCM)',
      'Use Ctrl+K to search servers by name',
      'Groups auto-collapse in the sidebar for organization',
    ],
  },
  {
    id: 'terminal',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 9l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Interactive Terminal',
    tagline: 'Full SSH sessions in the browser',
    steps: [
      'Select a server, then click "Terminal" to open a session',
      'Full xterm.js shell — colors, resize, tab completion all work',
      'Open multiple tabs: Ctrl+T for new, Ctrl+W to close',
      'Switch tabs with Ctrl+1 through Ctrl+9',
      'Search scrollback with Ctrl+F (regex supported)',
      'Selected text auto-copies; right-click to paste',
    ],
    shortcuts: [
      { key: 'Ctrl+T', desc: 'New tab' },
      { key: 'Ctrl+W', desc: 'Close tab' },
      { key: 'Ctrl+1-9', desc: 'Switch tab' },
      { key: 'Ctrl+F', desc: 'Search' },
      { key: 'Ctrl+C', desc: 'Copy / SIGINT' },
    ],
  },
  {
    id: 'commands',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 6h16M4 12h10M4 18h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M19 15l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Quick Commands',
    tagline: 'One-click server operations',
    steps: [
      'Select a server and open its detail panel',
      'Click "Add Command" — give it a name and shell command',
      'Add optional tags for categorization',
      'Click the command card to execute instantly',
      'View output, exit code, and execution duration',
      'Destructive commands trigger a confirmation dialog',
    ],
    tips: [
      'Commands run over SSH on the target — not locally',
      'Green = exit 0 (success), Red = non-zero (failure)',
      'Each execution is logged in the audit trail with your username',
    ],
  },
  {
    id: 'templates',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M7 8h10M7 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 16l2-2 2 2M16 14v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Global Commands & Templates',
    tagline: 'Parameterized commands for any server',
    steps: [
      'Go to Settings → Commands tab',
      'Create commands shared across all servers',
      'Use {{variable}} or {{variable:default}} for parameters',
      'Built-ins auto-resolve: {{hostname}}, {{username}}, {{port}}, {{date}}, {{server_name}}',
      'Mark as template — prompts for values before execution',
      'Drag to reorder; commands appear on every server',
    ],
    tips: [
      'Example: tail -n {{lines:100}} /var/log/{{logfile:syslog}}',
      'Defaults pre-fill in the variable prompt modal',
    ],
  },
  {
    id: 'recordings',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.6" />
      </svg>
    ),
    title: 'Session Recordings',
    tagline: 'Capture and replay terminal sessions',
    steps: [
      'Open a terminal and click the record button (circle icon)',
      'Session captured in asciicast v2 format with timing data',
      'Click stop to save — browse recordings from the sidebar',
      'Player controls: play/pause, speed (0.5x–4x), seek bar',
      'Idle-skip automatically fast-forwards inactivity',
      'Download as .cast for use with asciinema',
    ],
  },
  {
    id: 'metrics',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 20V14h4v6H3zM9 20V8h4v12H9zM15 20V4h4v16h-4z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    ),
    title: 'Metrics & Monitoring',
    tagline: 'Uptime, latency, and usage charts',
    steps: [
      'Open Metrics from the sidebar',
      'View uptime %, connections, exec rates, and latency',
      'Switch time range: 24h, 7d, or 30d',
      'Select any server for live stats (CPU, memory, disk)',
      'Background ping checks status at configurable intervals',
    ],
    tips: [
      'Configure ping interval in Settings → General',
      'All data stored locally in SQLite — no external services',
    ],
  },
  {
    id: 'audit',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 5h16M4 10h12M4 15h14M4 20h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Audit Trail',
    tagline: 'Complete activity history',
    steps: [
      'Navigate to Audit Trail from the sidebar',
      'Commands tab — all executions with user, server, result',
      'Actions tab — creates, updates, deletes, connects, disconnects',
      'Filter by server, text search, exit code, or date range',
      'Expand any row to see full command output',
      'Export filtered results as CSV',
    ],
    tips: [
      'Every entry shows which user performed the action',
      'Terminal connect/disconnect events include the username',
      'CSV export respects active filters',
    ],
  },
  {
    id: 'users',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Users & Permissions',
    tagline: 'Role-based access control',
    steps: [
      'Settings → Users (superadmin only)',
      'Create users with username and password',
      'Roles: superadmin (full) or user (restricted)',
      'Toggle per-user permissions: terminal, commands, servers, recordings, metrics, audit, database',
      'Assign specific servers each user can access',
      'Users change own password in Settings → Security',
    ],
    tips: [
      'First user auto-promoted to superadmin',
      'Regular users only see assigned servers',
      '5 failed logins = 30min lockout (auto-unlock)',
    ],
  },
  {
    id: 'settings',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Settings & Admin',
    tagline: 'Configuration and data management',
    steps: [
      'Gear icon in sidebar → Settings page',
      'General: ping interval, export/import as JSON',
      'Commands: manage global commands and templates',
      'Security: change password, view login attempts',
      'Database (superadmin): browse SQLite tables',
      'Users (superadmin): full user management',
    ],
    tips: [
      'Export creates full JSON backup',
      'Import merges — won\'t delete existing data',
      'Database browser is read-only',
    ],
  },
]

export default function Guide() {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<string | null>(null)

  return (
    <div className="flex flex-col h-screen bg-surface-900">
      {/* Header */}
      <div className="relative flex items-center justify-between px-6 py-4 border-b border-border bg-surface-800 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'repeating-linear-gradient(90deg, currentColor 0px, currentColor 1px, transparent 1px, transparent 20px)',
        }} />
        <div className="flex items-center gap-3 relative">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-700 transition-colors"
            title="Back to Dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary tracking-tight">
              Guide
            </h1>
            <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest">
              shellhub reference manual
            </p>
          </div>
        </div>
        <div className="relative font-mono text-[10px] text-text-muted">
          v1.0 &middot; {sections.length} sections
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Hero */}
          <div className="mb-10 relative">
            <div className="absolute -left-3 top-0 bottom-0 w-px bg-gradient-to-b from-accent-blue via-accent-blue/20 to-transparent" />
            <p className="text-sm text-text-secondary leading-relaxed pl-4 border-l border-border">
              ShellHub is a web-based SSH management tool. Add servers, open terminals, run commands,
              record sessions, monitor uptime — all from the browser. Each section below covers a feature
              with numbered steps and practical tips.
            </p>
          </div>

          {/* Table of contents */}
          <div className="mb-10 grid grid-cols-3 sm:grid-cols-5 gap-2">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveSection(s.id)
                  document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`group flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border transition-all duration-200 ${
                  activeSection === s.id
                    ? 'border-accent-blue/40 bg-accent-blue/5 text-accent-blue'
                    : 'border-border hover:border-accent-blue/20 text-text-muted hover:text-text-secondary'
                }`}
              >
                <span className="transition-transform duration-200 group-hover:scale-110">{s.icon}</span>
                <span className="text-[10px] font-medium text-center leading-tight">{s.title}</span>
              </button>
            ))}
          </div>

          {/* Sections */}
          <div className="space-y-6">
            {sections.map((section, idx) => (
              <div
                key={section.id}
                id={`section-${section.id}`}
                className="group scroll-mt-6"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="relative bg-surface-800 border border-border rounded-xl overflow-hidden transition-all duration-300 hover:border-border-medium">
                  {/* Section number accent */}
                  <div className="absolute top-0 right-0 w-16 h-16 flex items-center justify-center">
                    <span className="font-mono text-[40px] font-bold text-text-dimmed select-none leading-none">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Header */}
                  <div className="px-6 pt-5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-surface-700 border border-border flex items-center justify-center text-accent-blue">
                        {section.icon}
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-text-primary">{section.title}</h2>
                        <p className="text-[11px] text-text-muted font-mono">{section.tagline}</p>
                      </div>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="px-6 pb-5">
                    <div className="space-y-0">
                      {section.steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3 py-2 border-t border-border/50 first:border-t-0">
                          <span className="flex-shrink-0 w-5 h-5 rounded bg-surface-700 text-accent-blue text-[10px] font-mono font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-[13px] text-text-secondary leading-relaxed">{step}</span>
                        </div>
                      ))}
                    </div>

                    {/* Tips & Shortcuts */}
                    {(section.tips || section.shortcuts) && (
                      <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-4">
                        {section.tips && (
                          <div className="flex-1 min-w-[200px]">
                            <h3 className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">
                              <span className="text-accent-green">$</span> tips
                            </h3>
                            <ul className="space-y-1">
                              {section.tips.map((tip, i) => (
                                <li key={i} className="text-[11px] text-text-muted flex items-start gap-2">
                                  <span className="text-accent-green/60 mt-px">&#x25B8;</span>
                                  <span>{tip}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {section.shortcuts && (
                          <div className="flex-1 min-w-[200px]">
                            <h3 className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">
                              <span className="text-accent-amber">&#x2318;</span> shortcuts
                            </h3>
                            <div className="space-y-1">
                              {section.shortcuts.map((s, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <kbd className="inline-flex items-center px-1.5 py-0.5 bg-surface-900 border border-border rounded text-[10px] font-mono text-text-primary min-w-[60px] justify-center">
                                    {s.key}
                                  </kbd>
                                  <span className="text-[11px] text-text-muted">{s.desc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-border text-center">
            <p className="font-mono text-[10px] text-text-muted uppercase tracking-widest">
              end of manual &middot; report issues on github
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
