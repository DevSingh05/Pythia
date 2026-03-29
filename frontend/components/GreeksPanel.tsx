'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { OptionQuote } from '@/lib/api'
import { Info } from 'lucide-react'

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
  tip: string
  normalise: (v: number) => number
  positive?: boolean
}

export default function GreeksPanel({ option, currentProb, className }: GreeksPanelProps) {
  const [openTip, setOpenTip] = useState<string | null>(null)

  const greeks: GreekDef[] = [
    {
      symbol: 'Δ',
      name: 'Delta',
      value: option.delta,
      unit: 'per 1pp',
      tip: 'Change in option value per 1 percentage-point move in YES probability. Ranges 0→0.5 for calls near ATM.',
      normalise: v => Math.min(1, Math.abs(v) / 0.5),
      positive: option.type === 'call' ? true : undefined,
    },
    {
      symbol: 'Γ',
      name: 'Gamma',
      value: option.gamma,
      unit: 'Δ/pp',
      tip: 'Change in delta per 1 percentage-point move in probability. Peaks at-the-money, tapers to near zero deep ITM/OTM.',
      normalise: v => Math.min(1, Math.abs(v) / 0.12),
      positive: true,
    },
    {
      symbol: 'Θ',
      name: 'Theta',
      value: option.theta,
      unit: '$/day',
      tip: 'Dollar decay per calendar day. Always negative for long options — you lose this much premium each day.',
      normalise: v => Math.min(1, Math.abs(v) / 0.003),
      positive: false,
    },
    {
      symbol: 'ν',
      name: 'Vega',
      value: option.vega,
      unit: 'per 1% σ',
      tip: 'Dollar sensitivity to a 1 percentage-point move in implied volatility. Peaks ATM, minimal deep ITM/OTM.',
      normalise: v => Math.min(1, Math.abs(v) / 0.008),
    },
  ]

  const fmtVal = (g: GreekDef) => {
    const abs = Math.abs(g.value)
    if (abs === 0) return '0.0000'
    if (abs < 0.0001) return g.value.toExponential(2)
    return g.value.toFixed(4)
  }

  return (
    <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">The Greeks</span>
        <span className="text-[11px] font-mono text-zinc-500">
          K={Math.round(option.strike * 100)}% · IV={Math.round(option.impliedVol * 100)}%
        </span>
      </div>

      <div className="p-4 space-y-3">
        {greeks.map(g => {
          const barFill = g.normalise(g.value)
          const isPos = g.positive !== undefined ? g.positive : g.value >= 0
          const barColor = isPos ? 'bg-emerald-500/60' : 'bg-red-500/60'
          const valColor = isPos ? 'text-emerald-400' : 'text-red-400'

          return (
            <div key={g.symbol} className="space-y-1">
              <div className="flex items-center gap-2">
                {/* Symbol */}
                <span className="w-5 text-center font-mono text-sm text-blue-400 shrink-0 font-bold">{g.symbol}</span>

                {/* Name */}
                <span className="text-xs text-zinc-500 w-12 shrink-0">{g.name}</span>

                {/* Bar */}
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500 ease-out', barColor)}
                    style={{ width: `${barFill * 100}%` }}
                  />
                </div>

                {/* Value */}
                <span className={cn('text-xs font-mono tabular-nums w-16 text-right shrink-0 font-medium', valColor)}>
                  {fmtVal(g)}
                </span>
                <span className="text-[10px] text-zinc-600 w-14 shrink-0">{g.unit}</span>

                {/* Info toggle */}
                <button
                  className="text-zinc-700 hover:text-zinc-400 transition-colors shrink-0"
                  onClick={() => setOpenTip(openTip === g.symbol ? null : g.symbol)}
                >
                  <Info className="w-3 h-3" />
                </button>
              </div>

              {/* Tooltip */}
              {openTip === g.symbol && (
                <div className="ml-7 text-[11px] text-zinc-500 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-3 py-2 leading-relaxed">
                  {g.tip}
                </div>
              )}
            </div>
          )
        })}

        {/* IV bar */}
        <div className="pt-3 border-t border-zinc-800/60 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">Implied Vol</span>
            <span className="font-mono text-blue-400 font-medium">{(option.impliedVol * 100).toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500/50 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, option.impliedVol * 67)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
