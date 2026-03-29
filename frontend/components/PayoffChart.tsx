'use client'

import {
  ComposedChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid, ReferenceDot
} from 'recharts'
import { payoffCurve, COMMISSION_PER_CONTRACT, CONTRACT_NOTIONAL } from '@/lib/pricing'
import { OptionQuote } from '@/lib/api'
import { cn, fmtPremium } from '@/lib/utils'

interface PayoffChartProps {
  option: OptionQuote
  side: 'buy' | 'sell'
  quantity: number
  currentProb: number
  className?: string
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { prob, pnl } = payload[0].payload
  const positive = pnl > 0
  return (
    <div className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-2xl">
      <div className="text-zinc-500 font-mono">{(prob * 100).toFixed(0)}% YES at expiry</div>
      <div className={cn(
        'font-mono font-bold text-sm mt-1',
        positive ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-zinc-400'
      )}>
        {positive ? '+' : ''}{fmtPremium(pnl)}
      </div>
    </div>
  )
}

export default function PayoffChart({ option, side, quantity, currentProb, className }: PayoffChartProps) {
  const data = payoffCurve(option.type, option.strike, option.premium, quantity, side)

  const pnlValues = data.map(d => d.pnl)
  const maxPnl = Math.max(...pnlValues)
  const minPnl = Math.min(...pnlValues)

  // Breakeven: convert dollar-valued premium back to probability space
  // by dividing by CONTRACT_NOTIONAL (100).
  const N = CONTRACT_NOTIONAL
  const comm = COMMISSION_PER_CONTRACT
  const premProb = option.premium / N  // premium in probability units
  const commProb = comm / N            // commission in probability units
  let breakevenProb: number
  if (side === 'buy') {
    breakevenProb = option.type === 'call'
      ? Math.min(0.999, option.strike + premProb + commProb)
      : Math.max(0.001, option.strike - premProb - commProb)
  } else {
    breakevenProb = option.type === 'call'
      ? Math.min(0.999, option.strike + premProb - commProb)
      : Math.max(0.001, option.strike - premProb + commProb)
  }

  const dataWithZones = data.map(d => ({
    ...d,
    gain: d.pnl > 0 ? d.pnl : 0,
    loss: d.pnl < 0 ? d.pnl : 0,
  }))

  const yPad = (maxPnl - minPnl) * 0.15 || 1
  const yDomain = [minPnl - yPad, maxPnl + yPad]

  return (
    <div className={cn('space-y-4', className)}>
      {/* ── P&L Summary Cards ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-medium">Max Profit</div>
          <div className="text-base font-mono font-bold text-emerald-400">
            +{fmtPremium(maxPnl)}
          </div>
        </div>
        <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/40 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-medium">Breakeven</div>
          <div className="text-base font-mono font-bold text-amber-400">
            {(breakevenProb * 100).toFixed(1)}%
          </div>
        </div>
        <div className="rounded-xl bg-red-500/[0.06] border border-red-500/20 p-3 text-center">
          <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-medium">Max Loss</div>
          <div className="text-base font-mono font-bold text-red-400">
            -{fmtPremium(Math.abs(minPnl))}
          </div>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="relative rounded-xl bg-zinc-900/40 border border-zinc-800/60 p-2">
        {/* Current price label */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/90 border border-zinc-700/60 backdrop-blur-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-[10px] font-mono text-zinc-400">
              YES now <span className="text-blue-400 font-semibold">{(currentProb * 100).toFixed(1)}%</span>
            </span>
          </div>
        </div>

        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dataWithZones} margin={{ top: 28, right: 12, left: -8, bottom: 4 }}>
              <defs>
                <linearGradient id="payoffGainGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="payoffLossGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#1e1e24" strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="prob"
                type="number"
                domain={[0, 1]}
                tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={v => `$${v.toFixed(0)}`}
                tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                tickCount={5}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Zero line */}
              <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1.5} />

              {/* Current probability line */}
              <ReferenceLine
                x={currentProb}
                stroke="#3b82f6"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />

              {/* Strike line */}
              <ReferenceLine
                x={option.strike}
                stroke="#52525b"
                strokeDasharray="3 6"
                strokeWidth={1}
                label={{ value: `K ${(option.strike * 100).toFixed(0)}%`, fill: '#71717a', fontSize: 9, position: 'insideTopLeft' }}
              />

              {/* Breakeven dot */}
              <ReferenceDot
                x={breakevenProb}
                y={0}
                r={5}
                fill="#f59e0b"
                stroke="#1c1917"
                strokeWidth={2}
              />

              {/* Profit zone */}
              <Area
                type="monotone"
                dataKey="gain"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#payoffGainGrad)"
                dot={false}
                connectNulls
              />
              {/* Loss zone */}
              <Area
                type="monotone"
                dataKey="loss"
                stroke="#ef4444"
                strokeWidth={2.5}
                fill="url(#payoffLossGrad)"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
