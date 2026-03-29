/**
 * Pure simulation math for demo mode.
 * No React, no side effects — all functions are deterministic given the same inputs.
 * Derived from real OptionQuote fields so numbers are coherent.
 */

import type { OptionQuote } from './api'

export interface OrderLevel {
  price: number   // USDC premium
  size: number    // contracts
  depth: number   // cumulative
}

export interface OrderBook {
  bids: OrderLevel[]
  asks: OrderLevel[]
  spread: number
  midpoint: number
}

export type DemoPhase = 'idle' | 'selecting' | 'filling' | 'processing' | 'success'

const LEVELS = 6

/**
 * Generate a stable order book from a real OptionQuote.
 * Seeded with Math.sin(strike) so same option → same starting book every render.
 */
export function generateOrderBook(option: OptionQuote, _currentProb: number): OrderBook {
  const mid = option.premium
  const tickSize = Math.max(0.002, mid * 0.012)
  const seed = option.strike * 31.7 + option.impliedVol * 7.3

  // openInterest > 0 uses it as base, otherwise derive from delta (ATM = most liquid)
  const baseSize = option.openInterest > 0
    ? option.openInterest / LEVELS
    : Math.abs(option.delta) * 80 + 15

  const bids: OrderLevel[] = []
  const asks: OrderLevel[] = []
  let bidDepth = 0
  let askDepth = 0

  for (let i = 0; i < LEVELS; i++) {
    // Deterministic pseudo-random via sin — no Math.random()
    const jitter = (Math.sin(seed + i * 2.71) * 0.5 + 0.5) * 0.4 + 0.8

    const bidPrice = mid - tickSize * (i + 1)
    const askPrice = mid + tickSize * (i + 1)
    const size = Math.round(baseSize * jitter * (1 - i * 0.08))

    bidDepth += size
    bids.push({ price: Math.max(0.001, bidPrice), size, depth: bidDepth })

    askDepth += size
    asks.push({ price: askPrice, size, depth: askDepth })
  }

  return { bids, asks, spread: tickSize * 2, midpoint: mid }
}

/**
 * Advance the order book one tick.
 * During 'filling': ask side is progressively consumed from inside out.
 * t = elapsed ticks since phase started.
 */
export function tickOrderBook(book: OrderBook, phase: DemoPhase, t: number): OrderBook {
  const pulse = (price: number, i: number) =>
    1 + 0.04 * Math.sin(t * 2.1 + price * 17 + i * 1.3)

  if (phase === 'filling') {
    // Consume ask levels inward — ~15% per level per 8 ticks, max 40% total
    const consumed = Math.min(0.40, t * 0.018)
    const newAsks = book.asks.map((lvl, i) => {
      const consumeFrac = Math.max(0, consumed - i * 0.07)
      const size = Math.max(0, Math.round(lvl.size * (1 - consumeFrac) * pulse(lvl.price, i)))
      return { ...lvl, size }
    })
    // Rebuild depths
    let d = 0
    const rebuiltAsks = newAsks.map(lvl => { d += lvl.size; return { ...lvl, depth: d } })

    const newBids = book.bids.map((lvl, i) => ({
      ...lvl,
      size: Math.round(lvl.size * pulse(lvl.price, i)),
    }))
    let bd = 0
    const rebuiltBids = newBids.map(lvl => { bd += lvl.size; return { ...lvl, depth: bd } })

    return { ...book, asks: rebuiltAsks, bids: rebuiltBids }
  }

  if (phase === 'idle' || phase === 'selecting') return book

  // processing / success: gentle pulse only
  const newBids = book.bids.map((lvl, i) => ({
    ...lvl, size: Math.round(lvl.size * pulse(lvl.price, i)),
  }))
  const newAsks = book.asks.map((lvl, i) => ({
    ...lvl, size: Math.round(lvl.size * pulse(lvl.price, i) * 0.6),
  }))
  let bd = 0; const rb = newBids.map(l => { bd += l.size; return { ...l, depth: bd } })
  let ad = 0; const ra = newAsks.map(l => { ad += l.size; return { ...l, depth: ad } })
  return { ...book, bids: rb, asks: ra }
}

/** Premium ticks ±2% only during filling phase */
export function tickPremium(base: number, phase: DemoPhase, t: number): number {
  if (phase !== 'filling') return base
  return base * (1 + 0.022 * Math.sin(t * 3.7))
}

/** Decaying probability oscillation after fill — simulates market absorption */
export function tickProbability(base: number, phase: DemoPhase, t: number): number {
  if (phase !== 'success') return base
  return base + 0.005 * Math.sin(t * 4.2) * Math.exp(-t * 1.5)
}

/** 0–1 liquidity heat score derived from real fields */
export function liquidityHeat(option: OptionQuote): number {
  if (option.openInterest > 0) {
    return Math.min(1, option.openInterest / 500)
  }
  // Fallback: delta proxy (ATM has highest delta magnitude ~0.5)
  return Math.min(1, Math.abs(option.delta) * 1.8)
}

export interface DemoPnlScenario {
  totalCost: number
  maxLoss: number
  breakeven: number
  gain5pp: number
  maxGain: number
}

export function computePnlScenario(option: OptionQuote, quantity: number): DemoPnlScenario {
  const totalCost = option.premium * quantity
  const maxLoss = -totalCost
  const breakeven = option.breakeven
  // Approximate +5pp delta move
  const gain5pp = option.delta * 0.05 * quantity
  // Max gain: call → moves to 1.0 (payout = 1 - strike - premium), put → 0.0
  const maxGain = option.type === 'call'
    ? (1 - option.strike) * quantity - totalCost
    : option.strike * quantity - totalCost

  return { totalCost, maxLoss, breakeven, gain5pp, maxGain }
}
