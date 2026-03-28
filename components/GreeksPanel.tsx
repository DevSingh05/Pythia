'use client'

import { cn } from '@/lib/utils'
import { OptionQuote } from '@/lib/api'
import { Info } from 'lucide-react'
import { useState } from 'react'

interface GreeksPanelProps {
  option: OptionQuote
  currentProb: number
  className?: string
}

interface GreekDef {
  symbol: string
  name: string
  value: number
  unit: string
  description: string
  format: (v: number) => string
  range?: [number, number]
}

function GreekBar({ value, range }: { value: number; range?: [number, number] }) {
  if (!range) return null
  const [min, max] = range
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const isNegative = value < 0
  return (
    <div className="h-1 bg-border rounded-full overflow-hidden mt-1">
      <div
        className={cn('h-full rounded-full transition-all duration-500', isNegative ? 'bg-red/60' : 'bg-accent/60')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function GreeksPanel({ option, currentProb, className }: GreeksPanelProps) {
  const [tooltip, setTooltip] = useState<string | null>(null)

  const greeks: GreekDef[] = [
    {
      symbol: 'Δ',
      name: 'Delta',
      value: option.delta,
      unit: 'per 1pp',
      description: 'Change in option premium per 1 percentage-point move in YES probability. Uses logit Jacobian: φ(d)/(σ√τ·p₀(1-p₀)).',
      format: v => v.toFixed(4),
      range: [0, 0.5],
    },
    {
      symbol: 'Γ',
      name: 'Gamma',
      value: option.gamma,
      unit: 'Δ per 1pp',
      description: 'Rate of change of Delta per 1pp move. High near ATM, low deep ITM/OTM.',
      format: v => v.toFixed(5),
      range: [0, 0.02],
    },
    {
      symbol: 'Θ',
      name: 'Theta',
      value: option.theta,
      unit: 'per day',
      description: 'Time decay per calendar day. Accelerates dramatically near expiry — prediction markets get violently binary.',
      format: v => v.toFixed(5),
      range: [-0.01, 0],
    },
    {
      symbol: 'ν',
      name: 'Vega',
      value: option.vega,
      unit: 'per 1% vol',
      description: 'Sensitivity to implied volatility. Flips sign at the strike — negative deep ITM, positive OTM. News events amplify this.',
      format: v => v.toFixed(4),
      range: [-0.1, 0.1],
    },
  ]

  return (
    <div className={cn('rounded-xl bg-card border border-border p-4 space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Greeks</h3>
        <div className="text-xs text-muted font-mono">
          K={Math.round(option.strike * 100)}% | IV={Math.round(option.impliedVol * 100)}%
        </div>
      </div>

      {/* IV vs HV indicator */}
      <div className="flex items-center gap-2 text-xs">
        <div className="flex-1 space-y-0.5">
          <div className="flex justify-between text-muted">
            <span>Implied Vol</span>
            <span className="text-accent font-mono">{(option.impliedVol * 100).toFixed(1)}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-accent/60 rounded-full" style={{ width: `${Math.min(100, option.impliedVol * 50)}%` }} />
          </div>
        </div>
      </div>

      {/* Greek rows */}
      <div className="space-y-3">
        {greeks.map(greek => (
          <div key={greek.symbol} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-5 text-center font-mono text-sm text-accent">{greek.symbol}</span>
              <span className="text-xs text-muted">{greek.name}</span>
              <button
                className="ml-auto text-muted/50 hover:text-muted transition-colors"
                onMouseEnter={() => setTooltip(greek.symbol)}
                onMouseLeave={() => setTooltip(null)}
              >
                <Info className="w-3 h-3" />
              </button>
            </div>

            {tooltip === greek.symbol && (
              <div className="text-[10px] text-muted bg-surface rounded-md px-2 py-1.5 border border-border leading-relaxed">
                {greek.description}
              </div>
            )}

            <div className="flex items-center justify-between pl-7">
              <span className={cn(
                'text-sm font-mono font-medium tabular-nums',
                greek.value > 0 ? 'text-slate-200' : 'text-red'
              )}>
                {greek.format(greek.value)}
              </span>
              <span className="text-[10px] text-muted">{greek.unit}</span>
            </div>

            <div className="pl-7">
              <GreekBar value={greek.value} range={greek.range} />
            </div>
          </div>
        ))}
      </div>

      {/* Logit model attribution */}
      <div className="text-[10px] text-muted/50 pt-1 border-t border-border/50">
        Logit-Normal model · dL = σdW where L = ln(p/1-p)
      </div>
    </div>
  )
}
