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
      <div className="w-[18%] shrink-0">
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
      <div className="w-[27%] shrink-0">
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
        <div className="w-[28%] shrink-0 hidden md:flex gap-4">
          {[
            { label: 'Δ', value: option.delta.toFixed(3) },
            { label: 'Θ', value: option.theta.toFixed(3) },
            { label: 'ν', value: option.vega.toFixed(3) },
          ].map(({ label, value }) => (
            <div key={label} className="text-[10px] font-mono">
              <div className="text-muted">{label}</div>
              <div className="text-muted-fg tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Premium */}
      <div className="ml-auto text-right">
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
      <div className="w-[18%] shrink-0 text-[10px] font-medium text-muted uppercase tracking-wider">Strike</div>
      <div className="w-[27%] shrink-0 text-[10px] font-medium text-muted uppercase tracking-wider">Breakeven</div>
      {showGreeks && (
        <div className="w-[28%] shrink-0 hidden md:block text-[10px] font-medium text-muted uppercase tracking-wider">Greeks</div>
      )}
      <div className="ml-auto text-[10px] font-medium text-muted uppercase tracking-wider">Premium</div>
    </div>
  )
}
