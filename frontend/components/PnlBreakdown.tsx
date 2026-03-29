'use client'

/**
 * PnlBreakdown
 * ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
 * Breaks down portfolio P&L into three attribution buckets:
 *   1. Directional (╬ö) ΓÇö delta ├ù (currentProb - fillProb) ├ù qty
 *   2. Time Decay (╬ÿ)  ΓÇö theta ├ù daysSinceFill ├ù qty
 *   3. Residual        ΓÇö totalPnl - directional - timeDecay
 *
 * Per-position waterfall bars show each position's contribution to total P&L.
 *
 * Extraction: requires @/lib/api (Position), @/lib/paperTrade (PaperOrder, MarketSnapshot),
 *   @/lib/utils (cn, fmtPremium), @/components/InfoTooltip.
 */

import { useMemo } from 'react'
import { Position } from '@/lib/api'
import { PaperOrder, MarketSnapshot } from '@/lib/paperTrade'
import { cn, fmtPremium } from '@/lib/utils'
import InfoTooltip from '@/components/InfoTooltip'
import { BarChart2, TrendingUp, TrendingDown, Clock, Zap } from 'lucide-react'

// ΓöÇΓöÇΓöÇ Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

interface PnlBreakdownProps {
  positions: Position[]
  orders: PaperOrder[]
  marketPrices: Map<string, MarketSnapshot>
}

interface Attribution {
  directional: number   // ╬ö ├ù (currentProb - fillProb) ├ù qty ├ù sign
  timeDecay: number     // ╬ÿ ├ù daysSinceFill ├ù qty ├ù sign
  residual: number      // totalPnl - directional - timeDecay
  totalPnl: number
}

// ΓöÇΓöÇΓöÇ Attribution math ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * Decomposes total P&L into directional, theta-decay, and residual components.
 *
 * - Directional: delta ├ù (currentProb - fillProb)
 *   How much the probability move explains P&L movement.
 *   Uses first-order delta approximation (valid for small moves).
 *
 * - Time Decay: theta ├ù daysSinceFill
 *   Cumulative theta bleed since entry.
 *
 * - Residual: everything else ΓÇö vol changes, gamma effects, model error.
 */
function computeAttribution(
  positions: Position[],
  orders: PaperOrder[],
  marketPrices: Map<string, MarketSnapshot>,
): Attribution {
  let directional = 0
  let timeDecay = 0
  let totalPnl = 0

  for (const pos of positions) {
    const sign = pos.side === 'long' ? 1 : -1

    const ref = orders.find(
      o => o.marketId === pos.marketId && o.strike === pos.strike && o.type === pos.type
    )
    const snap = marketPrices.get(pos.marketId)

    const fillProb = ref?.currentProbAtFill ?? 0.5
    const currentProb = snap?.currentProb ?? fillProb   // falls back to fill if no live data
    const probMove = currentProb - fillProb              // how many pp the market moved

    const daysSinceFill = ref ? (Date.now() - ref.timestamp) / 86_400_000 : 0

    // Directional: delta (per-unit pp sensitivity) ├ù prob move ├ù qty
    // pos.delta is already signed for call (+) or put (-)
    const dirContrib = pos.delta * probMove * pos.quantity * sign

    // Time decay: theta is negative for long options (costs money each day)
    const thetaContrib = pos.theta * daysSinceFill * pos.quantity * sign

    directional += dirContrib
    timeDecay += thetaContrib
    totalPnl += pos.pnl
  }

  return {
    directional,
    timeDecay,
    residual: totalPnl - directional - timeDecay,
    totalPnl,
  }
}

// ΓöÇΓöÇΓöÇ Sub-components ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function AttributionCard({
  icon: Icon,
  label,
  tooltip,
  value,
  iconColor,
}: {
  icon: any
  label: string
  tooltip: string
  value: number
  iconColor: string
}) {
  const isPos = value >= 0
  return (
    <div className="bg-surface rounded-lg px-3 py-3 flex-1">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={cn('w-3.5 h-3.5', iconColor)} />
        <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
        <InfoTooltip explanation={tooltip} side="top" />
      </div>
      <div className={cn(
        'text-base font-semibold font-mono tabular-nums',
        isPos ? 'text-green' : 'text-red'
      )}>
        {isPos ? '+' : ''}{fmtPremium(Math.abs(value))}
      </div>
      <div className="text-[10px] text-muted/60 mt-0.5">
        {isPos ? 'contributed' : 'detracted'}
      </div>
    </div>
  )
}

