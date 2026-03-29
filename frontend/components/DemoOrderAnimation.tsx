'use client'

import { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import type { DemoStep } from '@/hooks/useDemoMode'

// Confetti particle
interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  rotationSpeed: number
  opacity: number
}

const COLORS = [
  'rgba(168,85,247,0.9)',
  'rgba(139,92,246,0.9)',
  'rgba(16,185,129,0.9)',
  'rgba(245,158,11,0.9)',
  'rgba(96,165,250,0.9)',
  'rgba(244,114,182,0.9)',
]

function spawnParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * window.innerWidth,
    y: -10,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 3 + 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: Math.random() * 6 + 3,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 8,
    opacity: 1,
  }))
}

interface DemoOrderAnimationProps {
  demoStep: DemoStep
  onClose?: () => void
}

export default function DemoOrderAnimation({ demoStep, onClose }: DemoOrderAnimationProps) {
  const { phase, option, quantity, pnlScenario } = demoStep
  const [particles, setParticles] = useState<Particle[]>([])
  const [visible, setVisible] = useState(false)
  const rafRef = useRef<number | null>(null)
  const mountedRef = useRef(false)

  // Processing spinner
  const isProcessing = phase === 'processing'
  const isSuccess = phase === 'success'

  // Spawn confetti on success
  useEffect(() => {
    if (phase === 'success') {
      setVisible(true)
      setParticles(spawnParticles(80))
    } else if (phase === 'idle') {
      setVisible(false)
      setParticles([])
    }
  }, [phase])

  // Animate confetti
  useEffect(() => {
    if (particles.length === 0) return
    mountedRef.current = true

    const tick = () => {
      if (!mountedRef.current) return
      setParticles(prev => {
        const next = prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.08,
            vx: p.vx * 0.99,
            rotation: p.rotation + p.rotationSpeed,
            opacity: p.y > window.innerHeight * 0.7 ? Math.max(0, p.opacity - 0.04) : p.opacity,
          }))
          .filter(p => p.opacity > 0 && p.y < window.innerHeight + 20)
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      mountedRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [particles.length > 0])

  if (!option) return null
  if (!isProcessing && !isSuccess) return null

  const content = (
    <>
      {/* Confetti canvas */}
      {isSuccess && particles.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998 }}>
          {particles.map(p => (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: p.x,
                top: p.y,
                width: p.size,
                height: p.size,
                background: p.color,
                opacity: p.opacity,
                transform: `rotate(${p.rotation}deg)`,
                borderRadius: p.id % 3 === 0 ? '50%' : '2px',
              }}
            />
          ))}
        </div>
      )}

      {/* Processing spinner overlay */}
      {isProcessing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            {/* Spinner ring */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                border: '3px solid rgba(168,85,247,0.25)',
                borderTopColor: 'rgba(168,85,247,0.9)',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span
              style={{
                fontSize: '13px',
                color: 'rgba(255,255,255,0.6)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Routing order…
            </span>
          </div>
        </div>
      )}

      {/* Success P&L card */}
      {isSuccess && pnlScenario && (
        <div
          style={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            zIndex: 9999,
            width: 300,
            borderRadius: '14px',
            border: '1px solid rgba(16,185,129,0.4)',
            background: 'rgba(9,9,11,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            padding: '18px 20px',
            boxShadow: '0 0 0 1px rgba(16,185,129,0.15), 0 8px 40px rgba(0,0,0,0.6), 0 0 60px rgba(16,185,129,0.08)',
            animation: 'slideUpFade 0.4s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'rgb(16,185,129)',
                    boxShadow: '0 0 8px rgba(16,185,129,0.8)',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'rgb(16,185,129)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Order Filled
                </span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                {quantity}× {option.type === 'call' ? 'Call' : 'Put'} @{option.strike.toFixed(2)} strike
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.35)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: 1,
                  padding: '2px 4px',
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* P&L grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 12 }}>
            <PnlRow label="Total Cost" value={`${pnlScenario.totalCost.toFixed(4)} USDC`} />
            <PnlRow label="Max Loss" value={`${pnlScenario.maxLoss.toFixed(4)}`} negative />
            <PnlRow label="Breakeven" value={`${(pnlScenario.breakeven * 100).toFixed(1)}%`} />
            <PnlRow label="+5pp Delta" value={`+${pnlScenario.gain5pp.toFixed(4)}`} positive />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 10,
              borderTop: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
              DEMO — paper trade only
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'rgba(255,255,255,0.7)',
                fontWeight: 600,
              }}
            >
              Max gain: {pnlScenario.maxGain > 0 ? '+' : ''}{pnlScenario.maxGain.toFixed(4)}
            </span>
          </div>
        </div>
      )}
    </>
  )

  if (typeof document === 'undefined') return null
  return ReactDOM.createPortal(content, document.body)
}

function PnlRow({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: 'ui-monospace, monospace',
          color: positive
            ? 'rgb(16,185,129)'
            : negative
              ? 'rgb(239,68,68)'
              : 'rgba(255,255,255,0.8)',
        }}
      >
        {value}
      </div>
    </div>
  )
}
