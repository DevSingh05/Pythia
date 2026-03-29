/**
 * Paper trading types and localStorage helpers.
 * Primary source of truth: the orders array in localStorage.
 * Positions are always derived from orders + current market prices.
 */

import { Position } from '@/lib/api'
import { vanillaCall, vanillaPut, callDelta, putDelta, callTheta, gamma as calcGamma, callVega } from '@/lib/pricing'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface PaperOrder {
  id: string
  timestamp: number
  marketId: string
  marketTitle: string
  currentProbAtFill: number
  strike: number
  type: 'call' | 'put'
  expiry: string
  daysToExpiry: number
  side: 'buy' | 'sell'
  quantity: number
  premium: number
  totalCost: number
  impliedVol: number
  status: 'filled'
}

export interface MarketSnapshot {
  currentProb: number
  impliedVol: number
}

// ─── Constants ──────────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  orders: 'pythia:orders',
  balance: 'pythia:balance',
} as const

export const INITIAL_BALANCE = 10_000

// ─── localStorage helpers ───────────────────────────────────────────────────────

export function loadOrders(): PaperOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.orders)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveOrders(orders: PaperOrder[]): void {
  localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders))
}

export function loadBalance(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.balance)
    return raw ? parseFloat(raw) : INITIAL_BALANCE
  } catch {
    return INITIAL_BALANCE
  }
}

export function saveBalance(n: number): void {
  localStorage.setItem(STORAGE_KEYS.balance, String(n))
}

export function generateOrderId(): string {
  return crypto.randomUUID?.() ?? String(Date.now())
}

// ─── Position derivation ────────────────────────────────────────────────────────

/**
 * Derive active positions from the full order history.
 * Groups by (marketId, strike, type, expiry), nets buy/sell quantities,
 * and re-prices using current market data if available.
 */
export function derivePositions(
  orders: PaperOrder[],
  marketPrices: Map<string, MarketSnapshot>,
): Position[] {
  const groups = new Map<string, PaperOrder[]>()

  for (const order of orders) {
    const key = `${order.marketId}|${order.strike}|${order.type}|${order.expiry}`
    const arr = groups.get(key) ?? []
    arr.push(order)
    groups.set(key, arr)
  }

  const positions: Position[] = []

  for (const [, groupOrders] of groups) {
    let netQty = 0
    let totalBuyCost = 0
    let totalBuyQty = 0

    for (const o of groupOrders) {
      if (o.side === 'buy') {
        netQty += o.quantity
        totalBuyCost += o.premium * o.quantity
        totalBuyQty += o.quantity
      } else {
        netQty -= o.quantity
      }
    }

    if (netQty === 0) continue

    const ref = groupOrders[0]
    const avgCost = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : ref.premium
    const snap = marketPrices.get(ref.marketId)
    const p0 = snap?.currentProb ?? ref.currentProbAtFill
    const sigma = snap?.impliedVol ?? ref.impliedVol

    // Recalculate remaining days to expiry
    const daysSinceFill = (Date.now() - ref.timestamp) / 86_400_000
    const remainingDays = Math.max(0.1, ref.daysToExpiry - daysSinceFill)
    const tau = remainingDays / 365

    const currentPremium = ref.type === 'call'
      ? vanillaCall(p0, ref.strike, sigma, tau)
      : vanillaPut(p0, ref.strike, sigma, tau)

    const absQty = Math.abs(netQty)
    const side: 'long' | 'short' = netQty > 0 ? 'long' : 'short'
    const currentValue = currentPremium * absQty
    const costBasis = avgCost * absQty
    const pnl = side === 'long'
      ? currentValue - costBasis
      : costBasis - currentValue
    const pnlPct = costBasis > 0 ? pnl / costBasis : 0

    const delta = ref.type === 'call'
      ? callDelta(p0, ref.strike, sigma, tau)
      : putDelta(p0, ref.strike, sigma, tau)
    const theta = callTheta(p0, ref.strike, sigma, tau)

    positions.push({
      marketId: ref.marketId,
      marketTitle: ref.marketTitle,
      strike: ref.strike,
      type: ref.type,
      expiry: ref.expiry,
      side,
      quantity: absQty,
      avgCost,
      currentValue: currentPremium,
      pnl,
      pnlPct,
      delta,
      theta,
    })
  }

  return positions
}

// ─── Equity curve from order history ────────────────────────────────────────────

export interface EquityPoint {
  t: number       // unix ms
  balance: number  // running cash balance
  pnl: number      // cumulative realized P&L
}

/**
 * Build a cumulative equity curve from the chronological order stream.
 * Each order creates a data point showing the running balance trajectory.
 */
