'use client'

import { useEffect, useRef } from 'react'
import { cn, fmtProb } from '@/lib/utils'

interface ProbabilityGaugeProps {
  probability: number  // 0–1
  change24h?: number   // pp change
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
  className?: string
}

const SIZES = {
  sm: { r: 44, stroke: 8, fontSize: 'text-xl', labelSize: 'text-xs' },
  md: { r: 68, stroke: 10, fontSize: 'text-3xl', labelSize: 'text-sm' },
  lg: { r: 90, stroke: 12, fontSize: 'text-5xl', labelSize: 'text-base' },
}

export default function ProbabilityGauge({
  probability,
  change24h,
  size = 'lg',
  animated = true,
  className,
}: ProbabilityGaugeProps) {
  const { r, stroke, fontSize, labelSize } = SIZES[size]
  const center = r + stroke + 4
  const svgSize = center * 2

  // Semi-circle: angle from 180° to 0° (left to right at bottom)
  // We use a 240° arc for better visual
  const startAngle = -210  // degrees (bottom-left)
  const endAngle = 30      // degrees (bottom-right)
  const totalAngle = endAngle - startAngle  // 240°

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const getCoords = (deg: number) => ({
    x: center + r * Math.cos(toRad(deg)),
    y: center + r * Math.sin(toRad(deg)),
  })

  const trackStart = getCoords(startAngle)
  const trackEnd = getCoords(endAngle)
  const trackPath = [
    `M ${trackStart.x} ${trackStart.y}`,
    `A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}`,
  ].join(' ')

  // Fill arc
  const fillAngle = startAngle + totalAngle * probability
  const fillEnd = getCoords(fillAngle)
  const largeArc = totalAngle * probability > 180 ? 1 : 0
  const fillPath = probability > 0.001 ? [
    `M ${trackStart.x} ${trackStart.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}`,
  ].join(' ') : ''

  // Color based on probability
  const color = probability > 0.6 ? '#22c55e' : probability < 0.4 ? '#ef4444' : '#2dd4bf'

  const isUp = (change24h ?? 0) >= 0

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: svgSize, height: svgSize * 0.7 }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          style={{ overflow: 'visible' }}
        >
          {/* Tick marks */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const angle = startAngle + totalAngle * frac
            const inner = getCoords(angle)
            const outerR = r + stroke / 2 + 6
            const outerX = center + outerR * Math.cos(toRad(angle))
            const outerY = center + outerR * Math.sin(toRad(angle))
            return (
              <line
                key={frac}
                x1={inner.x}
                y1={inner.y}
                x2={outerX}
                y2={outerY}
                stroke="#2a2a3d"
                strokeWidth={2}
              />
            )
          })}

          {/* Track */}
          <path
            d={trackPath}
            fill="none"
            stroke="#2a2a3d"
            strokeWidth={stroke}
            strokeLinecap="round"
          />

          {/* Glow layer */}
          {fillPath && (
            <path
              d={fillPath}
              fill="none"
              stroke={color}
              strokeWidth={stroke + 6}
              strokeLinecap="round"
              opacity={0.15}
              style={animated ? { transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' } : {}}
            />
          )}

          {/* Fill arc */}
          {fillPath && (
            <path
              d={fillPath}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              style={animated ? { transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)' } : {}}
            />
          )}

          {/* Current indicator dot */}
          {probability > 0.01 && (
            <>
              <circle
                cx={fillEnd.x}
                cy={fillEnd.y}
                r={stroke / 2 + 3}
                fill={color}
                opacity={0.3}
                className={animated ? 'gauge-pulse' : ''}
              />
              <circle
                cx={fillEnd.x}
                cy={fillEnd.y}
                r={stroke / 2}
                fill={color}
              />
            </>
          )}

          {/* Percentage labels */}
          {[
            { frac: 0, label: '0%' },
            { frac: 0.5, label: '50%' },
            { frac: 1, label: '100%' },
          ].map(({ frac, label }) => {
            const angle = startAngle + totalAngle * frac
            const lr = r + stroke + 18
            const x = center + lr * Math.cos(toRad(angle))
            const y = center + lr * Math.sin(toRad(angle))
            return (
              <text
                key={frac}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fill="#64748b"
                fontFamily="JetBrains Mono, monospace"
              >
                {label}
              </text>
            )
          })}
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: '20%' }}>
          <span
            className={cn('font-bold font-mono tabular-nums leading-none', fontSize)}
            style={{ color }}
          >
            {fmtProb(probability, 1)}
          </span>
          <span className="text-xs text-muted mt-0.5">YES</span>
          {change24h !== undefined && (
            <span className={cn('text-xs font-mono mt-1', isUp ? 'text-green' : 'text-red')}>
              {isUp ? '+' : ''}{(change24h * 100).toFixed(1)}pp today
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
