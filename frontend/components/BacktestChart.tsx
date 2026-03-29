'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { cn } from '@/lib/utils'
import { fmtCents } from './PayoffChart'
import type { PricePoint } from '@/lib/api'
import { americanOptionBinomial, AMERICAN_TREE_STEPS, clampSigma } from '@/lib/pricing'

interface BacktestChartProps {
  /** Full historical YES% series for this market */
  history: PricePoint[]
  /** Option parameters */
  strike: number
  type: 'call' | 'put'
  side: 'buy' | 'sell'
  sigma: number
  daysToExpiry: number
  /** Lot multiplier for dollar display */
  lotSize?: number
  className?: string
}

interface BacktestPoint {
  /** Unix ms */
  t: number
  /** P&L in scaled dollars */
  pnl: number
  /** Underlying probability */
  prob: number
  /** Option premium at this point */
  premium: number
}

/**
 * Backtests a trade by walking through historical prices and computing
 * mark-to-market P&L at each point.
 */
export default function BacktestChart({
  history,
  strike,
  type,
  side,
  sigma,
  daysToExpiry,
  lotSize = 1000,
  className,
}: BacktestChartProps) {
  // Sort history ascending
  const sorted = useMemo(() => [...history].sort((a, b) => a.t - b.t), [history])

  // Entry date slider: default to ~90 days ago (or earliest available)
  const oldestT = sorted[0]?.t ?? Date.now()
  const newestT = sorted[sorted.length - 1]?.t ?? Date.now()
  const spanMs = newestT - oldestT
  const defaultEntryT = Math.max(oldestT, newestT - 90 * 86_400_000)

  const [entryT, setEntryT] = useState(defaultEntryT)

  // Find entry point index
  const entryIdx = useMemo(() => {
    let best = 0
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].t <= entryT) best = i
    }
    return best
  }, [sorted, entryT])

  // Build backtest data from entry point forward
  const { data, entryPremium, finalPnl, maxPnl, minPnl, maxDrawdown } = useMemo(() => {
    if (sorted.length < 2 || entryIdx >= sorted.length - 1) {
      return { data: [], entryPremium: 0, finalPnl: 0, maxPnl: 0, minPnl: 0, maxDrawdown: 0 }
    }

    const sig = clampSigma(sigma)
    const tau = Math.max(daysToExpiry, 1) / 365

    // Premium at entry
    const entryProb = sorted[entryIdx].p
    const entryPrem = americanOptionBinomial(entryProb, strike, sig, tau, AMERICAN_TREE_STEPS, type)

    // Walk forward computing mark-to-market P&L
    const pts: BacktestPoint[] = []
    let peak = 0
    let maxDD = 0
    const slice = sorted.slice(entryIdx)

    // Downsample if too many points
    const maxPoints = 300
    const step = Math.max(1, Math.floor(slice.length / maxPoints))

    for (let i = 0; i < slice.length; i++) {
      if (i % step !== 0 && i !== slice.length - 1) continue

      const pt = slice[i]
      // Remaining tau decreases as time passes from entry
      const daysPassed = (pt.t - sorted[entryIdx].t) / 86_400_000
      const remainTau = Math.max(0.5 / 365, (daysToExpiry - daysPassed) / 365)
      const currentPrem = americanOptionBinomial(pt.p, strike, sig, remainTau, AMERICAN_TREE_STEPS, type)

      let pnl: number
      if (side === 'buy') {
        pnl = (currentPrem - entryPrem) * lotSize
      } else {
        pnl = (entryPrem - currentPrem) * lotSize
      }

      pts.push({
        t: pt.t,
        pnl,
        prob: pt.p,
        premium: currentPrem,
      })

      peak = Math.max(peak, pnl)
      maxDD = Math.max(maxDD, peak - pnl)
    }

    const pnlValues = pts.map(p => p.pnl)
    return {
      data: pts,
      entryPremium: entryPrem,
      finalPnl: pts[pts.length - 1]?.pnl ?? 0,
      maxPnl: Math.max(...pnlValues, 0),
      minPnl: Math.min(...pnlValues, 0),
      maxDrawdown: maxDD,
    }
  }, [sorted, entryIdx, strike, type, side, sigma, daysToExpiry, lotSize])

  const isProfit = finalPnl >= 0

  // Y domain
  const yPad = Math.max(Math.abs(maxPnl), Math.abs(minPnl)) * 0.15
  const yMin = Math.min(minPnl - yPad, -1)
  const yMax = Math.max(maxPnl + yPad, 1)
  const zeroOffset = yMax / (yMax - yMin)

  // Entry date label
  const entryDate = new Date(sorted[entryIdx]?.t ?? entryT)
  const entryLabel = entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const daysInTrade = data.length > 1 ? Math.round((data[data.length - 1].t - data[0].t) / 86_400_000) : 0

  if (sorted.length < 10) {
    return (
      <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center', className)}>
        <p className="text-sm text-zinc-500">Not enough historical data for backtesting.</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Entry date slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>Entry date</span>
          <span className="font-mono text-zinc-300">{entryLabel}</span>
        </div>
        <input
          type="range"
          min={oldestT}
          max={newestT - 86_400_000} // at least 1 day before latest
          value={entryT}
          onChange={e => setEntryT(Number(e.target.value))}
          className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
        />
        <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
          <span>{new Date(oldestT).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</span>
          <span>{new Date(newestT).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</span>
        </div>
      </div>

      {/* Summary header */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">Final P&L</div>
          <div className={cn('text-sm font-mono font-bold', isProfit ? 'text-emerald-400' : 'text-red-400')}>
            {fmtCents(finalPnl)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">Peak</div>
          <div className="text-sm font-mono font-bold text-emerald-400">{fmtCents(maxPnl)}</div>
        </div>
        <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">Max DD</div>
          <div className="text-sm font-mono font-bold text-red-400">-${maxDrawdown.toFixed(2)}</div>
        </div>
        <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-0.5">Duration</div>
          <div className="text-sm font-mono font-bold text-zinc-300">{daysInTrade}d</div>
        </div>
      </div>

      {/* P&L over time chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="btSplitFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#10b981" stopOpacity={0.05} />
                  <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#ef4444" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="btSplitStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#10b981" />
                  <stop offset={`${(zeroOffset * 100).toFixed(1)}%`} stopColor="#ef4444" />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(113,113,122,0.15)" vertical={false} />

              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v: number) => {
                  const d = new Date(v)
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }}
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={{ stroke: '#3f3f46' }}
                tickLine={false}
                minTickGap={50}
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

              <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 2" strokeWidth={1} />

              <Area
                type="monotone"
                dataKey="pnl"
                stroke="url(#btSplitStroke)"
                strokeWidth={2}
                fill="url(#btSplitFill)"
                fillOpacity={1}
                baseValue={0}
                isAnimationActive={false}
                dot={false}
                activeDot={{
                  r: 4,
                  stroke: '#18181b',
                  strokeWidth: 2,
                }}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null
                  const pt = payload[0].payload as BacktestPoint
                  const pos = pt.pnl >= 0
                  const d = new Date(pt.t)
                  return (
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl">
                      <div className="text-[10px] text-zinc-400 mb-1">
                        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className={cn(
                        'text-sm font-mono font-bold',
                        pos ? 'text-emerald-400' : 'text-red-400',
                      )}>
                        {fmtCents(pt.pnl)}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        YES at {(pt.prob * 100).toFixed(1)}% · Prem {pt.premium.toFixed(4)}
                      </div>
                    </div>
                  )
                }}
                cursor={{ stroke: '#a1a1aa', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Entry details */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1">
        <span>
          Entry: {side.toUpperCase()} {type.toUpperCase()} @ {(strike * 100).toFixed(0)}% strike
        </span>
        <span className="font-mono">
          Entry prem: ${(entryPremium * lotSize).toFixed(2)}
        </span>
      </div>
    </div>
  )
}
