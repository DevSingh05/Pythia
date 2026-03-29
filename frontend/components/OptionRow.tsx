'use client'

import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { OptionQuote } from '@/lib/api'

interface OptionRowProps {
  option: OptionQuote
  currentProb: number
  onSelect: (opt: OptionQuote) => void
  selected?: boolean
  showGreeks?: boolean
}

/**
 * Format a Greek value with adaptive precision.
 * - Values that round to zero at the given precision → "—" (negligible)
 * - Small but non-zero → shown with enough precision to be visible
 * - Strips "-0.0000" artifacts
 */
function fmtG(v: number, decimals: number): string {
  const abs = Math.abs(v)
  // Truly negligible — show dash
  if (abs < Math.pow(10, -(decimals + 2))) return '—'
  const s = v.toFixed(decimals)
  if (parseFloat(s) === 0) return (0).toFixed(decimals)
  return s
}

/**
 * Format theta/vega in cents (×100) for readability.
 * Dollar values like -0.0002 become -0.02¢ — non-zero and meaningful.
 */
function fmtCents(v: number): string {
  const cents = v * 100
  const abs = Math.abs(cents)
  if (abs < 0.005) return '—'
  return cents.toFixed(2)
}

function GreekCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center min-w-[56px]">
      <div className="text-[9px] text-zinc-600 font-medium uppercase tracking-wider">{label}</div>
      <div className={cn('text-[11px] font-mono tabular-nums mt-0.5', color ?? 'text-zinc-400')}>{value}</div>
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
  const atm = Math.abs(option.strike - currentProb) < 0.025
  const changeUp = option.premiumChangePct >= 0

  // Moneyness label
  const moneyness = atm ? 'ATM' : option.isITM ? 'ITM' : 'OTM'
  const moneynessColor = atm
    ? 'text-amber-400'
    : option.isITM
      ? 'text-emerald-400/60'
      : 'text-zinc-600'

  // Delta color by magnitude
  const absDelta = Math.abs(option.delta)
  const deltaColor = absDelta > 0.4
    ? 'text-emerald-400'
    : absDelta > 0.2
      ? 'text-zinc-300'
      : 'text-zinc-500'

  return (
    <button
      onClick={() => onSelect(option)}
      className={cn(
        'w-full text-left grid items-center px-3 py-3 transition-all duration-150',
        'border-b border-zinc-800/40 last:border-0',
        showGreeks
          ? 'grid-cols-[72px_80px_1fr_80px]'
          : 'grid-cols-[72px_80px_1fr_80px]',
        atm && 'bg-amber-500/[0.04]',
        option.isITM && !atm && 'bg-emerald-500/[0.02]',
        selected
          ? 'bg-accent/8 ring-1 ring-inset ring-accent/30'
          : 'hover:bg-zinc-800/40',
      )}
    >
      {/* Strike + moneyness */}
      <div>
        <div className={cn(
          'text-sm font-mono tabular-nums font-semibold',
          atm ? 'text-amber-400' : option.isITM ? 'text-zinc-100' : 'text-zinc-400'
        )}>
          {fmtProb(option.strike)}
        </div>
        <div className={cn('text-[9px] font-medium mt-0.5 uppercase tracking-wider', moneynessColor)}>
          {moneyness}
        </div>
      </div>

      {/* Breakeven */}
      <div>
        <div className="text-xs text-zinc-400 font-mono tabular-nums">{fmtProb(option.breakeven, 1)}</div>
        <div className={cn(
          'text-[10px] mt-0.5 font-mono tabular-nums',
          option.breakevenDelta >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'
        )}>
          {option.breakevenDelta >= 0 ? '+' : ''}{(option.breakevenDelta * 100).toFixed(1)}pp
        </div>
      </div>

      {/* Greeks */}
      {showGreeks && (
        <div className="flex items-center justify-center gap-2">
          <GreekCell label="Delta" value={fmtG(option.delta, 3)} color={deltaColor} />
          <GreekCell label="Gamma" value={fmtG(option.gamma, 4)} color="text-blue-400" />
          <GreekCell label="Θ ¢/day" value={fmtCents(option.theta)} color="text-red-400/80" />
          <GreekCell label="ν ¢/σ%" value={fmtCents(option.vega)} color="text-violet-400" />
        </div>
      )}

      {/* Premium + change */}
      <div className="text-right flex items-center justify-end gap-2">
        <div>
          <div className={cn(
            'text-sm font-mono font-bold tabular-nums',
            isCall ? 'text-emerald-400' : 'text-red-400'
          )}>
            {fmtPremium(option.premium)}
          </div>
          <div className={cn(
            'text-[10px] font-mono tabular-nums',
            changeUp ? 'text-emerald-500/60' : 'text-red-500/60'
          )}>
            {changeUp ? '+' : ''}{(option.premiumChangePct * 100).toFixed(1)}%
          </div>
        </div>
        <div className={cn(
          'w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-colors shrink-0',
          selected
            ? 'bg-accent text-white'
            : isCall
              ? 'border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15'
              : 'border border-red-500/40 text-red-400 hover:bg-red-500/15'
        )}>
          +
        </div>
      </div>
    </button>
  )
}

export function OptionChainHeader({ showGreeks }: { showGreeks?: boolean }) {
  return (
    <div className={cn(
      'grid items-center px-3 py-2 bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10',
      showGreeks
        ? 'grid-cols-[72px_80px_1fr_80px]'
        : 'grid-cols-[72px_80px_1fr_80px]',
    )}>
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Strike</div>
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Break­even</div>
      {showGreeks && (
        <div className="flex items-center justify-center gap-2">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[56px] text-center">Delta</div>
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[56px] text-center">Gamma</div>
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[56px] text-center">Θ ¢/day</div>
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[56px] text-center">ν ¢/σ%</div>
        </div>
      )}
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider text-right pr-8">Premium</div>
    </div>
  )
}
