'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import PortfolioSummary from '@/components/PortfolioSummary'
import { PositionCardCompact } from '@/components/PositionCard'
import OrderHistory from '@/components/OrderHistory'
import PnlChart from '@/components/PnlChart'
import ScenarioAnalysis from '@/components/ScenarioAnalysis'
import PnlBreakdown from '@/components/PnlBreakdown'
import EVCalculator from '@/components/EVCalculator'
import { usePaperTrades } from '@/hooks/usePaperTrades'
import { fetchMarket, fetchVolatility, fetchAmericanPrice, Position } from '@/lib/api'
import { generateOrderId, MarketSnapshot, PaperOrder } from '@/lib/paperTrade'
import { cn } from '@/lib/utils'
import { ArrowLeft, RotateCcw, Wallet, Briefcase } from 'lucide-react'

export default function PortfolioPage() {
  const {
    orders, positions, balance, hydrated, equityCurve, stats, marketPrices,
    addOrder, resetPortfolio, refreshPrices,
  } = usePaperTrades()
  const [refreshing, setRefreshing] = useState(false)

  // Fetch current market data and refresh position prices
  const refreshMarketData = useCallback(async () => {
    if (orders.length === 0) return

    const uniqueMarketIds = [...new Set(orders.map(o => o.marketId))]
    const prices = new Map<string, MarketSnapshot>()

    await Promise.allSettled(
      uniqueMarketIds.map(async (id) => {
        const [market, vol] = await Promise.allSettled([
          fetchMarket(id),
          fetchVolatility(id),
        ])

        const currentProb = market.status === 'fulfilled' ? market.value.currentProb : undefined
        const impliedVol  = vol.status === 'fulfilled' ? (vol.value as any).sigma : undefined

        if (currentProb === undefined) return

        const p0    = currentProb
        const sigma = impliedVol ?? 1.5

        // Fetch American prices for every unique (strike, type, remaining-tau)
        // that belongs to an open position in this market.
        const positionKeys = new Set<string>()
        for (const o of orders) {
          if (o.marketId !== id) continue
          const daysSinceFill = (Date.now() - o.timestamp) / 86_400_000
          const remainingDays = Math.max(1, Math.round(o.daysToExpiry - daysSinceFill))
          positionKeys.add(`${o.strike}|${o.type}|${remainingDays}`)
        }

        const americanPrices = new Map<string, number>()
        await Promise.allSettled(
          [...positionKeys].map(async (key) => {
            const [strikeStr, type, tauStr] = key.split('|')
            try {
              const result = await fetchAmericanPrice({
                p0,
                strike: parseFloat(strikeStr),
                type: type as 'call' | 'put',
                tau_days: parseInt(tauStr, 10),
                sigma,
              })
              americanPrices.set(key, result.price)
            } catch {
              // Pricing service unavailable — derivePositions falls back to vanilla
            }
          })
        )

        prices.set(id, { currentProb: p0, impliedVol: sigma, americanPrices })
      })
    )

    refreshPrices(prices)
  }, [orders, refreshPrices])

  // Refresh on mount and every 30s
  useEffect(() => {
    if (!hydrated || orders.length === 0) return
    refreshMarketData()
    const interval = setInterval(refreshMarketData, 30_000)
    return () => clearInterval(interval)
  }, [hydrated, orders.length, refreshMarketData])

  const handleClosePosition = (position: Position) => {
    const snap = marketPrices.get(position.marketId)
    const closeOrder: PaperOrder = {
      id: generateOrderId(),
      timestamp: Date.now(),
      marketId: position.marketId,
      marketTitle: position.marketTitle,
      currentProbAtFill: snap?.currentProb ?? position.currentValue, // use live prob at close
      strike: position.strike,
      type: position.type,
      expiry: position.expiry,
      daysToExpiry: 0,
      side: position.side === 'long' ? 'sell' : 'buy',
      quantity: position.quantity,
      premium: position.currentValue,
      totalCost: position.currentValue * position.quantity,
      impliedVol: snap?.impliedVol ?? 1.5, // use live IV at close
      status: 'filled',
    }
    addOrder(closeOrder)
  }

  const handleReset = () => {
    if (window.confirm('Reset your paper portfolio? This clears all positions and orders.')) {
      resetPortfolio()
    }
  }

  const handleManualRefresh = async () => {
    setRefreshing(true)
    await refreshMarketData()
    setRefreshing(false)
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* ΓöÇΓöÇ Top Bar ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-muted hover:text-slate-200 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Markets
            </Link>
            <span className="text-border">/</span>
            <h1 className="text-lg font-semibold">Paper Portfolio</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Balance pill */}
            <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5">
              <Wallet className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-mono font-semibold tabular-nums text-zinc-200">
                ${balance.toFixed(2)}
              </span>
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border',
                'text-xs text-muted hover:text-zinc-200 hover:border-zinc-600 bg-surface transition-colors',
                refreshing && 'opacity-60 cursor-not-allowed'
              )}
            >
              <RotateCcw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red/30 text-xs text-red/70 hover:text-red hover:border-red/50 bg-surface transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* ΓöÇΓöÇ KPI Strip ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        {hydrated && <PortfolioSummary stats={stats} />}

        {/* ΓöÇΓöÇ Main Grid: Chart (60%) + Open Positions (40%) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: Equity Curve Chart */}
          <div className="lg:col-span-3 bg-card border border-border rounded-xl p-4 min-h-[360px]">
            <PnlChart data={equityCurve} className="h-full" />
          </div>

          {/* Right: Open Positions Sidebar */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col max-h-[420px]">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-muted" />
                <span className="text-xs text-muted uppercase tracking-wider font-medium">Open Positions</span>
              </div>
              <span className="text-[10px] text-muted font-mono">{positions.length} active</span>
            </div>

            {/* Position cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {positions.length > 0 ? (
                positions.map((pos) => (
                  <PositionCardCompact
                    key={`${pos.marketId}|${pos.strike}|${pos.type}|${pos.expiry}`}
                    position={pos}
                    onClose={handleClosePosition}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                  <Briefcase className="w-6 h-6 text-muted/40" />
                  <p className="text-xs text-muted">No open positions</p>
                  <Link
                    href="/"
                    className="text-[10px] text-accent hover:underline"
                  >
                    Browse Markets ΓåÆ
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ΓöÇΓöÇ P&L Breakdown ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        {hydrated && positions.length > 0 && (
          <PnlBreakdown positions={positions} orders={orders} marketPrices={marketPrices} />
        )}

        {/* ΓöÇΓöÇ Scenario Analysis ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        {hydrated && positions.length > 0 && (
          <ScenarioAnalysis
            positions={positions}
            orders={orders}
            balance={balance}
            marketPrices={marketPrices}
          />
        )}

        {/* ΓöÇΓöÇ EV Calculator ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        {hydrated && positions.length > 0 && (
          <EVCalculator
            positions={positions}
            orders={orders}
            marketPrices={marketPrices}
          />
        )}

        {/* ΓöÇΓöÇ Full-Width Order History ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <OrderHistory orders={orders} marketPrices={marketPrices} />

        {/* Footer */}
        <p className="text-[10px] text-muted text-center pb-4">
          Paper trading only. No real funds at risk. Prices update from live Polymarket data.
        </p>
      </div>
    </div>
  )
}
