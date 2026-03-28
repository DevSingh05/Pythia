'use client'

import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
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
  const isProfit = pnl > 0
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted">Prob at expiry: <span className="text-slate-200 font-mono">{(prob * 100).toFixed(0)}%</span></div>
      <div className={cn('font-mono font-semibold mt-0.5', isProfit ? 'text-green' : pnl < 0 ? 'text-red' : 'text-muted')}>
        P&L: {isProfit ? '+' : ''}{(pnl * 100).toFixed(1)}¢
      </div>
    </div>
  )
}

export default function PayoffChart({ option, side, quantity, currentProb, className }: PayoffChartProps) {
  const data = payoffCurve(option.type, option.strike, option.premium, quantity, side)

  const maxPnl = Math.max(...data.map(d => d.pnl))
  const minPnl = Math.min(...data.map(d => d.pnl))
  const breakeven = data.find(d => Math.abs(d.pnl) < 0.002)?.prob

  // Split data into profit/loss zones for coloring
  const dataWithColor = data.map(d => ({
    ...d,
    profit: d.pnl > 0 ? d.pnl : null,
    loss: d.pnl <= 0 ? d.pnl : null,
  }))

  return (
    <div className={cn('space-y-3', className)}>
      {/* P&L summary cards */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-surface rounded-lg p-2">
          <div className="text-[10px] text-muted uppercase tracking-wider">Max Profit</div>
          <div className="text-sm font-mono font-semibold text-green mt-0.5">
            {maxPnl > 0.99 ? 'Unlimited' : `${(maxPnl * 100).toFixed(1)}¢`}
          </div>
        </div>
        <div className="bg-surface rounded-lg p-2">
          <div className="text-[10px] text-muted uppercase tracking-wider">Breakeven</div>
          <div className="text-sm font-mono font-semibold text-accent mt-0.5">
            {breakeven !== undefined ? `${(breakeven * 100).toFixed(1)}%` : `${(option.breakeven * 100).toFixed(1)}%`}
          </div>
        </div>
        <div className="bg-surface rounded-lg p-2">
          <div className="text-[10px] text-muted uppercase tracking-wider">Max Loss</div>
          <div className="text-sm font-mono font-semibold text-red mt-0.5">
            {minPnl < -0.99 ? 'Unlimited' : `${(minPnl * 100).toFixed(1)}¢`}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dataWithColor} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="lossGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.03} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="#2a2a3d" strokeDasharray="4 4" vertical={false} />

            <XAxis
              dataKey="prob"
              type="number"
              domain={[0, 1]}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
            />
            <YAxis
              tickFormatter={v => `${(v * 100).toFixed(0)}¢`}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Zero line */}
            <ReferenceLine y={0} stroke="#2a2a3d" strokeWidth={1.5} />

            {/* Current probability */}
            <ReferenceLine
              x={currentProb}
              stroke="#2dd4bf"
              strokeDasharray="4 4"
              label={{ value: 'Now', fill: '#2dd4bf', fontSize: 9, position: 'top' }}
            />

            {/* Strike */}
            <ReferenceLine
              x={option.strike}
              stroke="#64748b"
              strokeDasharray="2 4"
              label={{ value: 'K', fill: '#64748b', fontSize: 9, position: 'top' }}
            />

            {/* Profit area */}
            <Area
              type="monotone"
              dataKey="profit"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#profitGrad)"
              connectNulls={false}
              dot={false}
            />

            {/* Loss area */}
            <Area
              type="monotone"
              dataKey="loss"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#lossGrad)"
              connectNulls={false}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
