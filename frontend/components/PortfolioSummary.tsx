'use client'

/**
 * PortfolioSummary
 * ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
 * Compact 6-pill KPI strip with InfoTooltip explanations on each metric.
 * Accepts a pre-computed PortfolioStats object from usePaperTrades().
 *
 * Extraction: requires InfoTooltip, @/lib/paperTrade (PortfolioStats), @/lib/utils.
 */

import { PortfolioStats } from '@/lib/paperTrade'
import { cn, fmtGreek } from '@/lib/utils'
import InfoTooltip from '@/components/InfoTooltip'
import { TrendingUp, TrendingDown, Target, Shield, Activity, Zap } from 'lucide-react'

// ΓöÇΓöÇΓöÇ Tooltip copy ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

const TOOLTIPS = {
  portfolioValue:
    'Your current cash balance plus the mark-to-market value of all open positions at today\'s option prices.',
  totalPnl:
    'Total profit or loss versus your starting balance of $10,000. Includes unrealized gains/losses on open positions.',
  winRate:
    'Percentage of fully closed trades (buy + sell round-trips) where you sold for more than you paid. Requires at least one closed position.',
  exposure:
    'Total dollar value tied up in open option positions at current market prices. Higher exposure = more capital at risk.',
  netDelta:
    'How much your total portfolio value changes for every 1 percentage-point move across all your markets. Positive = you profit if markets go up; negative = you profit if they go down.',
  netTheta:
    'Daily time-decay cost across all positions. Negative means time is eroding the value of your options day by day. Long options have negative theta.',
} as const

// ΓöÇΓöÇΓöÇ KpiPill ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

interface KpiPillProps {
  icon: any
  label: string
  tooltip: string
  value: string
  sub?: string
  color?: 'green' | 'red' | 'accent' | 'muted'
}

function KpiPill({ icon: Icon, label, tooltip, value, sub, color }: KpiPillProps) {
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-center gap-3 min-w-0">
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
        color === 'green' && 'bg-green-muted',
        color === 'red' && 'bg-red-muted',
        color === 'accent' && 'bg-accent-muted',
        (!color || color === 'muted') && 'bg-surface',
      )}>
        <Icon className={cn(
          'w-4 h-4',
          color === 'green' && 'text-green',
          color === 'red' && 'text-red',
          color === 'accent' && 'text-accent',
          (!color || color === 'muted') && 'text-muted',
        )} />
      </div>
      <div className="min-w-0 flex-1">
        {/* Label + tooltip icon */}
        <div className="flex items-center gap-1 leading-none">
          <span className="text-[10px] text-muted uppercase tracking-wider">{label}</span>
          <InfoTooltip label={label} explanation={tooltip} side="bottom" />
        </div>
        <div className={cn(
          'text-sm font-semibold font-mono tabular-nums mt-0.5 truncate',
          color === 'green' && 'text-green',
          color === 'red' && 'text-red',
          color === 'accent' && 'text-accent',
          (!color || color === 'muted') && 'text-zinc-100',
        )}>
          {value}
        </div>
        {sub && <div className="text-[10px] text-muted font-mono leading-none mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ΓöÇΓöÇΓöÇ Main Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

interface PortfolioSummaryProps {
  stats: PortfolioStats
}

export default function PortfolioSummary({ stats }: PortfolioSummaryProps) {
  const pnlColor = stats.totalPnl > 0.001 ? 'green' : stats.totalPnl < -0.001 ? 'red' : 'muted'
  const PnlIcon = stats.totalPnl >= 0 ? TrendingUp : TrendingDown

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      <KpiPill
        icon={Activity}
        label="Portfolio Value"
        tooltip={TOOLTIPS.portfolioValue}
        value={`$${stats.totalValue.toFixed(2)}`}
        sub={`${stats.openPositions} position${stats.openPositions !== 1 ? 's' : ''}`}
        color="accent"
      />
      <KpiPill
        icon={PnlIcon}
        label="Total P&L"
        tooltip={TOOLTIPS.totalPnl}
        value={`${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`}
        sub={`${stats.totalPnlPct >= 0 ? '+' : ''}${(stats.totalPnlPct * 100).toFixed(2)}%`}
        color={pnlColor}
      />
      <KpiPill
        icon={Target}
        label="Win Rate"
        tooltip={TOOLTIPS.winRate}
        value={stats.totalTrades > 0 ? `${(stats.winRate * 100).toFixed(0)}%` : '--'}
        sub={`${stats.totalTrades} trade${stats.totalTrades !== 1 ? 's' : ''}`}
      />
      <KpiPill
        icon={Shield}
        label="Exposure"
        tooltip={TOOLTIPS.exposure}
        value={`$${stats.totalExposure.toFixed(2)}`}
      />
      <KpiPill
        icon={Zap}
        label="Net Delta"
        tooltip={TOOLTIPS.netDelta}
        value={fmtGreek(stats.netDelta)}
        sub={`╬ô ${fmtGreek(stats.netGamma)}`}
      />
      <KpiPill
        icon={Activity}
        label="Net Theta"
        tooltip={TOOLTIPS.netTheta}
        value={fmtGreek(stats.netTheta)}
        sub={`╬╜ ${fmtGreek(stats.netVega)}`}
      />
    </div>
  )
}
