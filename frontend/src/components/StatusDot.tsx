import { cn } from '../lib/utils'

interface StatusDotProps {
  online: boolean
  size?: 'sm' | 'md'
}

export default function StatusDot({ online, size = 'md' }: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full',
        size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5',
        online
          ? 'bg-accent-green shadow-glow-green animate-pulse-dot'
          : 'bg-accent-red shadow-glow-red'
      )}
    />
  )
}
