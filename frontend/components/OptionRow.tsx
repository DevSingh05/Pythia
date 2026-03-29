'use client'

import type { KeyboardEvent } from 'react'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { OptionQuote } from '@/lib/api'

interface OptionRowProps {
  option: OptionQuote
  currentProb: number
  onSelect: (opt: OptionQuote) => void
  /** Row + only — starts paper demo / simulated book; does not run on full-row click. */
  onAddToPaperDemo?: (opt: OptionQuote) => void
  selected?: boolean
  showGreeks?: boolean
  liquidityScore?: number   // 0–1, drives left border heat stripe
  isDemoHighlighted?: boolean  // amber pulse ring when demo is selecting this row
  isDemoSelecting?: boolean    // shimmer sweep when demo phase === 'selecting'
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
  onAddToPaperDemo,
  selected,
  showGreeks,
  liquidityScore = 0,
  isDemoHighlighted = false,
  isDemoSelecting = false,
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

  // Liquidity heat: interpolate from transparent → emerald at liquidityScore
  const heatAlpha = liquidityScore * 0.55
  const heatColor = `rgba(16,185,129,${heatAlpha})`

  const handleRowKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(option)
    }
  }

  return (
    <div
      tabIndex={0}
      data-demo-strike={option.strike}
      aria-label={`Select ${option.type} ${fmtProb(option.strike)}`}
      onClick={() => onSelect(option)}
      onKeyDown={handleRowKeyDown}
      className={cn(
        'w-full text-left grid items-center px-3 py-3 transition-all duration-150 relative overflow-hidden cursor-pointer',
        'border-b border-zinc-800/40 last:border-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40',
        showGreeks
          ? 'grid-cols-[72px_80px_1fr_80px]'
          : 'grid-cols-[72px_80px_1fr_80px]',
        atm && 'bg-amber-500/[0.04]',
        option.isITM && !atm && 'bg-emerald-500/[0.02]',
        selected
          ? 'bg-accent/8 ring-1 ring-inset ring-accent/30'
          : 'hover:bg-zinc-800/40',
        isDemoHighlighted && 'ring-1 ring-inset ring-amber-400/50 bg-amber-500/[0.06]',
      )}
      style={{
        borderLeft: liquidityScore > 0.05 ? `3px solid ${heatColor}` : undefined,
      }}
    >
      {/* Liquidity shimmer sweep during demo selecting */}
      {isDemoSelecting && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(105deg, transparent 35%, rgba(168,85,247,0.14) 50%, transparent 65%)',
            backgroundSize: '220% 100%',
            animation: 'liquidityShimmer 1.4s ease-in-out infinite',
          }}
        />
      )}
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
          <GreekCell label="Delta" value={option.delta.toFixed(3)} color={deltaColor} />
          <GreekCell label="Gamma" value={option.gamma.toFixed(4)} color="text-blue-400" />
          <GreekCell label="Theta" value={option.theta.toFixed(4)} color="text-red-400/80" />
          <GreekCell label="Vega" value={option.vega.toFixed(3)} color="text-violet-400" />
        </div>
      )}

      {/* Premium + add (demo) — + does not select row */}
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
        {onAddToPaperDemo ? (
          <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onAddToPaperDemo(option)
              }}
              aria-label="Add to paper order book"
              className={cn(
                'w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-colors shrink-0',
                selected
                  ? 'bg-accent text-white'
                  : isCall
                    ? 'border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15'
                    : 'border border-red-500/40 text-red-400 hover:bg-red-500/15'
              )}
            >
              +
            </button>
          </div>
        ) : (
          <div className="w-6 h-6 shrink-0" aria-hidden />
        )}
      </div>
    </div>
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
          <div
            className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[56px] text-center cursor-help"
            title="∂V/∂p on [0,1]; multiply by 0.01 for $ per 1pp (see Greeks panel)"
          >
            Delta
          </div>
          <div
            className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[56px] text-center cursor-help"
            title="Δ(∂V/∂p) per +1pp in YES"
          >
            Gamma
          </div>
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[56px] text-center">Theta</div>
          <div
            className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider min-w-[56px] text-center cursor-help"
            title="∂V/∂σ; ×0.01 for $ when σ moves 0.01 (e.g. 30%→31%)"
          >
            Vega
          </div>
        </div>
      )}
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider text-right pr-8">Premium</div>
    </div>
  )
}
