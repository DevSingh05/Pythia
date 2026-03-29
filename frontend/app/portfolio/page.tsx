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

export default function PortfolioPage() {
  const {
    orders, positions, balance, hydrated, equityCurve, stats, marketPrices,
    addOrder, resetPortfolio, refreshPrices,
  } = usePaperTrades()
  const [refreshing, setRefreshing] = useState(false)

  const refreshMarketData = useCallback(async () => {
    if (orders.length === 0) return
    const uniqueMarketIds = [...new Set(orders.map(o => o.marketId))]
    const prices = new Map<string, MarketSnapshot>()
    await Promise.allSettled(
      uniqueMarketIds.map(async (id) => {
        const [market, chain] = await Promise.allSettled([fetchMarket(id), fetchOptionsChain(id)])
        const currentProb = market.status === 'fulfilled' ? market.value.currentProb : undefined
        const impliedVol  = chain.status === 'fulfilled' ? chain.value.impliedVol : undefined
        if (currentProb === undefined) return
        const p0 = currentProb, sigma = impliedVol ?? 1.5
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
              const result = await fetchAmericanPrice({ p0, strike: parseFloat(strikeStr), type: type as 'call' | 'put', tau_days: parseInt(tauStr, 10), sigma })
              americanPrices.set(key, result.price)
            } catch {}
          })
        )
        prices.set(id, { currentProb: p0, impliedVol: sigma, americanPrices })
      })
    )
    refreshPrices(prices)
  }, [orders, refreshPrices])

  useEffect(() => {
    if (!hydrated || orders.length === 0) return
    refreshMarketData()
    const interval = setInterval(refreshMarketData, 30_000)
    return () => clearInterval(interval)
  }, [hydrated, orders.length, refreshMarketData])

  const handleClosePosition = (position: Position) => {
    const snap = marketPrices.get(position.marketId)
    const closeOrder: PaperOrder = {
      id: generateOrderId(), timestamp: Date.now(), marketId: position.marketId,
      marketTitle: position.marketTitle, currentProbAtFill: snap?.currentProb ?? position.currentValue,
      strike: position.strike, type: position.type, expiry: position.expiry, daysToExpiry: 0,
      side: position.side === 'long' ? 'sell' : 'buy', quantity: position.quantity,
      premium: position.currentValue, totalCost: position.currentValue * position.quantity,
      impliedVol: snap?.impliedVol ?? 1.5, status: 'filled',
    }
    addOrder(closeOrder)
  }

  const handleReset = () => {
    if (window.confirm('Reset your paper portfolio? This clears all positions and orders.')) resetPortfolio()
  }

  const handleManualRefresh = async () => { setRefreshing(true); await refreshMarketData(); setRefreshing(false) }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <Navbar />

      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4 space-y-3">
        {/* Top bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 text-xs font-mono transition-colors shrink-0">
              <ArrowLeft className="w-3 h-3" /> MKTS
            </Link>
            <span className="text-zinc-700 shrink-0">/</span>
            <h1 className="text-sm font-mono font-bold text-zinc-200 uppercase tracking-wider truncate">Paper Portfolio</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-2 py-1">
              <Wallet className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="text-xs font-mono font-bold tabular-nums text-zinc-100">${balance.toFixed(2)}</span>
            </div>
            <button onClick={handleManualRefresh} disabled={refreshing}
              className="border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40">
              <RotateCcw className={cn('w-3 h-3 inline mr-1', refreshing && 'animate-spin')} />REFRESH
            </button>
            <button onClick={handleReset}
              className="border border-red-900/50 bg-red-950/30 px-2 py-1 text-[10px] font-mono text-red-400 hover:bg-red-950/50 hover:border-red-800 transition-colors">
              RESET
            </button>
          </div>
        </div>

        {/* KPI strip */}
        {hydrated && <PortfolioSummary stats={stats} />}

        {/* Main grid: chart + positions */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-px bg-zinc-800">
          <div className="lg:col-span-3 bg-[#0c0c14] border border-zinc-800 p-2 sm:p-3 min-h-[300px] sm:min-h-[340px]">
            <PnlChart data={equityCurve} className="h-full" />
          </div>
          <div className="lg:col-span-2 bg-[#0c0c14] border border-zinc-800 flex flex-col max-h-[min(400px,55vh)] lg:max-h-[400px]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-1.5">
                <Briefcase className="w-3 h-3 text-zinc-600" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-bold">Positions</span>
              </div>
              <span className="text-[10px] text-zinc-600 font-mono">{positions.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
              {positions.length > 0 ? (
                positions.map((pos) => (
                  <PositionCardCompact key={`${pos.marketId}|${pos.strike}|${pos.type}|${pos.expiry}`} position={pos} onClose={handleClosePosition} />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-1">
                  <p className="text-[10px] text-zinc-600 font-mono">NO OPEN POSITIONS</p>
                  <Link href="/" className="text-[10px] text-blue-500 hover:text-blue-400 font-mono">Browse markets</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Backtest simulator */}
        {hydrated && positions.length > 0 && <PortfolioBacktest positions={positions} orders={orders} />}

        {/* Analytics grid */}
        {hydrated && positions.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-zinc-800">
            <PnlBreakdown positions={positions} orders={orders} marketPrices={marketPrices} />
            <ScenarioAnalysis positions={positions} orders={orders} balance={balance} marketPrices={marketPrices} />
          </div>
        )}

        {/* EV calculator */}
        {hydrated && positions.length > 0 && <EVCalculator positions={positions} orders={orders} marketPrices={marketPrices} />}

        {/* Order history */}
        <OrderHistory orders={orders} marketPrices={marketPrices} />

        <p className="text-[9px] text-zinc-700 text-center font-mono pb-3">
          PAPER TRADING ONLY. NO REAL FUNDS AT RISK. PRICES UPDATE FROM LIVE POLYMARKET DATA.
        </p>
      </div>
    </div>
  )
}
