'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Position, fetchOrders, deleteAllOrders } from '@/lib/api'
import {
  PaperOrder,
  MarketSnapshot,
  EquityPoint,
  PortfolioStats,
  derivePositions,
  buildEquityCurve,
  computePortfolioStats,
  INITIAL_BALANCE,
} from '@/lib/paperTrade'
import { useAuth } from '@/hooks/useAuth'

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

/** Compute running balance from the order stream — no need to store it separately. */
function balanceFromOrders(orders: PaperOrder[]): number {
  return orders.reduce((bal, o) => {
    return o.side === 'buy' ? bal - o.totalCost : bal + o.totalCost
  }, INITIAL_BALANCE)
}

/** Reconstruct a PaperOrder from a backend DB row. */
function rowToPaperOrder(row: Record<string, unknown>): PaperOrder | null {
  // Rows saved with metadata carry the full PaperOrder — use it directly.
  if (row.metadata && typeof row.metadata === 'object') {
    return row.metadata as PaperOrder
  }
  // Older rows (no metadata): reconstruct from structured columns.
  if (!row.id || !row.market_id) return null
  const qty  = Number(row.quantity ?? 1)
  const prem = Number(row.premium ?? 0)
  return {
    id:                 String(row.id),
    timestamp:          row.created_at ? new Date(String(row.created_at)).getTime() : Date.now(),
    marketId:           String(row.market_id),
    marketTitle:        String(row.market_id),  // best-effort
    currentProbAtFill:  0.5,
    strike:             Number(row.strike),
    type:               row.type as 'call' | 'put',
    expiry:             String(row.expiry ?? ''),
    daysToExpiry:       7,
    side:               row.side as 'buy' | 'sell',
    quantity:           qty,
    premium:            prem,
    totalCost:          prem * qty,
    impliedVol:         1.5,
    status:             'filled',
  }
}

export function usePaperTrades(): UsePaperTradesReturn {
  const { user, getToken } = useAuth()
  const [orders, setOrders]           = useState<PaperOrder[]>([])
  const [hydrated, setHydrated]       = useState(false)
  const [marketPrices, setMarketPrices] = useState<Map<string, MarketSnapshot>>(new Map())

  // Balance is always derived from the order stream — never stored separately.
  const balance = balanceFromOrders(orders)

  // ── Load from Supabase on mount / when user logs in ──────────────────────────
  useEffect(() => {
    if (!user) {
      // Not logged in: start with an empty portfolio.
      setOrders([])
      setHydrated(true)
      return
    }

    let cancelled = false
    setHydrated(false)

    async function loadFromBackend() {
      const token = await getToken()
      if (!token || cancelled) { setHydrated(true); return }

      const rows = await fetchOrders(token)
      if (cancelled) return

      const loaded = rows
        .map(rowToPaperOrder)
        .filter((o): o is PaperOrder => o !== null)
        .sort((a, b) => a.timestamp - b.timestamp)

      setOrders(loaded)
      setHydrated(true)
    }

    loadFromBackend()
    return () => { cancelled = true }
  }, [user, getToken])

  // ── addOrder: update React state + push to Supabase ──────────────────────────
  const addOrder = useCallback((order: PaperOrder): { success: boolean; error?: string } => {
    // Check balance from current orders (derive fresh — no localStorage)
    const currentBalance = balanceFromOrders(
      // read current state synchronously via functional updater below
      orders
    )

    if (order.side === 'buy' && order.totalCost > currentBalance) {
      return {
        success: false,
        error: `Insufficient balance. Need $${order.totalCost.toFixed(2)}, have $${currentBalance.toFixed(2)}`,
      }
    }

    // Optimistic update — immediately visible in the UI
    setOrders(prev => [...prev, order])

    // Push to Supabase (fire-and-forget; failure is non-blocking)
    getToken().then(token => {
      if (!token) return
      fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          marketId:   order.marketId,
          strike:     order.strike,
          type:       order.type,
          expiry:     order.expiry,
          side:       order.side,
          quantity:   order.quantity,
          limitPrice: order.premium,
          metadata:   order,   // full PaperOrder for lossless cross-device reconstruction
        }),
      }).catch(() => { /* best-effort */ })
    })

    return { success: true }
  }, [orders, getToken])

  // ── resetPortfolio: clear React state + delete from Supabase ────────────────
  const resetPortfolio = useCallback(() => {
    setOrders([])
    setMarketPrices(new Map())

    getToken().then(token => {
      if (token) deleteAllOrders(token).catch(() => {})
    })
  }, [getToken])

  const refreshPrices = useCallback((prices: Map<string, MarketSnapshot>) => {
    setMarketPrices(prices)
  }, [])

  const positions = hydrated ? derivePositions(orders, marketPrices) : []

  const equityCurve = useMemo(() => {
    if (!hydrated) return []
    const curve = buildEquityCurve(orders)
    if (curve.length > 0 && positions.length > 0) {
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

  const stats = useMemo(() => {
    if (!hydrated) return EMPTY_STATS
    return computePortfolioStats(positions, orders, balance, marketPrices)
  }, [hydrated, positions, orders, balance, marketPrices])

  return { orders, positions, balance, hydrated, equityCurve, stats, marketPrices, addOrder, resetPortfolio, refreshPrices }
}
