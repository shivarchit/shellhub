/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: 'rgb(var(--sh-surface-900) / <alpha-value>)',
          800: 'rgb(var(--sh-surface-800) / <alpha-value>)',
          700: 'rgb(var(--sh-surface-700) / <alpha-value>)',
          600: 'rgb(var(--sh-surface-600) / <alpha-value>)',
          500: 'rgb(var(--sh-surface-500) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--sh-border) / <alpha-value>)',
          medium: 'rgb(var(--sh-border-medium) / <alpha-value>)',
        },
        accent: {
          green: 'rgb(var(--sh-accent-green) / <alpha-value>)',
          'green-dim': 'rgb(var(--sh-accent-green-dim) / <alpha-value>)',
          'green-bg': 'rgb(var(--sh-accent-green-bg) / <alpha-value>)',
          red: 'rgb(var(--sh-accent-red) / <alpha-value>)',
          'red-dim': 'rgb(var(--sh-accent-red-dim) / <alpha-value>)',
          'red-bg': 'rgb(var(--sh-accent-red-bg) / <alpha-value>)',
          amber: 'rgb(var(--sh-accent-amber) / <alpha-value>)',
          'amber-dim': 'rgb(var(--sh-accent-amber-dim) / <alpha-value>)',
          'amber-bg': 'rgb(var(--sh-accent-amber-bg) / <alpha-value>)',
          blue: 'rgb(var(--sh-accent-blue) / <alpha-value>)',
          'blue-dim': 'rgb(var(--sh-accent-blue-dim) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--sh-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--sh-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--sh-text-muted) / <alpha-value>)',
          dimmed: 'rgb(var(--sh-text-dimmed) / <alpha-value>)',
        },
        // Foreground for anything sitting on an accent fill (buttons, badges).
        'on-accent': 'rgb(var(--sh-on-accent) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 15px rgba(34, 197, 94, 0.25)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.25)',
        'glow-amber': '0 0 15px rgba(245, 158, 11, 0.25)',
        'glow-blue': '0 0 15px rgba(59, 130, 246, 0.25)',
      },
    },
  },
  plugins: [],
}