function PositionBar({ position, maxAbs }: { position: Position; maxAbs: number }) {
  const pct = maxAbs > 0 ? Math.abs(position.pnl) / maxAbs * 100 : 0
  const isPos = position.pnl >= 0
  const shortTitle = position.marketTitle.length > 36
    ? position.marketTitle.slice(0, 34) + 'ΓÇª'
    : position.marketTitle

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400 truncate max-w-[260px]" title={position.marketTitle}>
          {shortTitle}
        </span>
        <span className={cn('font-mono font-semibold tabular-nums ml-2 shrink-0', isPos ? 'text-green' : 'text-red')}>
          {isPos ? '+' : ''}{fmtPremium(Math.abs(position.pnl))}
        </span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', isPos ? 'bg-green' : 'bg-red')}
          style={{ width: `${Math.min(100, pct)}%`, opacity: 0.8 }}
        />
      </div>
    </div>
  )
}

// ΓöÇΓöÇΓöÇ Main Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export default function PnlBreakdown({ positions, orders, marketPrices }: PnlBreakdownProps) {
  const attribution = useMemo(
    () => computeAttribution(positions, orders, marketPrices),
    [positions, orders, marketPrices]
  )

  const maxAbs = useMemo(
    () => Math.max(...positions.map(p => Math.abs(p.pnl)), 0.001),
    [positions]
  )

  if (positions.length === 0) return null

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <BarChart2 className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs text-muted uppercase tracking-wider font-medium">P&L Breakdown</span>
        <InfoTooltip
          explanation="Shows where your profits and losses are coming from ΓÇö split into market direction, time decay, and residual factors."
          side="right"
        />
      </div>

      <div className="p-4 space-y-5">
        {/* Attribution Cards */}
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            Attribution
            <InfoTooltip
              explanation="Your total P&L split into three causes. Directional = markets moving your way. Theta = time-decay cost. Residual = vol changes and other factors."
              side="right"
            />
          </div>
          <div className="flex gap-2">
            <AttributionCard
              icon={TrendingUp}
              label="Directional ╬ö"
              tooltip="How much of your P&L came from the market probability moving your way since entry. Calculated as Delta ├ù (Current Prob ΓêÆ Fill Prob) ├ù Quantity."
              value={attribution.directional}
              iconColor="text-accent"
            />
            <AttributionCard
              icon={Clock}
              label="Time Decay ╬ÿ"
              tooltip="The cumulative theta (daily decay) cost since you entered. Long options lose value each day ΓÇö this shows the total daily cost accumulated so far."
              value={attribution.timeDecay}
              iconColor="text-amber-400"
            />
            <AttributionCard
              icon={Zap}
              label="Residual"
              tooltip="P&L not explained by direction or theta. Includes implied volatility changes, convexity (gamma), and any model pricing differences."
              value={attribution.residual}
              iconColor="text-muted"
            />
          </div>
          {/* Attribution note when no live prices */}
          {marketPrices.size === 0 && (
            <p className="text-[10px] text-muted/50 mt-2">
              Directional attribution requires live prices ΓÇö hit Refresh to load them.
            </p>
          )}
        </div>

        {/* Per-position waterfall */}
        <div>
          <div className="text-[10px] text-muted uppercase tracking-wider mb-3 flex items-center gap-1">
            Per-Position Contribution
            <InfoTooltip
              explanation="Each bar shows how much that position is currently contributing to your total P&L. Longer bar = bigger impact (positive or negative)."
              side="right"
            />
          </div>
          <div className="space-y-3">
            {[...positions]
              .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
              .map(pos => (
                <PositionBar
                  key={`${pos.marketId}|${pos.strike}|${pos.type}`}
                  position={pos}
                  maxAbs={maxAbs}
                />
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
