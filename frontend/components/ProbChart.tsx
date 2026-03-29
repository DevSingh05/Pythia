'use client'

import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { PricePoint } from '@/lib/api'
import { cn, fmtProb } from '@/lib/utils'

interface ProbChartProps {
  history: PricePoint[]
  currentProb: number
  loading?: boolean
  className?: string
}

const INTERVALS = ['1D', '1W', '1M', 'ALL'] as const
type Interval = typeof INTERVALS[number]

function filterHistory(history: PricePoint[], interval: Interval): PricePoint[] {
  if (!history.length) return []
  const now = Date.now()
  const ms: Record<Interval, number> = {
    '1D': 86_400_000,
    '1W': 7 * 86_400_000,
    '1M': 30 * 86_400_000,
    'ALL': Infinity,
  }
  const cutoff = now - ms[interval]
  return history.filter(p => p.t >= cutoff)
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as PricePoint
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted">{new Date(d.t).toLocaleString()}</div>
      <div className="text-accent font-mono font-medium mt-0.5">{fmtProb(d.p, 1)}</div>
    </div>
  )
}

export default function ProbChart({ history, currentProb, loading, className }: ProbChartProps) {
  const [interval, setInterval] = useState<Interval>('1W')

  const data = filterHistory(history, interval)

  // Determine color: green if up, red if down from start of interval
  const startProb = data[0]?.p ?? currentProb
  const color = currentProb >= startProb ? '#22c55e' : '#ef4444'

  if (loading) {
    return (
      <div className={cn('h-48 bg-card rounded-xl border border-border animate-pulse', className)} />
    )
  }

  if (!data.length) {
    return (
      <div className={cn('h-48 flex items-center justify-center bg-card rounded-xl border border-border', className)}>
        <span className="text-muted text-sm">No price history available</span>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Interval selector */}
      <div className="flex gap-1">
        {INTERVALS.map(i => (
          <button
            key={i}
            onClick={() => setInterval(i)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-md font-medium transition-colors',
              interval === i
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'text-muted hover:text-slate-200 hover:bg-card'
            )}
          >
            {i}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[
                (dataMin: number) => Math.max(0, dataMin - 0.05),
                (dataMax: number) => Math.min(1, dataMax + 0.05)
              ]}
              tickFormatter={v => `${Number((v * 100).toFixed(1))}%`}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickCount={5}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0.5} stroke="#2a2a3d" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="p"
              stroke={color}
              strokeWidth={2}
              fill="url(#probGrad)"
              dot={false}
              activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
