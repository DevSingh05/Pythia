'use client'

import { useState, useRef, useCallback } from 'react'
import type { OptionQuote } from '@/lib/api'
import { computePnlScenario, type DemoPnlScenario, type DemoPhase } from '@/lib/demoSimulation'

export interface DemoStep {
  phase: DemoPhase
  option?: OptionQuote
  quantity: number
  pnlScenario?: DemoPnlScenario
}

export interface UseDemoModeReturn {
  step: DemoStep
  startDemo: (option: OptionQuote) => void
  reset: () => void
  isActive: boolean
}

const IDLE: DemoStep = { phase: 'idle', quantity: 2 }

export function useDemoMode(): UseDemoModeReturn {
  const [step, setStep] = useState<DemoStep>(IDLE)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const after = (ms: number, fn: () => void) => {
    const id = setTimeout(fn, ms)
    timers.current.push(id)
  }

  const startDemo = useCallback((option: OptionQuote) => {
    clearTimers()
    const quantity = 2

    // Phase 1: selecting — amber pulse on row
    setStep({ phase: 'selecting', option, quantity })

    // Phase 2: filling — order book animates, premium ticks
    after(600, () => setStep({ phase: 'filling', option, quantity }))

    // Phase 3: processing — spinner
    after(600 + 1600, () => setStep({ phase: 'processing', option, quantity }))

    // Phase 4: success — confetti + P&L card + prob pulse
    after(600 + 1600 + 1000, () => {
      const pnlScenario = computePnlScenario(option, quantity)
      setStep({ phase: 'success', option, quantity, pnlScenario })
    })

    // Auto-reset after 8s on success
    after(600 + 1600 + 1000 + 8000, () => setStep(IDLE))
  }, [])

  const reset = useCallback(() => {
    clearTimers()
    setStep(IDLE)
  }, [])

  return {
    step,
    startDemo,
    reset,
    isActive: step.phase !== 'idle',
  }
}
