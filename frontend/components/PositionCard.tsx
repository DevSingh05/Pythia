'use client'

import { Position } from '@/lib/api'
import { cn, fmtProb, fmtPremium, fmtGreek } from '@/lib/utils'
import { X } from 'lucide-react'

interface PositionCardProps {
  position: Position
  onClose?: (position: Position) => void
  compact?: boolean
}

export function PositionCardCompact({ position, onClose }: PositionCardProps) {
  const isCall = position.type === 'call'
  const pnlUp = position.pnl >= 0

  return (
    <div className="group border border-zinc-800/60 bg-zinc-900/30 px-2.5 py-2 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn(
            'text-[9px] font-mono font-bold px-1 py-px shrink-0',
            isCall ? 'text-emerald-400 bg-emerald-950/50' : 'text-red-400 bg-red-950/50'
          )}>
            {position.type === 'call' ? 'C' : 'P'}
          </span>
          <span className="text-[10px] text-zinc-400 font-mono truncate">{position.marketTitle}</span>
        </div>
        {onClose && (
          <button onClick={() => onClose(position)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-600 hover:text-red-400 transition-all">
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2 text-[9px] text-zinc-600 font-mono">
          <span>{fmtProb(position.strike)}K</span>
          <span>{position.expiry}</span>
          <span>{position.quantity}x {position.side === 'long' ? 'L' : 'S'}</span>
        </div>
        <div className={cn('text-[10px] font-mono font-bold tabular-nums', pnlUp ? 'text-emerald-400' : 'text-red-400')}>
          {pnlUp ? '+' : ''}{fmtPremium(Math.abs(position.pnl))}
        </div>
      </div>
    </div>
  )
}

export default function PositionCard({ position, onClose }: PositionCardProps) {
  const isCall = position.type === 'call'
  const isLong = position.side === 'long'
  const pnlPositive = position.pnl >= 0

  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors">
      <td className="py-2 px-2"><div className="text-[11px] text-zinc-300 font-mono truncate max-w-[180px]">{position.marketTitle}</div></td>
      <td className="py-2 px-2">
        <span className={cn('text-[9px] font-mono font-bold px-1 py-px', isCall ? 'text-emerald-400 bg-emerald-950/50' : 'text-red-400 bg-red-950/50')}>
          {position.type.toUpperCase()}
        </span>
      </td>
      <td className="py-2 px-2"><span className={cn('text-[10px] font-mono font-bold', isLong ? 'text-emerald-400' : 'text-red-400')}>{position.side.toUpperCase()}</span></td>
      <td className="py-2 px-2 font-mono tabular-nums text-[11px]">{fmtProb(position.strike)}</td>
      <td className="py-2 px-2 text-[10px] text-zinc-600 font-mono">{position.expiry}</td>
      <td className="py-2 px-2 font-mono tabular-nums text-[11px] text-center">{position.quantity}</td>
      <td className="py-2 px-2 font-mono tabular-nums text-[11px]">{fmtPremium(position.avgCost)}</td>
      <td className="py-2 px-2 font-mono tabular-nums text-[11px]">{fmtPremium(position.currentValue)}</td>
      <td className="py-2 px-2">
        <div className={cn('font-mono tabular-nums text-[11px] font-bold', pnlPositive ? 'text-emerald-400' : 'text-red-400')}>
          {pnlPositive ? '+' : ''}{fmtPremium(Math.abs(position.pnl))}
        </div>
        <div className={cn('text-[9px] font-mono', pnlPositive ? 'text-emerald-500/60' : 'text-red-500/60')}>
          {pnlPositive ? '+' : ''}{(position.pnlPct * 100).toFixed(1)}%
        </div>
      </td>
      <td className="py-2 px-2 font-mono tabular-nums text-[10px] text-zinc-600 hidden lg:table-cell">{fmtGreek(position.delta)}</td>
      <td className="py-2 px-2 font-mono tabular-nums text-[10px] text-zinc-600 hidden lg:table-cell">{fmtGreek(position.theta)}</td>
      <td className="py-2 px-2">
        {onClose && (
          <button onClick={() => onClose(position)} className="p-0.5 text-zinc-700 hover:text-red-400 transition-colors" title="Close">
            <X className="w-3 h-3" />
          </button>
        )}
      </td>
    </tr>
  )
}
