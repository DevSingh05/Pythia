'use client'

import { useEffect, useRef, useState } from 'react'
import { tickPremium } from '@/lib/demoSimulation'
import { fmtPremium } from '@/lib/utils'
import type { DemoStep } from '@/hooks/useDemoMode'

interface DemoPremiumTickerProps {
  demoStep: DemoStep
}

export default function DemoPremiumTicker({ demoStep }: DemoPremiumTickerProps) {
  const { phase, option } = demoStep
  const [displayPremium, setDisplayPremium] = useState<number | null>(null)
  const [prevPremium, setPrevPremium] = useState<number | null>(null)
  const tickRef = useRef(0)
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!option) { setDisplayPremium(null); return }
    setDisplayPremium(option.premium)
    tickRef.current = 0
  }, [option?.strike, option?.type, option?.expiry])

  useEffect(() => {
    if (!option) return
    if (rafRef.current) clearInterval(rafRef.current)

    if (phase === 'filling') {
      rafRef.current = setInterval(() => {
        tickRef.current += 1
        const next = tickPremium(option.premium, phase, tickRef.current)
        setDisplayPremium(prev => {
          setPrevPremium(prev)
          return next
        })
      }, 100)
    } else {
      setDisplayPremium(option.premium)
    }

    return () => { if (rafRef.current) clearInterval(rafRef.current) }
  }, [phase, option?.premium])

  if (displayPremium === null || !option) return null

  const up = prevPremium !== null ? displayPremium >= prevPremium : true
  const pctFrac = option.premiumChangePct ?? 0
  const pctDisplay = pctFrac * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Premium
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: '20px',
            fontWeight: 700,
            color: phase === 'filling'
              ? (up ? 'rgb(16,185,129)' : 'rgb(239,68,68)')
              : 'rgba(255,255,255,0.9)',
            transition: 'color 120ms ease-out',
            letterSpacing: '-0.02em',
          }}
        >
          {fmtPremium(displayPremium)}
        </span>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>USDC</span>
      </div>

      {/* 24h change */}
      <div style={{ display: 'flex', gap: 8, fontSize: '11px' }}>
        <span style={{ color: pctDisplay >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)' }}>
          {pctDisplay >= 0 ? '+' : ''}{pctDisplay.toFixed(1)}%
        </span>
        <span style={{ color: 'rgba(255,255,255,0.25)' }}>24h</span>
      </div>

      {/* Filling phase pulse indicator */}
      {phase === 'filling' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgb(245,158,11)',
              animation: 'demo-pulse-dot 0.8s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: '10px', color: 'rgba(245,158,11,0.8)', letterSpacing: '0.06em' }}>
            FILLING
          </span>
        </div>
      )}
    </div>
  )
}
