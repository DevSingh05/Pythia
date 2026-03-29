'use client'

import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import { EquityPoint, INITIAL_BALANCE } from '@/lib/paperTrade'
import { cn } from '@/lib/utils'

interface PnlChartProps { data: EquityPoint[]; className?: string }

const RANGES = ['1D', '1W', '1M', 'ALL'] as const
type Range = typeof RANGES[number]

function filterByRange(data: EquityPoint[], range: Range): EquityPoint[] {
  if (!data.length || range === 'ALL') return data
  const ms: Record<string, number> = { '1D': 86_400_000, '1W': 7 * 86_400_000, '1M': 30 * 86_400_000 }
  const cutoff = Date.now() - ms[range]
  const filtered = data.filter(p => p.t >= cutoff)
  return filtered.length > 0 ? filtered : data
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as EquityPoint
  const pnl = d.balance - INITIAL_BALANCE
  const isUp = pnl >= 0
  return (
    <div className="bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-[10px] font-mono shadow-xl">
      <div className="text-zinc-500">{new Date(d.t).toLocaleString()}</div>
      <div className="flex items-center gap-3 mt-0.5">
        <span className="text-zinc-400">BAL <span className="text-zinc-200 font-bold">${d.balance.toFixed(2)}</span></span>
        <span className={cn('font-bold', isUp ? 'text-emerald-400' : 'text-red-400')}>
          {isUp ? '+' : ''}${pnl.toFixed(2)}
        </span>
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
  const color = isUp ? '#10b981' : '#ef4444'

  if (filtered.length < 2) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-center">
          <p className="text-[10px] text-zinc-600 font-mono">NO TRADING ACTIVITY</p>
          <p className="text-[9px] text-zinc-700 font-mono mt-0.5">Place trades to see equity curve</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[9px] text-zinc-600 font-mono font-bold tracking-widest uppercase">Equity</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-base font-mono font-bold tabular-nums text-zinc-100">${last.toFixed(2)}</span>
            <span className={cn('text-[10px] font-mono font-bold', isUp ? 'text-emerald-400' : 'text-red-400')}>
              {isUp ? '+' : ''}{((last - INITIAL_BALANCE) / INITIAL_BALANCE * 100).toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-px">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn(
                'px-2 py-0.5 text-[9px] font-mono font-bold tracking-wider transition-colors',
                range === r ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'
              )}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filtered} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1a1a24" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']}
              tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              tick={{ fill: '#3f3f46', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} minTickGap={60} />
            <YAxis domain={[(min: number) => Math.floor(min - 5), (max: number) => Math.ceil(max + 5)]}
              tickFormatter={v => `$${Number(v).toFixed(0)}`}
              tick={{ fill: '#3f3f46', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={50} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={INITIAL_BALANCE} stroke="#27272a" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="balance" stroke={color} strokeWidth={1.5}
              fill="url(#eqGrad)" dot={false} activeDot={{ r: 2, fill: color, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
