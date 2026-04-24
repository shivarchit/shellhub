/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 900: '#06090f', 800: '#0b1120', 700: '#111827', 600: '#1a2332', 500: '#1e2d3f' },
        border: { DEFAULT: '#1c2a3a', medium: '#253345' },
        accent: {
          green: '#22c55e', 'green-dim': '#064e3b', 'green-bg': '#052e16',
          red: '#ef4444', 'red-dim': '#7f1d1d', 'red-bg': '#450a0a',
          amber: '#f59e0b', 'amber-dim': '#451a03', 'amber-bg': '#271704',
          blue: '#3b82f6', 'blue-dim': '#1d3f7a',
        },
        text: { primary: '#e8edf5', secondary: '#8b97a8', muted: '#4f5d6e', dimmed: '#2d3848' },
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
