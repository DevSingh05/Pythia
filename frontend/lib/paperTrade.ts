/**
 * Paper trading types and pure computation helpers.
 * Source of truth: Supabase backend (orders table).
 * Positions, balance, and equity curve are always derived — nothing persisted locally.
 */

import { Position } from '@/lib/api'
import { vanillaCall, vanillaPut, callDelta, putDelta, callTheta, gamma as calcGamma, callVega } from '@/lib/pricing'

// --- Types ---

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
  /**
   * American option prices keyed by `${strike}|${type}|${roundedTauDays}`.
   * When present, derivePositions uses these instead of European vanilla
   * so P&L reflects the American early-exercise premium.
   */
  americanPrices?: Map<string, number>
}

// --- Constants ---

export const INITIAL_BALANCE = 10_000

export function generateOrderId(): string {
  return crypto.randomUUID?.() ?? String(Date.now())
}

// --- Position derivation ---

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

    const daysSinceFill = (Date.now() - ref.timestamp) / 86_400_000
    const remainingDays = Math.max(0.1, ref.daysToExpiry - daysSinceFill)
    const tau = remainingDays / 365

    // Prefer American price; fall back to European vanilla.
    const tauDaysKey = String(Math.round(remainingDays))
    const americanKey = `${ref.strike}|${ref.type}|${tauDaysKey}`
    const americanPrice = snap?.americanPrices?.get(americanKey)
    const currentPremium = americanPrice !== undefined
      ? americanPrice
      : ref.type === 'call'
        ? vanillaCall(p0, ref.strike, sigma, tau)
        : vanillaPut(p0, ref.strike, sigma, tau)

    const absQty = Math.abs(netQty)
    const side: 'long' | 'short' = netQty > 0 ? 'long' : 'short'
    const currentValue = currentPremium * absQty
    const costBasis = avgCost * absQty
    const pnl = side === 'long' ? currentValue - costBasis : costBasis - currentValue
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

// --- Equity curve ---

export interface EquityPoint {
  t: number
  balance: number
  pnl: number
}

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
      cumPnl += order.totalCost
    }
    points.push({ t: order.timestamp, balance, pnl: cumPnl })
  }

  points.push({ t: Date.now(), balance, pnl: cumPnl })
  return points
}

// --- Portfolio statistics ---

export interface PortfolioStats {
  totalValue: number
  totalPnl: number
  totalPnlPct: number
  winRate: number
  totalTrades: number
  openPositions: number
  totalExposure: number
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
  const positionValue = positions.reduce((s, p) => {
    return s + (p.side === 'long' ? 1 : -1) * p.currentValue * p.quantity
  }, 0)
  const totalValue = balance + positionValue
  const totalPnl = totalValue - INITIAL_BALANCE
  const totalPnlPct = totalPnl / INITIAL_BALANCE

  const groups = new Map<string, PaperOrder[]>()
  for (const order of orders) {
    const key = `${order.marketId}|${order.strike}|${order.type}|${order.expiry}`
    const arr = groups.get(key) ?? []
    arr.push(order)
    groups.set(key, arr)
  }

  let wins = 0, closedCount = 0
  for (const [, groupOrders] of groups) {
    let netQty = 0, totalBought = 0, totalSold = 0
    for (const o of groupOrders) {
      if (o.side === 'buy') { netQty += o.quantity; totalBought += o.totalCost }
      else { netQty -= o.quantity; totalSold += o.totalCost }
    }
    if (netQty === 0 && groupOrders.length >= 2) {
      closedCount++
      if (totalSold > totalBought) wins++
    }
  }

  const winRate = closedCount > 0 ? wins / closedCount : 0
  const totalExposure = positions.reduce((s, p) =>
    s + (p.side === 'long' ? p.currentValue * p.quantity : 0), 0)

  let netDelta = 0, netGamma = 0, netTheta = 0, netVega = 0
  for (const pos of positions) {
    const sign = pos.side === 'short' ? -1 : 1
    const ref = orders.find(o =>
      o.marketId === pos.marketId && o.strike === pos.strike && o.type === pos.type)
    const snap = marketPrices.get(pos.marketId)
    const p0 = snap?.currentProb ?? ref?.currentProbAtFill ?? 0.5
    const sigma = snap?.impliedVol ?? ref?.impliedVol ?? 1.5
    const daysSinceFill = ref ? (Date.now() - ref.timestamp) / 86_400_000 : 0
    const remainingDays = Math.max(0.1, (ref?.daysToExpiry ?? 7) - daysSinceFill)
    const tau = remainingDays / 365

    netDelta += pos.delta * pos.quantity * sign
    netGamma += calcGamma(p0, pos.strike, sigma, tau) * pos.quantity * sign
    netTheta += pos.theta * pos.quantity * sign
    netVega  += callVega(p0, pos.strike, sigma, tau) * pos.quantity * sign
  }

  const sorted = [...positions].sort((a, b) => b.pnl - a.pnl)

  return {
    totalValue, totalPnl, totalPnlPct, winRate,
    totalTrades: orders.length,
    openPositions: positions.length,
    totalExposure,
    netDelta, netGamma, netTheta, netVega,
    bestPosition: sorted[0] ?? null,
    worstPosition: sorted[sorted.length - 1] ?? null,
  }
}
