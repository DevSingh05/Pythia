'use client'

import { useEffect, useRef, useState } from 'react'
import { generateOrderBook, tickOrderBook, type OrderBook } from '@/lib/demoSimulation'
import { fmtPremium } from '@/lib/utils'
import type { DemoStep } from '@/hooks/useDemoMode'

interface DemoOrderBookProps {
  demoStep: DemoStep
}

export default function DemoOrderBook({ demoStep }: DemoOrderBookProps) {
  const { phase, option } = demoStep
  const [book, setBook] = useState<OrderBook | null>(null)
  const tickRef = useRef(0)
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Generate book when option is set
  useEffect(() => {
    if (!option) { setBook(null); return }
    setBook(generateOrderBook(option, 0))
    tickRef.current = 0
  }, [option?.strike, option?.type, option?.expiry])

  // Tick the book
  useEffect(() => {
    if (!book || phase === 'idle' || phase === 'processing') return
    if (rafRef.current) clearInterval(rafRef.current)
    rafRef.current = setInterval(() => {
      tickRef.current += 1
      setBook(prev => prev ? tickOrderBook(prev, phase, tickRef.current) : prev)
    }, 120)
    return () => { if (rafRef.current) clearInterval(rafRef.current) }
  }, [phase, !!book])

  if (!book || !option) return null

  const maxDepth = Math.max(
    book.bids[book.bids.length - 1]?.depth ?? 1,
    book.asks[book.asks.length - 1]?.depth ?? 1,
  )

  return (
    <div
      style={{
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.35)',
        overflow: 'hidden',
        fontSize: '11px',
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          padding: '6px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.35)',
          fontSize: '10px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <span>Bids</span>
        <span style={{ textAlign: 'right' }}>Asks</span>
      </div>

      {/* Levels */}
      <div style={{ padding: '4px 0' }}>
        {Array.from({ length: book.bids.length }).map((_, i) => {
          const bid = book.bids[i]
          const ask = book.asks[i]
          const bidPct = ((bid?.depth ?? 0) / maxDepth) * 100
          const askPct = ((ask?.depth ?? 0) / maxDepth) * 100
          const isFilling = phase === 'filling'

          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '2px 0',
                position: 'relative',
              }}
            >
              {/* Bid side */}
              <div style={{ position: 'relative', padding: '2px 10px' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    right: 0,
                    background: 'rgba(16,185,129,0.12)',
                    width: `${bidPct}%`,
                    transition: 'width 150ms ease-out',
                    transformOrigin: 'left',
                  }}
                />
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ color: 'rgba(16,185,129,0.9)' }}>{fmtPremium(bid?.price ?? 0)}</span>
                  <span style={{ color: 'rgba(255,255,255,0.45)' }}>{bid?.size}</span>
                </div>
              </div>

              {/* Ask side */}
              <div style={{ position: 'relative', padding: '2px 10px' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    left: 0,
                    background: isFilling
                      ? 'rgba(245,158,11,0.18)'
                      : 'rgba(239,68,68,0.10)',
                    width: `${askPct}%`,
                    transition: `width ${isFilling ? 200 + i * 80 : 150}ms ease-out`,
                    transitionDelay: isFilling ? `${i * 40}ms` : '0ms',
                    transformOrigin: 'right',
                  }}
                />
                {/* Amber sweep highlight during filling */}
                {isFilling && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(90deg, transparent 60%, rgba(245,158,11,0.25) 100%)',
                      animation: `sweepRight 0.6s ease-out ${i * 60}ms both`,
                      pointerEvents: 'none',
                    }}
                  />
                )}
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ color: isFilling ? 'rgba(245,158,11,0.9)' : 'rgba(239,68,68,0.85)', transition: 'color 200ms' }}>
                    {ask?.price.toFixed(3)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.45)' }}>{ask?.size}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Spread row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '4px 10px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.3)',
          fontSize: '10px',
          gap: 6,
        }}
      >
        <span>spread</span>
        <span style={{ color: 'rgba(255,255,255,0.55)' }}>{fmtPremium(book.spread)}</span>
        <span style={{ marginLeft: 8 }}>mid</span>
        <span style={{ color: 'rgba(255,255,255,0.55)' }}>{fmtPremium(book.midpoint)}</span>
      </div>
    </div>
  )
}
