'use client'

/**
 * EVCalculator
 * ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
 * Expected Value calculator for open positions.
 *
 * For each position, computes:
 *   EV = currentOptionValue - avgCostPaid  (per contract, and total)
 *   Breakeven Prob = minimum market probability at which EV turns positive
 *     (solved via binary search on vanillaCall/vanillaPut)
 *
 * Shows a color-coded POSITIVE / NEGATIVE EV badge per position.
 *
 * Extraction: requires @/lib/api (Position), @/lib/paperTrade (PaperOrder),
 *   @/lib/pricing (vanillaCall, vanillaPut), @/lib/utils (cn, fmtProb, fmtPremium),
 *   @/components/InfoTooltip.
 */

import { useMemo } from 'react'
import { Position } from '@/lib/api'
import { PaperOrder, MarketSnapshot } from '@/lib/paperTrade'
import { vanillaCall, vanillaPut } from '@/lib/pricing'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import InfoTooltip from '@/components/InfoTooltip'
import { Calculator, TrendingUp, TrendingDown } from 'lucide-react'

// ΓöÇΓöÇΓöÇ Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

interface EVCalculatorProps {
  positions: Position[]
  orders: PaperOrder[]
  marketPrices: Map<string, MarketSnapshot>
}

interface PositionEV {
  position: Position
  evPerContract: number
  evTotal: number
  breakevenProb: number | null
  currentProb: number
  impliedVol: number
  tau: number
}

// ΓöÇΓöÇΓöÇ Binary search for breakeven probability ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * Find the market probability at which a position's option price equals avgCost.
 * Returns null if no breakeven exists in [0.01, 0.99].
 */
