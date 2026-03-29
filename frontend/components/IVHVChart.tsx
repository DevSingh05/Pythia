'use client'

import { cn } from '@/lib/utils'

interface IVHVChartProps {
  impliedVol: number
  historicalVol: number
  className?: string
}

export default function IVHVChart({ impliedVol, historicalVol, className }: IVHVChartProps) {
  const iv = Number.isFinite(impliedVol) ? impliedVol : 0
  const hv = Number.isFinite(historicalVol) ? historicalVol : 0
  const max = Math.max(iv, hv, 0.01)
  const ivPct = Math.min(100, (iv / max) * 100)
  const hvPct = Math.min(100, (hv / max) * 100)
  const ratio = hv > 0 ? iv / hv : null
  let signal: { text: string; tone: 'amber' | 'emerald' | 'zinc' }
  if (ratio == null || !Number.isFinite(ratio)) {
    signal = { text: 'Insufficient HV data', tone: 'zinc' }
  } else if (ratio > 1.15) {
    signal = { text: 'Options look expensive vs recent vol', tone: 'amber' }
  } else if (ratio < 0.85) {
    signal = { text: 'Options look cheap vs recent vol', tone: 'emerald' }
  } else {
    signal = { text: 'IV roughly in line with HV', tone: 'zinc' }
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className={cn(
          'rounded-lg border px-3 py-2 text-xs font-medium',
          signal.tone === 'amber' && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
          signal.tone === 'emerald' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
          signal.tone === 'zinc' && 'border-zinc-700 bg-zinc-900/50 text-zinc-400',
        )}
      >
        {ratio != null && (
          <span className="font-mono text-[10px] text-zinc-500 block mb-1">
            IV/HV ratio: {ratio.toFixed(2)}×
          </span>
        )}
        {signal.text}
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
            <span>Implied vol (chain)</span>
            <span className="font-mono text-violet-300">{(iv * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500/80 transition-all"
              style={{ width: `${ivPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
            <span>Historical vol</span>
            <span className="font-mono text-cyan-400/90">{(hv * 100).toFixed(1)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-cyan-500/70 transition-all"
              style={{ width: `${hvPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
