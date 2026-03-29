'use client'

import { useMemo } from 'react'
import { Position } from '@/lib/api'
import { PaperOrder, MarketSnapshot } from '@/lib/paperTrade'
import { cn, fmtPremium } from '@/lib/utils'
import InfoTooltip from '@/components/InfoTooltip'

interface PnlBreakdownProps {
  positions: Position[]
  orders: PaperOrder[]
  marketPrices: Map<string, MarketSnapshot>
}

interface Attribution { directional: number; timeDecay: number; residual: number; totalPnl: number }

function computeAttribution(positions: Position[], orders: PaperOrder[], marketPrices: Map<string, MarketSnapshot>): Attribution {
  let directional = 0, timeDecay = 0, totalPnl = 0
  for (const pos of positions) {
    const sign = pos.side === 'long' ? 1 : -1
    const ref = orders.find(o => o.marketId === pos.marketId && o.strike === pos.strike && o.type === pos.type)
    const snap = marketPrices.get(pos.marketId)
    const fillProb = ref?.currentProbAtFill ?? 0.5
    const currentProb = snap?.currentProb ?? fillProb
    const daysSinceFill = ref ? (Date.now() - ref.timestamp) / 86_400_000 : 0
    directional += pos.delta * (currentProb - fillProb) * pos.quantity * sign
    timeDecay += pos.theta * daysSinceFill * pos.quantity * sign
    totalPnl += pos.pnl
  }
  return { directional, timeDecay, residual: totalPnl - directional - timeDecay, totalPnl }
}

export default function PnlBreakdown({ positions, orders, marketPrices }: PnlBreakdownProps) {
  const attr = useMemo(() => computeAttribution(positions, orders, marketPrices), [positions, orders, marketPrices])
  const maxAbs = useMemo(() => Math.max(...positions.map(p => Math.abs(p.pnl)), 0.001), [positions])

  if (positions.length === 0) return null

  return (
    <div className="bg-[#0c0c14] border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="w-0.5 h-3 bg-blue-500" />
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-bold">P&L Attribution</span>
        <InfoTooltip explanation="P&L split into directional, time decay, and residual components." side="right" />
      </div>

      <div className="p-3 space-y-3">
        {/* Attribution row */}
        <div className="grid grid-cols-3 gap-px bg-zinc-800">
          {[
            { label: 'DIRECTIONAL', value: attr.directional, tip: 'Delta x probability move since entry.' },
            { label: 'TIME DECAY', value: attr.timeDecay, tip: 'Cumulative theta cost since entry.' },
            { label: 'RESIDUAL', value: attr.residual, tip: 'Vol changes, gamma, model differences.' },
          ].map(item => {
            const isPos = item.value >= 0
            return (
              <div key={item.label} className="bg-[#0c0c14] px-3 py-2">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[9px] text-zinc-600 font-mono font-bold tracking-wider">{item.label}</span>
                  <InfoTooltip explanation={item.tip} side="top" />
                </div>
                <div className={cn('text-sm font-mono font-bold tabular-nums', isPos ? 'text-emerald-400' : 'text-red-400')}>
                  {isPos ? '+' : ''}{fmtPremium(Math.abs(item.value))}
                </div>
                <div className="text-[9px] text-zinc-700 font-mono">{isPos ? 'contributed' : 'detracted'}</div>
              </div>
            )
          })}
        </div>

        {/* Position bars */}
        <div className="space-y-1.5">
          <div className="text-[9px] text-zinc-600 font-mono font-bold tracking-wider uppercase">Per-Position</div>
          {[...positions].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).map(pos => {
            const pct = maxAbs > 0 ? Math.abs(pos.pnl) / maxAbs * 100 : 0
            const isPos = pos.pnl >= 0
            const title = pos.marketTitle.length > 40 ? pos.marketTitle.slice(0, 38) + '...' : pos.marketTitle
            return (
              <div key={`${pos.marketId}|${pos.strike}|${pos.type}`}>
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-zinc-500 font-mono truncate max-w-[240px]" title={pos.marketTitle}>{title}</span>
                  <span className={cn('font-mono font-bold tabular-nums', isPos ? 'text-emerald-400' : 'text-red-400')}>
                    {isPos ? '+' : ''}{fmtPremium(Math.abs(pos.pnl))}
                  </span>
                </div>
                <div className="h-1 bg-zinc-900 overflow-hidden">
                  <div className={cn('h-full', isPos ? 'bg-emerald-500' : 'bg-red-500')}
                    style={{ width: `${Math.min(100, pct)}%`, opacity: 0.7 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
