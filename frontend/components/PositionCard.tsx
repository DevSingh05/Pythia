'use client'

import { Position } from '@/lib/api'
import { cn, fmtProb, fmtPremium, fmtGreek } from '@/lib/utils'
import { X } from 'lucide-react'

interface PositionCardProps {
  position: Position
  onClose?: (position: Position) => void
  compact?: boolean
}

/** Compact card variant for the sidebar panel next to the P&L chart */
export function PositionCardCompact({ position, onClose }: PositionCardProps) {
  const isCall = position.type === 'call'
  const pnlUp = position.pnl >= 0

  return (
    <div className="group bg-surface border border-border rounded-lg px-3 py-2.5 hover:border-zinc-600 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0',
            isCall ? 'text-green bg-green-muted' : 'text-red bg-red-muted'
          )}>
            {position.type === 'call' ? 'C' : 'P'}
          </span>
          <span className="text-xs text-zinc-300 truncate">{position.marketTitle}</span>
        </div>
        {onClose && (
          <button
            onClick={() => onClose(position)}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-muted text-muted hover:text-red transition-all"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="font-mono">{fmtProb(position.strike)} K</span>
          <span>{position.expiry}</span>
          <span>{position.quantity}x {position.side === 'long' ? 'LONG' : 'SHORT'}</span>
        </div>
        <div className={cn('text-xs font-mono font-semibold tabular-nums', pnlUp ? 'text-green' : 'text-red')}>
          {pnlUp ? '+' : ''}{fmtPremium(Math.abs(position.pnl))}
        </div>
      </div>
    </div>
  )
}

/** Full table-row variant for the expanded positions view */
export default function PositionCard({ position, onClose }: PositionCardProps) {
  const isCall = position.type === 'call'
  const isLong = position.side === 'long'
  const pnlPositive = position.pnl >= 0

  return (
    <tr className="border-b border-border/50 hover:bg-surface/50 transition-colors">
      <td className="py-2.5 px-3">
        <div className="text-sm text-zinc-200 truncate max-w-[200px]">{position.marketTitle}</div>
      </td>
      <td className="py-2.5 px-3">
        <span className={cn(
          'text-xs font-mono px-2 py-0.5 rounded',
          isCall ? 'text-green bg-green-muted' : 'text-red bg-red-muted'
        )}>
          {position.type.toUpperCase()}
        </span>
      </td>
      <td className="py-2.5 px-3">
        <span className={cn('text-xs font-medium', isLong ? 'text-green' : 'text-red')}>
          {position.side.toUpperCase()}
        </span>
      </td>
      <td className="py-2.5 px-3 font-mono tabular-nums text-sm">{fmtProb(position.strike)}</td>
      <td className="py-2.5 px-3 text-xs text-muted">{position.expiry}</td>
      <td className="py-2.5 px-3 font-mono tabular-nums text-sm text-center">{position.quantity}</td>
      <td className="py-2.5 px-3 font-mono tabular-nums text-sm">{fmtPremium(position.avgCost)}</td>
      <td className="py-2.5 px-3 font-mono tabular-nums text-sm">{fmtPremium(position.currentValue)}</td>
      <td className="py-2.5 px-3">
        <div className={cn('font-mono tabular-nums text-sm', pnlPositive ? 'text-green' : 'text-red')}>
          {pnlPositive ? '+' : ''}{fmtPremium(Math.abs(position.pnl))}
        </div>
        <div className={cn('text-[10px] font-mono', pnlPositive ? 'text-green/70' : 'text-red/70')}>
          {pnlPositive ? '+' : ''}{(position.pnlPct * 100).toFixed(1)}%
        </div>
      </td>
      <td className="py-2.5 px-3 font-mono tabular-nums text-xs text-muted hidden lg:table-cell">
        {fmtGreek(position.delta)}
      </td>
      <td className="py-2.5 px-3 font-mono tabular-nums text-xs text-muted hidden lg:table-cell">
        {fmtGreek(position.theta)}
      </td>
      <td className="py-2.5 px-3">
        {onClose && (
          <button
            onClick={() => onClose(position)}
            className="p-1 rounded hover:bg-red-muted text-muted hover:text-red transition-colors"
            title="Close position"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
}
