'use client'

import { PortfolioStats } from '@/lib/paperTrade'
import { cn, fmtGreek } from '@/lib/utils'
import InfoTooltip from '@/components/InfoTooltip'

const TOOLTIPS = {
  portfolioValue: 'Cash balance plus mark-to-market value of all open positions.',
  totalPnl: 'Total profit or loss versus starting balance. Includes unrealized P&L.',
  winRate: 'Percentage of closed round-trip trades that were profitable.',
  exposure: 'Total dollar value tied up in open positions at current market prices.',
  netDelta: 'Portfolio sensitivity to a 1pp probability move across all markets.',
  netTheta: 'Daily time-decay cost across all positions.',
} as const

function KpiCell({ label, tooltip, value, sub, color }: {
  label: string; tooltip: string; value: string; sub?: string; color?: 'green' | 'red' | 'amber' | 'default'
}) {
  const valColor = color === 'green' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : color === 'amber' ? 'text-amber-400' : 'text-zinc-100'
  return (
    <div className="border-r border-zinc-800 last:border-r-0 px-3 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-mono font-bold">{label}</span>
        <InfoTooltip label={label} explanation={tooltip} side="bottom" />
      </div>
      <div className={cn('text-sm font-mono font-bold tabular-nums', valColor)}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-600 font-mono tabular-nums">{sub}</div>}
    </div>
  )
}

export default function PortfolioSummary({ stats }: { stats: PortfolioStats }) {
  const pnlColor = stats.totalPnl > 0.001 ? 'green' as const : stats.totalPnl < -0.001 ? 'red' as const : 'default' as const

  return (
    <div className="border border-zinc-800 bg-[#0c0c14] flex flex-wrap">
      <KpiCell label="Portfolio" tooltip={TOOLTIPS.portfolioValue}
        value={`$${stats.totalValue.toFixed(2)}`}
        sub={`${stats.openPositions} pos`} color="amber" />
      <KpiCell label="P&L" tooltip={TOOLTIPS.totalPnl}
        value={`${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`}
        sub={`${stats.totalPnlPct >= 0 ? '+' : ''}${(stats.totalPnlPct * 100).toFixed(2)}%`}
        color={pnlColor} />
      <KpiCell label="Win Rate" tooltip={TOOLTIPS.winRate}
        value={stats.totalTrades > 0 ? `${(stats.winRate * 100).toFixed(0)}%` : '--'}
        sub={`${stats.totalTrades} trades`} />
      <KpiCell label="Exposure" tooltip={TOOLTIPS.exposure}
        value={`$${stats.totalExposure.toFixed(2)}`} />
      <KpiCell label="Net Delta" tooltip={TOOLTIPS.netDelta}
        value={fmtGreek(stats.netDelta)}
        sub={`G ${fmtGreek(stats.netGamma)}`} />
      <KpiCell label="Net Theta" tooltip={TOOLTIPS.netTheta}
        value={fmtGreek(stats.netTheta)}
        sub={`V ${fmtGreek(stats.netVega)}`} />
    </div>
  )
}
