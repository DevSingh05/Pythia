'use client'

import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid
} from 'recharts'
import { EquityPoint, INITIAL_BALANCE } from '@/lib/paperTrade'
import { cn } from '@/lib/utils'

interface PnlChartProps {
  data: EquityPoint[]
  className?: string
}

const RANGES = ['1D', '1W', '1M', 'ALL'] as const
type Range = typeof RANGES[number]

function filterByRange(data: EquityPoint[], range: Range): EquityPoint[] {
  if (!data.length || range === 'ALL') return data
  const now = Date.now()
  const ms: Record<string, number> = { '1D': 86_400_000, '1W': 7 * 86_400_000, '1M': 30 * 86_400_000 }
  const cutoff = now - ms[range]
  const filtered = data.filter(p => p.t >= cutoff)
  return filtered.length > 0 ? filtered : data
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as EquityPoint
  const pnl = d.balance - INITIAL_BALANCE
  const isUp = pnl >= 0
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted">{new Date(d.t).toLocaleString()}</div>
      <div className="flex items-center gap-3 mt-1">
        <div>
          <span className="text-muted">Balance </span>
          <span className="font-mono font-medium text-zinc-200">${d.balance.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted">P&L </span>
          <span className={cn('font-mono font-semibold', isUp ? 'text-green' : 'text-red')}>
            {isUp ? '+' : ''}${pnl.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function PnlChart({ data, className }: PnlChartProps) {
  const [range, setRange] = useState<Range>('ALL')
  const filtered = filterByRange(data, range)

  const first = filtered[0]?.balance ?? INITIAL_BALANCE
  const last = filtered[filtered.length - 1]?.balance ?? INITIAL_BALANCE
  const isUp = last >= first
  const color = isUp ? '#22c55e' : '#ef4444'
  const gradientId = 'pnlGradient'

  if (filtered.length < 2) {
    return (
      <div className={cn('h-full flex items-center justify-center bg-card rounded-xl border border-border', className)}>
        <div className="text-center space-y-1">
          <p className="text-sm text-muted">No trading activity yet</p>
          <p className="text-xs text-muted/60">Place trades to see your equity curve</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider font-medium">Equity curve</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-lg font-semibold font-mono tabular-nums">${last.toFixed(2)}</span>
            <span className={cn('text-xs font-mono font-medium', isUp ? 'text-green' : 'text-red')}>
              {isUp ? '+' : ''}{((last - INITIAL_BALANCE) / INITIAL_BALANCE * 100).toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 justify-start sm:justify-end">
          {RANGES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'px-2.5 py-1 text-[10px] rounded-md font-medium transition-colors',
                range === r
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'text-muted hover:text-zinc-300 hover:bg-surface border border-transparent'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filtered} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1a1a2e" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={60}
            />
            <YAxis
              domain={[
                (min: number) => Math.floor(min - 10),
                (max: number) => Math.ceil(max + 10),
              ]}
              tickFormatter={v => `$${Number(v).toLocaleString()}`}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={65}
            />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine
              y={INITIAL_BALANCE}
              stroke="#3f3f46"
              strokeDasharray="4 4"
              label={{ value: 'Initial', fill: '#52525b', fontSize: 9, position: 'left' }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