function findBreakevenProb(
  type: 'call' | 'put',
  strike: number,
  avgCost: number,
  impliedVol: number,
  tau: number,
  maxIter = 40,
): number | null {
  const fn = (p: number) =>
    type === 'call'
      ? vanillaCall(p, strike, impliedVol, tau) - avgCost
      : vanillaPut(p, strike, impliedVol, tau) - avgCost

  // Check if breakeven exists in range
  if (fn(0.01) * fn(0.99) > 0) return null

  let lo = 0.01
  let hi = 0.99
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2
    if (fn(mid) < 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// ΓöÇΓöÇΓöÇ EV computation ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function computePositionEVs(
  positions: Position[],
  orders: PaperOrder[],
  marketPrices: Map<string, MarketSnapshot>,
): PositionEV[] {
  return positions.map(pos => {
    const snap = marketPrices.get(pos.marketId)
    const ref = orders.find(
      o => o.marketId === pos.marketId && o.strike === pos.strike && o.type === pos.type
    )

    const currentProb = snap?.currentProb ?? ref?.currentProbAtFill ?? 0.5
    const impliedVol = snap?.impliedVol ?? ref?.impliedVol ?? 1.5
    const daysSinceFill = ref ? (Date.now() - ref.timestamp) / 86_400_000 : 0
    const remainingDays = Math.max(0.1, (ref?.daysToExpiry ?? 7) - daysSinceFill)
    const tau = remainingDays / 365

    // EV = current market value of option - what you paid for it
    const currentValue = pos.type === 'call'
      ? vanillaCall(currentProb, pos.strike, impliedVol, tau)
      : vanillaPut(currentProb, pos.strike, impliedVol, tau)

    const sign = pos.side === 'long' ? 1 : -1
    const evPerContract = sign * (currentValue - pos.avgCost)
    const evTotal = evPerContract * pos.quantity

    const breakevenProb = findBreakevenProb(pos.type, pos.strike, pos.avgCost, impliedVol, tau)

    return { position: pos, evPerContract, evTotal, breakevenProb, currentProb, impliedVol, tau }
  })
}

// ΓöÇΓöÇΓöÇ Row Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function EVRow({ ev }: { ev: PositionEV }) {
  const { position, evPerContract, evTotal, breakevenProb, currentProb } = ev
  const isPositive = evTotal > 0
  const shortTitle = position.marketTitle.length > 38
    ? position.marketTitle.slice(0, 36) + 'ΓÇª'
    : position.marketTitle

  return (
    <div className="rounded-lg border border-border/50 bg-surface/40 px-3 py-2.5 space-y-2">
      {/* Title + badge */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-zinc-300 leading-snug" title={position.marketTitle}>
          {shortTitle}
        </span>
        <span className={cn(
          'shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
          isPositive
            ? 'bg-green-muted text-green'
            : 'bg-red-muted text-red'
        )}>
          {isPositive ? '+ Positive EV' : 'ΓêÆ Negative EV'}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        {/* EV per contract */}
        <div>
          <div className="text-muted/70 flex items-center gap-0.5">
            EV / contract
            <InfoTooltip
              explanation="How much you expect to gain or lose per option contract at the current market probability. Positive = the market is offering you edge."
              side="top"
            />
          </div>
          <div className={cn('font-mono font-semibold mt-0.5', isPositive ? 'text-green' : 'text-red')}>
            {isPositive ? '+' : ''}{fmtPremium(Math.abs(evPerContract))}
          </div>
        </div>

        {/* Total EV */}
        <div>
          <div className="text-muted/70 flex items-center gap-0.5">
            Total EV
            <InfoTooltip
              explanation="EV per contract multiplied by your position size. This is the total expected edge (or drag) from this position."
              side="top"
            />
          </div>
          <div className={cn('font-mono font-semibold mt-0.5', isPositive ? 'text-green' : 'text-red')}>
            {isPositive ? '+' : ''}{fmtPremium(Math.abs(evTotal))}
          </div>
        </div>

        {/* Breakeven prob */}
        <div>
          <div className="text-muted/70 flex items-center gap-0.5">
            Breakeven
            <InfoTooltip
              explanation="The market probability at which this position would exactly break even at current pricing. If current prob is above this (for a call) you're in the money on EV."
              side="top"
            />
          </div>
          <div className="font-mono font-semibold mt-0.5 text-zinc-300">
            {breakevenProb !== null ? fmtProb(breakevenProb, 1) : 'N/A'}
            {breakevenProb !== null && (
              <span className={cn('text-[9px] ml-1', currentProb > breakevenProb ? 'text-green' : 'text-red')}>
                {currentProb > breakevenProb
                  ? `Γû▓ ${((currentProb - breakevenProb) * 100).toFixed(1)}pp above`
                  : `Γû╝ ${((breakevenProb - currentProb) * 100).toFixed(1)}pp below`
                }
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ΓöÇΓöÇΓöÇ Main Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export default function EVCalculator({ positions, orders, marketPrices }: EVCalculatorProps) {
  const evData = useMemo(
    () => computePositionEVs(positions, orders, marketPrices),
    [positions, orders, marketPrices]
  )

  const totalEV = evData.reduce((s, e) => s + e.evTotal, 0)
  const positiveCount = evData.filter(e => e.evTotal > 0).length

  if (positions.length === 0) return null

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs text-muted uppercase tracking-wider font-medium">EV Calculator</span>
          <InfoTooltip
            label="Expected Value Calculator"
            explanation="Expected Value (EV) measures the probabilistic edge of each position. A positive-EV position means the market is currently pricing this option at a discount to what the current probability implies it should be worth."
            side="right"
          />
        </div>

        {/* Portfolio EV summary */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">
            {positiveCount}/{evData.length} positions positive
          </span>
          <div className={cn(
            'flex items-center gap-1 text-xs font-mono font-semibold',
            totalEV >= 0 ? 'text-green' : 'text-red'
          )}>
            {totalEV >= 0
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />
            }
            Portfolio EV: {totalEV >= 0 ? '+' : ''}{fmtPremium(Math.abs(totalEV))}
          </div>
        </div>
      </div>

      {/* EV rows */}
      <div className="p-4 space-y-3">
        {evData.map(ev => (
          <EVRow
            key={`${ev.position.marketId}|${ev.position.strike}|${ev.position.type}`}
            ev={ev}
          />
        ))}
      </div>

      <div className="px-4 pb-3 text-[10px] text-muted/50 text-center">
        EV is based on current option pricing vs. your fill price. Refresh to update probabilities.
      </div>
    </div>
  )
}
