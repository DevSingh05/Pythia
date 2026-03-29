/**
 * Reconstruct model option premiums from historical YES% using the same tenor as the
 * options chain (daysToExpiry / 365), not time-to-market-resolution — otherwise the
 * series is too smooth and the endpoint will not match the chain premium.
 */

import type { OptionQuote, PricePoint } from '@/lib/api'
import { americanOptionBinomial, AMERICAN_TREE_STEPS, clampSigma } from '@/lib/pricing'

export interface OptionPremiumPoint {
  t: number
  premium: number
  prob: number
}

export interface BuildOptionPremiumHistoryOpts {
  strike: number
  type: 'call' | 'put'
  sigma: number
  /**
   * Option tenor in years — must match chain rows: daysToExpiry / 365.
   * Using resolution-date τ instead makes premiums wrong vs the main chain.
   */
  tauYears: number
}

/**
 * Map each historical YES% to premium holding τ fixed (same convention as `buildOptionsChain`).
 */
export function buildOptionPremiumHistory(
  probPoints: PricePoint[],
  opts: BuildOptionPremiumHistoryOpts,
): OptionPremiumPoint[] {
  const sigma = clampSigma(opts.sigma)
  const tauYears = Math.max(opts.tauYears, 1 / 365)
  const out: OptionPremiumPoint[] = []

  for (const pt of probPoints) {
    const prem = americanOptionBinomial(
      pt.p,
      opts.strike,
      sigma,
      tauYears,
      AMERICAN_TREE_STEPS,
      opts.type,
    )
    out.push({ t: pt.t, premium: prem, prob: pt.p })
  }

  return out
}

/** τ from chain row (same as pricer). */
export function tauYearsFromOption(option: OptionQuote): number {
  return Math.max(0, option.daysToExpiry) / 365 || 1 / 365
}

/**
 * Last chart point matches TradePanel: chain premium + spot YES% at now.
 * Merges into the last historical bucket if it is recent (avoids double dots).
 */
export function alignPremiumSeriesToChainSpot(
  points: OptionPremiumPoint[],
  option: OptionQuote,
  spotProb: number,
): OptionPremiumPoint[] {
  const now = Date.now()
  if (points.length === 0) {
    return [{ t: now, premium: option.premium, prob: spotProb }]
  }
  const copy = points.map(p => ({ ...p }))
  const last = copy[copy.length - 1]
  const mergeMs = 6 * 3600_000
  if (now - last.t < mergeMs) {
    last.t = now
    last.premium = option.premium
    last.prob = spotProb
    return copy
  }
  copy.push({ t: now, premium: option.premium, prob: spotProb })
  return copy
}
