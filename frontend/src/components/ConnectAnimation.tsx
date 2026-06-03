import { useState, useEffect } from 'react'
import { cn } from '../lib/utils'

interface ConnectAnimationProps {
  serverName: string
  serverHost: string
  onComplete?: () => void
}

const STAGES = [
  'Resolving host...',
  'TCP connection established',
  'SSH handshake...',
  'Key exchange: curve25519-sha256',
  'Authentication successful',
  'Opening channel...',
]

export default function ConnectAnimation({ serverName, serverHost, onComplete }: ConnectAnimationProps) {
  const [currentStage, setCurrentStage] = useState(0)
  const [completedStages, setCompletedStages] = useState<number[]>([])
  const [fadingOut, setFadingOut] = useState(false)

  useEffect(() => {
    if (currentStage >= STAGES.length) {
      const timeout = setTimeout(() => {
        setFadingOut(true)
        setTimeout(() => {
          onComplete?.()
        }, 300)
      }, 300)
      return () => clearTimeout(timeout)
    }

    const timeout = setTimeout(() => {
      setCompletedStages(prev => [...prev, currentStage])
      setCurrentStage(prev => prev + 1)
    }, 500)

    return () => clearTimeout(timeout)
  }, [currentStage, onComplete])

  const getStageLabel = (index: number) => {
    if (index === 0 && completedStages.includes(0)) {
      return `Resolving host... ${serverHost}`
    }
    return STAGES[index]
  }

  return (
    <div
      className={cn(
        'absolute inset-0 bg-surface-900 flex items-center justify-center z-50 transition-opacity duration-300',
        fadingOut ? 'opacity-0' : 'opacity-100'
      )}
    >
      <div className="flex flex-col items-start gap-2 max-w-md w-full px-8">
        <p className="text-sm font-semibold text-text-primary mb-4">
          {serverName}
        </p>

        {STAGES.map((_, index) => {
          if (index > currentStage) return null

          const isCompleted = completedStages.includes(index)
          const isActive = index === currentStage && !isCompleted

          return (
            <div key={index} className="flex items-center gap-2 font-mono text-xs">
              {isCompleted ? (
                <span className="text-accent-green w-4 text-center">&#10003;</span>
              ) : (
                <span className="w-4 text-center">
                  <svg
                    className="w-3 h-3 animate-spin text-accent-blue inline-block"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray="50 20"
                    />
                  </svg>
                </span>
              )}
              <span className={cn(
                isCompleted ? 'text-text-muted' : 'text-text-primary'
              )}>
                {getStageLabel(index)}
                {isActive && <span className="animate-pulse text-accent-blue">&#9608;</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
