'use client'

import Link from 'next/link'
import { PaperOrder, MarketSnapshot } from '@/lib/paperTrade'
import { americanOptionBinomial, AMERICAN_TREE_STEPS } from '@/lib/pricing'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'
import InfoTooltip from '@/components/InfoTooltip'

interface OrderHistoryProps {
  orders: PaperOrder[]
  marketPrices?: Map<string, MarketSnapshot>
}

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Compute per-order P&L based on current market conditions */
function computeOrderPnl(
  order: PaperOrder,
  marketPrices?: Map<string, MarketSnapshot>,
): number | null {
  const snap = marketPrices?.get(order.marketId)
  if (!snap) return null

  const daysSinceFill = (Date.now() - order.timestamp) / 86_400_000
  const remainingDays = Math.max(0.1, order.daysToExpiry - daysSinceFill)
  const tau = remainingDays / 365

  const currentPremium = americanOptionBinomial(
    snap.currentProb,
    order.strike,
    snap.impliedVol,
    tau,
    AMERICAN_TREE_STEPS,
    order.type,
  )

  const diff = currentPremium - order.premium
  // Buy orders profit when premium increases, sell orders profit when premium decreases
  const pnl = order.side === 'buy'
    ? diff * order.quantity
    : -diff * order.quantity

  return pnl
}

export default function OrderHistory({ orders, marketPrices }: OrderHistoryProps) {
  if (orders.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-sm text-muted">No orders yet.</p>
        <p className="text-xs text-muted/60 mt-1">Place your first paper trade from a market page.</p>
      </div>
    )
  }

  const sorted = [...orders].sort((a, b) => b.timestamp - a.timestamp)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-xs text-muted uppercase tracking-wider font-medium">Trade History</div>
        <div className="text-[10px] text-muted font-mono">{orders.length} total</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface/50">
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Time</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Market</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Type</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Strike</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Expiry</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Side</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Qty</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Fill Price</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">
                <span className="flex items-center gap-0.5">Prob @ Fill <InfoTooltip explanation="The YES probability of this market at the exact moment you placed this order." side="bottom" /></span>
              </th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">
                <span className="flex items-center gap-0.5">Cur. Prob <InfoTooltip explanation="Current live probability fetched from Polymarket. Compare to Prob @ Fill to see how the market has moved since your entry." side="bottom" /></span>
              </th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">Total</th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">
                <span className="flex items-center gap-0.5">{'P&L'} <InfoTooltip explanation="Estimated gain or loss on this specific order leg. Calculated by repricing the option at current market conditions vs. your fill price." side="bottom" /></span>
              </th>
              <th className="text-left text-muted/80 font-medium px-3 py-2 whitespace-nowrap">
                <span className="flex items-center gap-0.5">IV <InfoTooltip explanation="Implied Volatility used to price this option at fill time. Higher IV means the market was pricing in more uncertainty." side="bottom" /></span>
              </th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {sorted.map(order => {
              const snap = marketPrices?.get(order.marketId)
              const currentProb = snap?.currentProb
              const orderPnl = computeOrderPnl(order, marketPrices)

              return (
                <tr key={order.id} className="hover:bg-surface/40 transition-colors">
                  {/* Time */}
                  <td className="px-3 py-2.5">
                    <div className="text-muted whitespace-nowrap">{timeAgo(order.timestamp)}</div>
                    <div className="text-[10px] text-muted/50">{formatDate(order.timestamp)}</div>
                  </td>

                  {/* Market */}
                  <td className="px-3 py-2.5">
                    <div className="text-zinc-200 truncate max-w-[160px]">{order.marketTitle}</div>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      'font-mono px-1.5 py-0.5 rounded text-[10px] font-bold',
                      order.type === 'call' ? 'text-green bg-green-muted' : 'text-red bg-red-muted'
                    )}>
                      {order.type.toUpperCase()}
                    </span>
                  </td>

                  {/* Strike */}
                  <td className="px-3 py-2.5 font-mono tabular-nums">{fmtProb(order.strike)}</td>

                  {/* Expiry */}
                  <td className="px-3 py-2.5 text-muted">{order.expiry}</td>

                  {/* Side */}
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      'font-medium text-[10px] uppercase',
                      order.side === 'buy' ? 'text-green' : 'text-red'
                    )}>
                      {order.side}
                    </span>
                  </td>

                  {/* Qty */}
                  <td className="px-3 py-2.5 font-mono tabular-nums text-center">{order.quantity}</td>

                  {/* Fill Price */}
                  <td className="px-3 py-2.5 font-mono tabular-nums">{fmtPremium(order.premium)}</td>

                  {/* Prob @ Fill */}
                  <td className="px-3 py-2.5 font-mono tabular-nums text-accent">
                    {fmtProb(order.currentProbAtFill, 1)}
                  </td>

                  {/* Current Prob */}
                  <td className="px-3 py-2.5 font-mono tabular-nums">
                    {currentProb !== undefined ? (
                      <span className={cn(
                        'font-medium',
                        currentProb > order.currentProbAtFill ? 'text-green' : currentProb < order.currentProbAtFill ? 'text-red' : 'text-muted'
                      )}>
                        {fmtProb(currentProb, 1)}
                      </span>
                    ) : (
                      <span className="text-muted/40">--</span>
                    )}
                  </td>

                  {/* Total */}
                  <td className="px-3 py-2.5 font-mono tabular-nums">
                    <span className={cn(
                      'font-medium',
                      order.side === 'buy' ? 'text-red' : 'text-green'
                    )}>
                      {order.side === 'buy' ? '-' : '+'}{fmtPremium(order.totalCost)}
                    </span>
                  </td>

                  {/* Per-Order P&L */}
                  <td className="px-3 py-2.5 font-mono tabular-nums">
                    {orderPnl !== null ? (
                      <span className={cn(
                        'font-semibold',
                        orderPnl >= 0 ? 'text-green' : 'text-red'
                      )}>
                        {orderPnl >= 0 ? '+' : ''}{fmtPremium(Math.abs(orderPnl))}
                      </span>
                    ) : (
                      <span className="text-muted/40">--</span>
                    )}
                  </td>

                  {/* IV */}
                  <td className="px-3 py-2.5 font-mono tabular-nums text-muted">
                    {(order.impliedVol * 100).toFixed(0)}%
                  </td>

                  {/* Link to market */}
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/market/${order.marketId}`}
                      className="text-muted hover:text-accent transition-colors"
                      title="View market"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
