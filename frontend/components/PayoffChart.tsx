'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { payoffCurve, expiryBreakevenProb } from '@/lib/pricing'
import { OptionQuote } from '@/lib/api'
import { cn } from '@/lib/utils'

interface PayoffChartProps {
  option: OptionQuote
  side: 'buy' | 'sell'
  quantity: number
  currentProb: number
  /** Multiplier applied to dollar display values (default 1). Pass 1000 for lot-scaled display. */
  lotSize?: number
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

/** Datum for the Recharts AreaChart */
interface ChartPoint {
  /** Probability 0–100 */
  prob: number
  /** Scaled P&L in dollars */
  pnl: number
  /** Positive portion (for green area) */
  profit: number | null
  /** Negative portion (for red area) */
  loss: number | null
}

export default function PayoffChart({
  option, side, quantity, currentProb, lotSize = 1, className,
}: PayoffChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // Build chart data from the payoff curve
  const { chartData, breakeven, maxPnl, minPnl, currentPnl } = useMemo(() => {
    const raw = payoffCurve(option.type, option.strike, option.premium, quantity, side)
    const be = expiryBreakevenProb(option.type, option.strike, option.premium, side)

    // Scale: smaller |value| = premium component (×lotSize), larger = payoff (×lotSize/10)
    // Uniform scale so the chart shape is correct and consistent
    const scale = lotSize

    const data: ChartPoint[] = raw.map(pt => {
      const pnl = pt.pnl * scale
      return {
        prob: Math.round(pt.prob * 100),
        pnl,
        profit: pnl >= 0 ? pnl : null,
        loss: pnl < 0 ? pnl : null,
      }
    })

    // Find P&L at current probability
    const probIdx = Math.min(100, Math.max(0, Math.round(currentProb * 100)))
    const curPnl = data[probIdx]?.pnl ?? 0

    const pnlValues = data.map(d => d.pnl)
    return {
      chartData: data,
      breakeven: be != null ? Math.round(be * 100) : null,
      maxPnl: Math.max(...pnlValues),
      minPnl: Math.min(...pnlValues),
      currentPnl: curPnl,
    }
  }, [option, side, quantity, currentProb, lotSize])

  // Determine hovered or current point for the display header
  const displayProb = hoverIdx != null ? hoverIdx : Math.round(currentProb * 100)
  const displayPnl = chartData[displayProb]?.pnl ?? currentPnl
  const isProfit = displayPnl >= 0

  // Y-axis domain with padding
  const yPad = Math.max(Math.abs(maxPnl), Math.abs(minPnl)) * 0.15
  const yMin = Math.min(minPnl - yPad, -1)
  const yMax = Math.max(maxPnl + yPad, 1)

  // Where y=0 falls in the gradient (0=top, 1=bottom of chart area)
  const zeroOffset = yMax / (yMax - yMin)

  const handleMouseMove = useCallback((state: any) => {
    if (state?.activePayload?.[0]?.payload) {
      setHoverIdx(state.activePayload[0].payload.prob)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoverIdx(null)
  }, [])

  const nowPct = Math.round(currentProb * 100)

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header: Expected P&L at hover or current */}
      <div className="text-center space-y-0.5 pb-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
          {hoverIdx != null ? `P&L at ${displayProb}%` : 'Expected Profit & Loss'}
        </div>
        <div className={cn(
          'text-2xl font-mono font-bold tabular-nums',
          isProfit ? 'text-emerald-400' : 'text-red-400'
        )}>
          {fmtCents(displayPnl)}
        </div>
        {hoverIdx == null && (
          <div className="text-[10px] text-zinc-600">
            at current market {nowPct}%
          </div>
        )}
      </div>

      {/* The chart */}
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              {/* Split gradient: green above y=0, red below y=0 */}
              <linearGradient id="splitFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#10b981" stopOpacity={0.08} />
                <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#ef4444" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.35} />
              </linearGradient>
              <linearGradient id="splitStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#10b981" />
                <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#ef4444" />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(113,113,122,0.15)"
              vertical={false}
            />

            <XAxis
              dataKey="prob"
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#3f3f46' }}
              tickLine={false}
            />

            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v: number) => {
                const abs = Math.abs(v)
                if (abs >= 1000) return `${v < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`
                return `${v < 0 ? '-' : ''}$${abs.toFixed(0)}`
              }}
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />

            {/* Zero line */}
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 2" strokeWidth={1} />

            {/* Breakeven vertical */}
            {breakeven != null && (
              <ReferenceLine
                x={breakeven}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: `BE ${breakeven}%`,
                  position: 'top',
                  fill: '#f59e0b',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}

            {/* Current prob vertical */}
            <ReferenceLine
              x={nowPct}
              stroke="#60a5fa"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />

            {/* P&L area: green fill above zero, red fill below zero */}
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="url(#splitStroke)"
              strokeWidth={2}
              fill="url(#splitFill)"
              fillOpacity={1}
              baseValue={0}
              isAnimationActive={false}
              activeDot={{
                r: 5,
                fill: isProfit ? '#10b981' : '#ef4444',
                stroke: '#18181b',
                strokeWidth: 2,
              }}
              dot={false}
            />

            {/* Custom tooltip */}
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const pt = payload[0].payload as ChartPoint
                const positive = pt.pnl >= 0
                return (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl">
                    <div className="text-[10px] text-zinc-400 mb-0.5">
                      If market settles at {pt.prob}%
                    </div>
                    <div className={cn(
                      'text-sm font-mono font-bold',
                      positive ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {fmtCents(pt.pnl)}
                    </div>
                  </div>
                )
              }}
              cursor={{
                stroke: '#a1a1aa',
                strokeWidth: 1,
                strokeDasharray: '3 3',
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom legend row */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-400 rounded inline-block" />
            Now {nowPct}%
          </span>
          {breakeven != null && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-amber-400 rounded inline-block" style={{ borderTop: '1px dashed' }} />
              BE {breakeven}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500/40 inline-block" />
            Profit
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500/40 inline-block" />
            Loss
          </span>
        </div>
      </div>

      {/* Summary: Max Loss / Breakeven / Max Profit */}
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <div className="rounded-lg bg-red-500/[0.07] border border-red-500/20 p-2 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5 font-medium">Max Loss</div>
          <div className="text-xs font-mono font-bold text-red-400">{fmtCents(minPnl)}</div>
        </div>
        <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 p-2 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5 font-medium">Breakeven</div>
          <div className="text-xs font-mono font-bold text-amber-400">
            {breakeven != null ? `${breakeven}%` : '—'}
          </div>
        </div>
        <div className="rounded-lg bg-emerald-500/[0.07] border border-emerald-500/20 p-2 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5 font-medium">Max Profit</div>
          <div className="text-xs font-mono font-bold text-emerald-400">{fmtCents(maxPnl)}</div>
        </div>
      </div>
    </div>
  )
}