export function buildEquityCurve(orders: PaperOrder[]): EquityPoint[] {
  if (orders.length === 0) return []

  const sorted = [...orders].sort((a, b) => a.timestamp - b.timestamp)
  const points: EquityPoint[] = [{ t: sorted[0].timestamp - 1000, balance: INITIAL_BALANCE, pnl: 0 }]

  let balance = INITIAL_BALANCE
  let cumPnl = 0

  for (const order of sorted) {
    if (order.side === 'buy') {
      balance -= order.totalCost
    } else {
      balance += order.totalCost
      // Selling = realizing. Approximate realized P&L as credit received
      cumPnl += order.totalCost
    }
    points.push({ t: order.timestamp, balance, pnl: cumPnl })
  }

  // Add current point
  points.push({ t: Date.now(), balance, pnl: cumPnl })

  return points
}

// ─── Portfolio statistics ───────────────────────────────────────────────────────

export interface PortfolioStats {
  totalValue: number       // balance + position mark-to-market
  totalPnl: number
  totalPnlPct: number
  winRate: number          // % of closed trades that were profitable
  totalTrades: number
  openPositions: number
  totalExposure: number    // sum of all position notional values
  netDelta: number
  netGamma: number
  netTheta: number
  netVega: number
  bestPosition: Position | null
  worstPosition: Position | null
}

export function computePortfolioStats(
  positions: Position[],
  orders: PaperOrder[],
  balance: number,
  marketPrices: Map<string, MarketSnapshot>,
): PortfolioStats {
  // Long positions add MTM value, short positions subtract (they are liabilities on the balance).
  // balance already includes premium received for sells, so we must subtract the buyback cost.
  const positionValue = positions.reduce((s, p) => {
    const sign = p.side === 'long' ? 1 : -1
    return s + sign * p.currentValue * p.quantity
  }, 0)
  const totalValue = balance + positionValue
  const totalPnl = totalValue - INITIAL_BALANCE
  const totalPnlPct = totalPnl / INITIAL_BALANCE

  // Win rate: count closed positions (net qty = 0 groups)
  const groups = new Map<string, PaperOrder[]>()
  for (const order of orders) {
    const key = `${order.marketId}|${order.strike}|${order.type}|${order.expiry}`
    const arr = groups.get(key) ?? []
    arr.push(order)
    groups.set(key, arr)
  }

  let wins = 0
  let closedCount = 0
  for (const [, groupOrders] of groups) {
    let netQty = 0
    let totalBought = 0
    let totalSold = 0
    for (const o of groupOrders) {
      if (o.side === 'buy') {
        netQty += o.quantity
        totalBought += o.totalCost
      } else {
        netQty -= o.quantity
        totalSold += o.totalCost
      }
    }
    if (netQty === 0 && groupOrders.length >= 2) {
      closedCount++
      if (totalSold > totalBought) wins++
    }
  }

  const winRate = closedCount > 0 ? wins / closedCount : 0
  // Exposure = total capital tied up in long positions (shorts are premium received, not exposure)
  const totalExposure = positions.reduce((s, p) => {
    return s + (p.side === 'long' ? p.currentValue * p.quantity : 0)
  }, 0)

  // Aggregate Greeks (with full gamma/vega)
  let netDelta = 0, netGamma = 0, netTheta = 0, netVega = 0
  for (const pos of positions) {
    const sign = pos.side === 'short' ? -1 : 1
    const ref = orders.find(o => o.marketId === pos.marketId && o.strike === pos.strike && o.type === pos.type)
    const snap = marketPrices.get(pos.marketId)
    const p0 = snap?.currentProb ?? ref?.currentProbAtFill ?? 0.5
    const sigma = snap?.impliedVol ?? ref?.impliedVol ?? 1.5
    const daysSinceFill = ref ? (Date.now() - ref.timestamp) / 86_400_000 : 0
    const remainingDays = Math.max(0.1, (ref?.daysToExpiry ?? 7) - daysSinceFill)
    const tau = remainingDays / 365

    netDelta += pos.delta * pos.quantity * sign
    netGamma += calcGamma(p0, pos.strike, sigma, tau) * pos.quantity * sign
    netTheta += pos.theta * pos.quantity * sign
    netVega += callVega(p0, pos.strike, sigma, tau) * pos.quantity * sign
  }

  // Best / worst by P&L
  const sorted = [...positions].sort((a, b) => b.pnl - a.pnl)

  return {
    totalValue,
    totalPnl,
    totalPnlPct,
    winRate,
    totalTrades: orders.length,
    openPositions: positions.length,
    totalExposure,
    netDelta,
    netGamma,
    netTheta,
    netVega,
    bestPosition: sorted[0] ?? null,
    worstPosition: sorted[sorted.length - 1] ?? null,
  }
}
