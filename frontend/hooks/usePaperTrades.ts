'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Position } from '@/lib/api'
import {
  PaperOrder,
  MarketSnapshot,
  EquityPoint,
  PortfolioStats,
  loadOrders,
  saveOrders,
  loadBalance,
  saveBalance,
  derivePositions,
  buildEquityCurve,
  computePortfolioStats,
  INITIAL_BALANCE,
} from '@/lib/paperTrade'

export interface UsePaperTradesReturn {
  orders: PaperOrder[]
  positions: Position[]
  balance: number
  hydrated: boolean
  equityCurve: EquityPoint[]
  stats: PortfolioStats
  marketPrices: Map<string, MarketSnapshot>
  addOrder: (order: PaperOrder) => { success: boolean; error?: string }
  resetPortfolio: () => void
  refreshPrices: (prices: Map<string, MarketSnapshot>) => void
}

const EMPTY_STATS: PortfolioStats = {
  totalValue: INITIAL_BALANCE,
  totalPnl: 0,
  totalPnlPct: 0,
  winRate: 0,
  totalTrades: 0,
  openPositions: 0,
  totalExposure: 0,
  netDelta: 0,
  netGamma: 0,
  netTheta: 0,
  netVega: 0,
  bestPosition: null,
  worstPosition: null,
}

export function usePaperTrades(): UsePaperTradesReturn {
  const [orders, setOrders] = useState<PaperOrder[]>([])
  const [balance, setBalance] = useState(INITIAL_BALANCE)
  const [hydrated, setHydrated] = useState(false)
  const [marketPrices, setMarketPrices] = useState<Map<string, MarketSnapshot>>(new Map())

  // Hydrate from localStorage on mount
  useEffect(() => {
    setOrders(loadOrders())
    setBalance(loadBalance())
    setHydrated(true)
  }, [])

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'pythia:orders') {
        setOrders(loadOrders())
      } else if (e.key === 'pythia:balance') {
        setBalance(loadBalance())
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const addOrder = useCallback((order: PaperOrder): { success: boolean; error?: string } => {
    const currentBalance = loadBalance()

    if (order.side === 'buy' && order.totalCost > currentBalance) {
      return { success: false, error: `Insufficient balance. Need $${order.totalCost.toFixed(2)}, have $${currentBalance.toFixed(2)}` }
    }

    const newBalance = order.side === 'buy'
      ? currentBalance - order.totalCost
      : currentBalance + order.totalCost

    const currentOrders = loadOrders()
    const newOrders = [...currentOrders, order]

    saveOrders(newOrders)
    saveBalance(newBalance)
    setOrders(newOrders)
    setBalance(newBalance)

    return { success: true }
  }, [])

  const resetPortfolio = useCallback(() => {
    saveOrders([])
    saveBalance(INITIAL_BALANCE)
    setOrders([])
    setBalance(INITIAL_BALANCE)
    setMarketPrices(new Map())
  }, [])

  const refreshPrices = useCallback((prices: Map<string, MarketSnapshot>) => {
    setMarketPrices(prices)
  }, [])

  const positions = hydrated ? derivePositions(orders, marketPrices) : []

  // Derived: equity curve from order history.
  // The final "now" point is adjusted to include open position mark-to-market value
  // so the curve shows true portfolio value (cash + positions), not just cash.
  // Without this, buying an option causes a visible dip even though portfolio value is unchanged.
  const equityCurve = useMemo(() => {
    if (!hydrated) return []
    const curve = buildEquityCurve(orders)
    if (curve.length > 0 && positions.length > 0) {
      // Long: add MTM value. Short: subtract buyback cost (premium received is already in balance).
      const positionMtm = positions.reduce((s, p) => {
        const sign = p.side === 'long' ? 1 : -1
        return s + sign * p.currentValue * p.quantity
      }, 0)
      const last = curve[curve.length - 1]
      curve[curve.length - 1] = {
        ...last,
        balance: last.balance + positionMtm,
        pnl: (last.balance + positionMtm) - INITIAL_BALANCE,
      }
    }
    return curve
  }, [hydrated, orders, positions])


  // Derived: portfolio stats from positions + orders + balance + prices
  const stats = useMemo(() => {
    if (!hydrated) return EMPTY_STATS
    return computePortfolioStats(positions, orders, balance, marketPrices)
  }, [hydrated, positions, orders, balance, marketPrices])

  return { orders, positions, balance, hydrated, equityCurve, stats, marketPrices, addOrder, resetPortfolio, refreshPrices }
}
