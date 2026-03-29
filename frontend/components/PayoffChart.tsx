'use client'

import {
  ComposedChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts'
import { payoffCurve } from '@/lib/pricing'
import { OptionQuote } from '@/lib/api'
import { cn } from '@/lib/utils'

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
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs shadow-xl">
      <div className="text-zinc-500">{(prob * 100).toFixed(0)}% YES at expiry</div>
      <div className={cn('font-mono font-semibold mt-0.5', positive ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-zinc-400')}>
        {positive ? '+' : ''}{(pnl * 100).toFixed(1)}¢
      </div>
    </div>
  )
}

export default function PayoffChart({ option, side, quantity, currentProb, className }: PayoffChartProps) {
  const data = payoffCurve(option.type, option.strike, option.premium, quantity, side)

  const pnlValues = data.map(d => d.pnl)
  const maxPnl = Math.max(...pnlValues)
  const minPnl = Math.min(...pnlValues)

  // Find breakeven (closest to zero crossing)
  const bePoint = data.reduce((best, d) => Math.abs(d.pnl) < Math.abs(best.pnl) ? d : best)
  const breakevenProb = bePoint.prob

  const dataWithZones = data.map(d => ({
    ...d,
    gain: d.pnl > 0 ? d.pnl : 0,
    loss: d.pnl < 0 ? d.pnl : 0,
  }))

  const yPad = (maxPnl - minPnl) * 0.12
  const yDomain = [minPnl - yPad, maxPnl + yPad]

  const fmtCents = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}¢`

  return (
    <div className={cn('space-y-3', className)}>
      {/* P&L summary row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/15 p-2.5 text-center">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Max Gain</div>
          <div className="text-sm font-mono font-semibold text-emerald-400">
            {fmtCents(maxPnl)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-2.5 text-center">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Breakeven</div>
          <div className="text-sm font-mono font-semibold text-blue-400">
            {(breakevenProb * 100).toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-red-500/8 border border-red-500/15 p-2.5 text-center">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Max Loss</div>
          <div className="text-sm font-mono font-semibold text-red-400">
            {fmtCents(minPnl)}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dataWithZones} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="gainGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="lossGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="prob"
              type="number"
              domain={[0, 1]}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={v => `${(v * 100).toFixed(0)}¢`}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickCount={4}
            />
            <Tooltip content={<CustomTooltip />} />

            <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />

            {/* Current probability */}
            <ReferenceLine
              x={currentProb}
              stroke="#3b82f6"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{ value: 'now', fill: '#3b82f6', fontSize: 9, position: 'insideTopRight' }}
            />

            {/* Strike */}
            <ReferenceLine
              x={option.strike}
              stroke="#52525b"
              strokeDasharray="2 4"
              strokeWidth={1}
              label={{ value: 'K', fill: '#52525b', fontSize: 9, position: 'insideTopLeft' }}
            />

            <Area type="monotone" dataKey="gain" stroke="#10b981" strokeWidth={2} fill="url(#gainGrad)" dot={false} connectNulls />
            <Area type="monotone" dataKey="loss" stroke="#ef4444" strokeWidth={2} fill="url(#lossGrad)" dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
