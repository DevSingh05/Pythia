'use client'

import { payoffCurve, expiryBreakevenProb } from '@/lib/pricing'
import { OptionQuote } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PayoffChartProps {
  option: OptionQuote
  side: 'buy' | 'sell'
  quantity: number
  currentProb: number
  className?: string
}

/** Signed USDC (same scale as premium / payoff P&L). */
export function fmtCents(v: number) {
  const abs = Math.abs(v)
  const sign = v >= 0 ? '+' : '-'
  if (!Number.isFinite(abs) || abs === 0) return `${sign}$0.00`
  if (abs >= 0.01) return `${sign}$${abs.toFixed(2)}`
  return `${sign}$${abs.toFixed(4)}`
}

export function computePayoffMetrics(option: OptionQuote, side: 'buy' | 'sell', quantity: number) {
  const data = payoffCurve(option.type, option.strike, option.premium, quantity, side)
  const pnlValues = data.map(d => d.pnl)
  const maxPnl = Math.max(...pnlValues)
  const minPnl = Math.min(...pnlValues)
  const beAnalytic = expiryBreakevenProb(option.type, option.strike, option.premium, side)
  const beFallback = data.reduce((best, d) => Math.abs(d.pnl) < Math.abs(best.pnl) ? d : best).prob
  const breakevenProb = beAnalytic ?? beFallback
  const atYes = data[data.length - 1]?.pnl ?? 0
  const atNo  = data[0]?.pnl ?? 0
  return { maxPnl, minPnl, breakevenProb, beAnalytic, atYes, atNo }
}

export default function PayoffChart({ option, side, quantity, currentProb, className }: PayoffChartProps) {
  const { breakevenProb, beAnalytic, atYes, atNo } = computePayoffMetrics(option, side, quantity)

  // What % of the bar is the loss zone (0 → breakeven)
  const beWidth = Math.round((breakevenProb ?? 0.5) * 100)

  // Current prob marker position on the bar
  const nowPct = Math.round(currentProb * 100)

  // Is current prob already in profit zone?
  const inProfit = currentProb >= (breakevenProb ?? 0.5)

  return (
    <div className={cn('space-y-3', className)}>

      {/* ── Split outcome cards ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Loss side — NO resolves */}
        <div className="rounded-xl bg-red-500/[0.07] border border-red-500/25 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/70" />
            <span className="text-[10px] text-red-400/70 uppercase tracking-widest font-medium">If NO</span>
          </div>
          <div className="text-2xl font-mono font-bold text-red-400 tabular-nums">
            {fmtCents(atNo)}
          </div>
          <div className="text-[10px] text-zinc-600">market resolves NO (0%)</div>
        </div>

        {/* Profit side — YES resolves */}
        <div className="rounded-xl bg-emerald-500/[0.07] border border-emerald-500/25 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500/70" />
            <span className="text-[10px] text-emerald-400/70 uppercase tracking-widest font-medium">If YES</span>
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">
            {fmtCents(atYes)}
          </div>
          <div className="text-[10px] text-zinc-600">market resolves YES (100%)</div>
        </div>
      </div>

      {/* ── Probability bar ── */}
      <div className="space-y-2">
        {/* Bar */}
        <div className="relative h-5 rounded-full overflow-hidden flex">
          {/* Loss zone */}
          <div
            className="h-full bg-red-500/30 border-r border-red-500/50 flex items-center justify-center"
            style={{ width: `${beWidth}%` }}
          />
          {/* Profit zone */}
          <div
            className="h-full bg-emerald-500/30 flex items-center justify-center flex-1"
          />

          {/* Current prob marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-400"
            style={{ left: `${nowPct}%` }}
          />

          {/* Breakeven divider label */}
          {beAnalytic != null && (
            <div
              className="absolute top-0 bottom-0 flex items-center"
              style={{ left: `${beWidth}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-0.5 h-full bg-zinc-400/50" />
            </div>
          )}
        </div>

        {/* Labels below bar */}
        <div className="flex items-start justify-between text-[10px] font-mono text-zinc-500 px-0.5 relative">
          <span className="text-red-400/70">0% → loss</span>

          {/* Breakeven label — centered */}
          {beAnalytic != null && (
            <span
              className="absolute text-amber-400 font-semibold"
              style={{ left: `${beWidth}%`, transform: 'translateX(-50%)' }}
            >
              BE {(breakevenProb * 100).toFixed(1)}%
            </span>
          )}

          <span className="text-emerald-400/70">profit → 100%</span>
        </div>

        {/* Current prob indicator */}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <div className="w-2 h-0.5 bg-blue-400" />
          <span>
            Market now at <span className={cn('font-mono font-semibold', inProfit ? 'text-emerald-400' : 'text-red-400')}>
              {(currentProb * 100).toFixed(1)}%
            </span>
            {' '}— currently in <span className={inProfit ? 'text-emerald-400' : 'text-red-400'}>
              {inProfit ? 'profit zone' : 'loss zone'}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
