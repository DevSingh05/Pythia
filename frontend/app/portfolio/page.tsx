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
import PortfolioBacktest from '@/components/PortfolioBacktest'
import { usePaperTrades } from '@/hooks/usePaperTrades'
import { fetchMarket, fetchOptionsChain, fetchAmericanPrice, Position } from '@/lib/api'
import { generateOrderId, MarketSnapshot, PaperOrder } from '@/lib/paperTrade'
import { cn } from '@/lib/utils'
import { ArrowLeft, RotateCcw, Wallet, Briefcase } from 'lucide-react'
import { StarButton } from '@/components/ui/star-button'

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
        const [market, chain] = await Promise.allSettled([
          fetchMarket(id),
          fetchOptionsChain(id),
        ])

        const currentProb = market.status === 'fulfilled' ? market.value.currentProb : undefined
        const impliedVol  = chain.status === 'fulfilled' ? chain.value.impliedVol : undefined

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
              // /api/price failed — derivePositions uses local American binomial
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

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Top bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-muted hover:text-slate-200 text-sm transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Markets
            </Link>
            <span className="text-border shrink-0">/</span>
            <h1 className="text-base sm:text-lg font-semibold truncate">Paper Portfolio</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
            <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 sm:px-3 py-1.5">
              <Wallet className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-xs font-mono font-semibold tabular-nums text-zinc-200">
                ${balance.toFixed(2)}
              </span>
            </div>

            <StarButton
              size="sm"
              variant="ghost"
              onClick={handleManualRefresh}
              disabled={refreshing}
            >
              <RotateCcw className={cn('w-3 h-3 shrink-0', refreshing && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </StarButton>
            <StarButton size="sm" variant="danger" onClick={handleReset}>
              <span className="sm:hidden">Reset</span>
              <span className="hidden sm:inline">Reset portfolio</span>
            </StarButton>
          </div>
        </div>

        {/* KPI strip */}
        {hydrated && <PortfolioSummary stats={stats} />}

        {/* Main grid: chart + positions */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 bg-card border border-border rounded-xl p-3 sm:p-4 min-h-[320px] sm:min-h-[360px]">
            <PnlChart data={equityCurve} className="h-full" />
          </div>

          {/* Right: Open Positions Sidebar */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col max-h-[min(420px,55vh)] lg:max-h-[420px]">
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
                    Browse markets →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Backtest simulator */}
        {hydrated && positions.length > 0 && (
          <PortfolioBacktest positions={positions} orders={orders} />
        )}

        {/* P&L breakdown */}
        {hydrated && positions.length > 0 && (
          <PnlBreakdown positions={positions} orders={orders} marketPrices={marketPrices} />
        )}

        {/* Scenario analysis */}
        {hydrated && positions.length > 0 && (
          <ScenarioAnalysis
            positions={positions}
            orders={orders}
            balance={balance}
            marketPrices={marketPrices}
          />
        )}

        {/* EV calculator */}
        {hydrated && positions.length > 0 && (
          <EVCalculator
            positions={positions}
            orders={orders}
            marketPrices={marketPrices}
          />
        )}

        {/* Order history */}
        <OrderHistory orders={orders} marketPrices={marketPrices} />

        {/* Footer */}
        <p className="text-[10px] text-muted text-center pb-4">
          Paper trading only. No real funds at risk. Prices update from live Polymarket data.
        </p>
      </div>
    </div>
  )
}
