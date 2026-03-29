'use client'

import { cn, fmtProb, fmtPremium, fmtPct } from '@/lib/utils'
import { OptionQuote } from '@/lib/api'

interface OptionRowProps {
  option: OptionQuote
  currentProb: number
  onSelect: (opt: OptionQuote) => void
  selected?: boolean
  showGreeks?: boolean
}

function GreekCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center min-w-[52px]">
      <div className="text-[9px] text-zinc-600 font-medium">{label}</div>
      <div className={cn('text-[11px] font-mono tabular-nums', color ?? 'text-zinc-400')}>{value}</div>
    </div>
  )
}

export default function OptionRow({
  option,
  currentProb,
  onSelect,
  selected,
  showGreeks,
}: OptionRowProps) {
  const isCall = option.type === 'call'
  const atm = Math.abs(option.strike - currentProb) < 0.05
  const changeUp = option.premiumChangePct >= 0

  // Color-code delta based on magnitude
  const deltaColor = Math.abs(option.delta) > 0.3
    ? 'text-emerald-400'
    : Math.abs(option.delta) > 0.1
      ? 'text-zinc-300'
      : 'text-zinc-500'

  return (
    <button
      onClick={() => onSelect(option)}
      className={cn(
        'w-full text-left flex items-center px-3 py-2.5 transition-colors',
        'border-b border-border/30 last:border-0',
        atm && 'row-atm',
        option.isITM && !atm && 'row-itm',
        selected ? 'bg-accent/8 border-l-2 border-l-accent' : 'hover:bg-card-hover',
      )}
    >
      {/* Strike */}
      <div className="w-[14%] shrink-0">
        <div className={cn(
          'text-sm font-mono tabular-nums',
          atm ? 'text-accent font-semibold' : option.isITM ? 'text-zinc-200' : 'text-muted-fg'
        )}>
          {fmtProb(option.strike)}
        </div>
        {atm && (
          <div className="text-[10px] text-accent/60 mt-0.5 font-medium">ATM</div>
        )}
      </div>

      {/* Breakeven */}
      <div className="w-[16%] shrink-0">
        <div className="text-xs text-muted-fg font-mono tabular-nums">{fmtProb(option.breakeven, 1)}</div>
        <div className={cn(
          'text-[10px] mt-0.5 tabular-nums',
          option.breakevenDelta >= 0 ? 'text-green' : 'text-red'
        )}>
          {option.breakevenDelta >= 0 ? '+' : ''}{(option.breakevenDelta * 100).toFixed(1)}pp
        </div>
      </div>

      {/* Greeks */}
      {showGreeks && (
        <div className="flex-1 hidden md:flex items-center justify-center gap-1">
          <GreekCell label="Delta" value={option.delta.toFixed(3)} color={deltaColor} />
          <GreekCell label="Gamma" value={option.gamma.toFixed(4)} color="text-blue-400" />
          <GreekCell label="Theta" value={option.theta.toFixed(4)} color="text-red-400" />
          <GreekCell label="Vega" value={option.vega.toFixed(3)} color="text-violet-400" />
        </div>
      )}

      {/* Premium */}
      <div className="ml-auto text-right shrink-0 pl-3">
        <div className={cn(
          'text-sm font-mono font-medium tabular-nums',
          isCall ? 'text-green' : 'text-red'
        )}>
          {fmtPremium(option.premium)}
        </div>
        <div className={cn(
          'text-[10px] tabular-nums',
          changeUp ? 'text-green/70' : 'text-red/70'
        )}>
          {changeUp ? '+' : ''}{fmtPct(option.premiumChangePct)}
        </div>
      </div>
    </button>
  )
}

export function OptionChainHeader({ showGreeks }: { showGreeks?: boolean }) {
  return (
    <div className="flex items-center px-3 py-2 bg-surface border-b border-border sticky top-0 z-10">
      <div className="w-[14%] shrink-0 text-[10px] font-medium text-muted uppercase tracking-wider">Strike</div>
      <div className="w-[16%] shrink-0 text-[10px] font-medium text-muted uppercase tracking-wider">Breakeven</div>
      {showGreeks && (
        <div className="flex-1 hidden md:flex items-center justify-center gap-1">
          <div className="text-[10px] font-medium text-muted uppercase tracking-wider min-w-[52px] text-center">Delta</div>
          <div className="text-[10px] font-medium text-muted uppercase tracking-wider min-w-[52px] text-center">Gamma</div>
          <div className="text-[10px] font-medium text-muted uppercase tracking-wider min-w-[52px] text-center">Theta</div>
          <div className="text-[10px] font-medium text-muted uppercase tracking-wider min-w-[52px] text-center">Vega</div>
        </div>
      )}
      <div className="ml-auto text-[10px] font-medium text-muted uppercase tracking-wider pl-3">Premium</div>
    </div>
  )
}
