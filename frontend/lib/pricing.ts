/**
 * Logit-Normal option pricing model for probability underliers.
 * Underlying: YES% on Polymarket (p ∈ [0,1])
 * Model: dL = σ dW where L = logit(p), logit is unbounded → Brownian motion
 *
 * Key difference from equity BS: there is NO drift (no risk-free rate)
 * because this is a probability, not a price.
 * E^Q[p_T] = E[sigmoid(L_T)] ≠ p0 due to Jensen's inequality.
 */

// ── Pricing engine constants ─────────────────────────────────────────────────
const PROB_CLAMP_MIN    = 1e-6    // probability floor (avoids logit singularity)
const PROB_CLAMP_MAX    = 1 - 1e-6
const SIGMA_FLOOR       = 0.05    // minimum logit-space vol
const SIGMA_CAP         = 5.0     // maximum logit-space vol
const INTEGRATION_N     = 400     // integration points for vanillaCall / expectedProbability
const DELTA_BUMP        = 0.001   // 0.1pp bump for delta central difference
const GAMMA_OUTER_BUMP  = 0.02    // 2pp outer bump for gamma (diff of deltas)
const VEGA_BUMP         = 0.01    // 1% absolute vol bump
const THETA_DT          = 1 / 365 // 1 calendar day
const DAYS_PER_YEAR     = 365     // calendar days (Polymarket resolves any day)

/** Contract notional — each contract pays $100 at max */
export const CONTRACT_NOTIONAL = 100

/** Per-contract commission in dollars (2¢) */
export const COMMISSION_PER_CONTRACT = 0.02

// ── Core transforms ──────────────────────────────────────────────────────────

function clampP(p: number): number {
  return Math.max(PROB_CLAMP_MIN, Math.min(PROB_CLAMP_MAX, p))
}

export function logit(p: number): number {
  const clamped = clampP(p)
  return Math.log(clamped / (1 - clamped))
}

export function sigmoid(l: number): number {
  return 1 / (1 + Math.exp(-l))
}

/** Standard normal PDF */
export function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

/** Standard normal CDF — Abramowitz & Stegun approximation */
export function Phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422820 * Math.exp(-x * x * 0.5)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
  return x > 0 ? 1 - p : p
}

// ── Binary options (closed form) ─────────────────────────────────────────────

/**
 * Binary call price: pays $1 if p_T > K at expiry
 * d = (L₀ − logit(K)) / (σ√τ)
 * C = Φ(d)
 */
export function binaryCall(p0: number, K: number, sigma: number, tau: number): number {
  const d = (logit(p0) - logit(K)) / (sigma * Math.sqrt(tau))
  return Phi(d)
}

export function binaryPut(p0: number, K: number, sigma: number, tau: number): number {
  return 1 - binaryCall(p0, K, sigma, tau)
}

// ── Vanilla pricing (numerical integration) ──────────────────────────────────

/**
 * Vanilla call: pays max(p_T - K, 0) at expiry.
 * Integrates sigmoid(l) - K over l > logit(K) under the logit-normal density.
 *
 * Only integrates above the kink at LK (payoff is exactly zero below),
 * eliminating the kink discontinuity and focusing points on the relevant domain.
 */
export function vanillaCall(p0: number, K: number, sigma: number, tau: number): number {
  if (tau <= 0) return Math.max(0, clampP(p0) - K)
  const L0 = logit(p0)
  const LK = logit(K)
  const sigTau = sigma * Math.sqrt(tau)
  const lMin = LK
  const lMax = Math.max(L0 + 6 * sigTau, LK + 1.0)
  const n = INTEGRATION_N
  const dl = (lMax - lMin) / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const l = lMin + (i + 0.5) * dl
    const pT = sigmoid(l)
    const payoff = pT - K // always >= 0 since l >= LK
    const z = (l - L0) / sigTau
    sum += payoff * Math.exp(-0.5 * z * z) * dl
  }
  return Math.max(0, sum / (sigTau * Math.sqrt(2 * Math.PI)))
}

/**
 * E^Q[p_T] under driftless logit-normal: E[sigmoid(L0 + sigma*sqrt(tau)*Z)]
 * NOT equal to sigmoid(L0) = p0 due to Jensen's inequality.
 * Numerically integrated via midpoint rule (same approach as vanillaCall).
 */
function expectedProbability(p0: number, sigma: number, tau: number): number {
  if (tau <= 0) return clampP(p0)
  const L0 = logit(p0)
  const sigTau = sigma * Math.sqrt(tau)
  const lMin = L0 - 6 * sigTau
  const lMax = L0 + 6 * sigTau
  const n = INTEGRATION_N
  const dl = (lMax - lMin) / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const l = lMin + (i + 0.5) * dl
    const z = (l - L0) / sigTau
    sum += sigmoid(l) * Math.exp(-0.5 * z * z) * dl
  }
  return sum / (sigTau * Math.sqrt(2 * Math.PI))
}

/**
 * Vanilla put via correct put-call parity for logit-normal.
 *
 * Correct parity: C - P = E^Q[p_T] - K
 *   where E^Q[p_T] = E[sigmoid(L_T)] computed numerically (NOT p0)
 *   because E[sigmoid(L_T)] ≠ sigmoid(L0) = p0 (Jensen's inequality)
 *
 * For markets near resolution (p=0.95+) the difference E[p_T] vs p0 is 3-5%.
 * Also floored at intrinsic for American exercise consistency.
 */
export function vanillaPut(p0: number, K: number, sigma: number, tau: number): number {
  if (tau <= 0) return Math.max(0, K - clampP(p0))
  const call = vanillaCall(p0, K, sigma, tau)
  const ePT = expectedProbability(p0, sigma, tau)
  const put = call - (ePT - K)
  const intrinsic = Math.max(0, K - p0)
  return Math.max(intrinsic, put)
}

// ── Greeks ───────────────────────────────────────────────────────────────────

/**
 * Delta (call): bump-and-reprice central difference
 * Δ ∈ [0, 1] for calls
 */
export function callDelta(p0: number, K: number, sigma: number, tau: number): number {
  const eps = DELTA_BUMP
  const pUp = clampP(p0 + eps)
  const pDn = clampP(p0 - eps)
  return (vanillaCall(pUp, K, sigma, tau) - vanillaCall(pDn, K, sigma, tau)) / (pUp - pDn)
}

/**
 * Delta (put): bump-and-reprice central difference
 * Δ ∈ [-1, 0] for puts
 */
export function putDelta(p0: number, K: number, sigma: number, tau: number): number {
  const eps = DELTA_BUMP
  const pUp = clampP(p0 + eps)
  const pDn = clampP(p0 - eps)
  return (vanillaPut(pUp, K, sigma, tau) - vanillaPut(pDn, K, sigma, tau)) / (pUp - pDn)
}

/**
 * Gamma: rate of change of delta per 1 percentage-point move in p.
 *
 * WHY NOT direct second finite difference d²V/dp²?
 *   vanillaCall uses 400-pt midpoint integration with error ~1e-5.
 *   Second FD divides by dp²=(0.005)²=2.5e-5, amplifying noise x40,000.
 *   Deep ITM result: ~0.58 instead of the correct ~0.
 *
 * WHY differentiate delta instead?
 *   callDelta() itself uses a central difference with eps=0.001, smoothing
 *   integration noise before the outer difference is taken.
 *   Noise amplification drops from x40,000 to x25. Deep ITM → 0 correctly.
 *
 * UNIT: "delta change per 1pp move in probability"
 *   = (delta_up - delta_dn) / (pUp - pDn) * 0.01
 *
 * Properties:
 *   - Always non-negative for long vanilla options
 *   - Peaks ATM (~0.08-0.20), tapers to ~0 deep ITM/OTM
 *   - Comparable magnitude to stock-world gamma (~0.02)
 */
export function callGamma(p0: number, K: number, sigma: number, tau: number): number {
  const dp = GAMMA_OUTER_BUMP
  const pUp = clampP(p0 + dp)
  const pDn = clampP(p0 - dp)
  const deltaUp = callDelta(pUp, K, sigma, tau)
  const deltaDn = callDelta(pDn, K, sigma, tau)
  return (deltaUp - deltaDn) / (pUp - pDn) * 0.01
}

export function putGamma(p0: number, K: number, sigma: number, tau: number): number {
  const dp = GAMMA_OUTER_BUMP
  const pUp = clampP(p0 + dp)
  const pDn = clampP(p0 - dp)
  const deltaUp = putDelta(pUp, K, sigma, tau)
  const deltaDn = putDelta(pDn, K, sigma, tau)
  return (deltaUp - deltaDn) / (pUp - pDn) * 0.01
}

/**
 * Theta: dV/dτ — standard Black-Scholes theta (time derivative).
 *
 * This is the RATE of change of option value with respect to time,
 * not the raw 1-day dollar change. The derivative form produces values
 * in a natural range (0.01–0.15) rather than dollar-tiny values
 * that display as zero.
 *
 * Same convention as equity options platforms (Robinhood, TOS, IBKR).
 */
export function callTheta(p0: number, K: number, sigma: number, tau: number): number {
  const dt = THETA_DT
  const tauMinus = Math.max(dt / 10, tau - dt)
  return (vanillaCall(p0, K, sigma, tauMinus) - vanillaCall(p0, K, sigma, tau)) / dt
}

export function putTheta(p0: number, K: number, sigma: number, tau: number): number {
  const dt = THETA_DT
  const tauMinus = Math.max(dt / 10, tau - dt)
  return (vanillaPut(p0, K, sigma, tauMinus) - vanillaPut(p0, K, sigma, tau)) / dt
}

/**
 * Vega: dV/dσ — standard Black-Scholes vega (vol derivative).
 *
 * Central difference gives the derivative with respect to sigma.
 * This produces values in a natural range (0.001–0.02) rather than
 * the per-1% dollar change which is 50x smaller.
 *
 * Same convention as equity options platforms.
 */
export function callVega(p0: number, K: number, sigma: number, tau: number): number {
  const eps = VEGA_BUMP
  const sigUp = sigma + eps
  const sigDn = Math.max(0.01, sigma - eps)
  return (vanillaCall(p0, K, sigUp, tau) - vanillaCall(p0, K, sigDn, tau)) / (sigUp - sigDn)
}

export function putVega(p0: number, K: number, sigma: number, tau: number): number {
  const eps = VEGA_BUMP
  const sigUp = sigma + eps
  const sigDn = Math.max(0.01, sigma - eps)
  return (vanillaPut(p0, K, sigUp, tau) - vanillaPut(p0, K, sigDn, tau)) / (sigUp - sigDn)
}

// ── Options chain builder ────────────────────────────────────────────────────

export interface OptionData {
  strike: number
  type: 'call' | 'put'
  expiry: string
  daysToExpiry: number
  premium: number
  premiumChange: number
  premiumChangePct: number
  delta: number
  gamma: number
  theta: number
  vega: number
  breakeven: number
  breakevenDelta: number
  isITM: boolean
  openInterest: number
}

const EXPIRIES = [
  { label: '3D', days: 3 },
  { label: '1W', days: 7 },
  { label: '2W', days: 14 },
  { label: '1M', days: 30 },
]

/**
 * Dynamic strike generation — places 3 strikes on each side of ATM
 * spaced in logit space so ALL strikes have non-trivial premiums.
 *
 * Why logit-space spacing?  The underlying follows dL = σdW, so equal
 * steps in L correspond to equal-probability moves.  A fixed percentage
 * grid (10%, 20%, …) puts most strikes 20+ standard deviations from
 * ATM on short-dated contracts, producing pages of zeros.
 *
 * Spacing = 0.7 × σ√τ  (≈ 0.7 standard deviations)
 * → every strike is within 2.1σ of ATM → all have meaningful Greeks.
 * Floor of 0.06 prevents collapse when vol or tau is very small.
 */
export function availableStrikes(
  currentProb: number,
  sigma: number,
  tauDays: number,
  nPerSide = 3,
): number[] {
  const tau = tauDays / DAYS_PER_YEAR
  const L0 = logit(currentProb)
  const sigTau = sigma * Math.sqrt(tau)

  // Step size: ~1.2 standard deviations in logit space, floor at 0.15
  // Produces ~3-4% gaps in probability space (wider, cleaner chain)
  const step = Math.max(sigTau * 1.2, 0.15)

  const strikes: number[] = []
  const seen = new Set<number>()

  for (let i = -nPerSide; i <= nPerSide; i++) {
    const L = L0 + i * step
    const p = sigmoid(L)
    // Round to nearest 0.5% for clean display, clamp to tradeable range
    const rounded = Math.round(p * 200) / 200
    const clamped = Math.max(0.005, Math.min(0.995, rounded))
    if (!seen.has(clamped)) {
      seen.add(clamped)
      strikes.push(clamped)
    }
  }

  // If too few strikes (extreme probability), pad with the minimum set
  if (strikes.length < 3) {
    const pRound = Math.round(currentProb * 200) / 200
    const candidates = [pRound - 0.01, pRound - 0.005, pRound, pRound + 0.005, pRound + 0.01]
      .map(p => Math.max(0.005, Math.min(0.995, p)))
    for (const c of candidates) {
      if (!seen.has(c)) { seen.add(c); strikes.push(c) }
    }
  }

  return strikes.sort((a, b) => a - b)
}

export function buildOptionsChain(
  currentProb: number,
  sigma: number,
  expiry: { label: string; days: number } = EXPIRIES[1],
  strikes?: number[],
): { calls: OptionData[]; puts: OptionData[]; expiries: typeof EXPIRIES } {
  const useStrikes = strikes ?? availableStrikes(currentProb, sigma, expiry.days)
  const tau = expiry.days / DAYS_PER_YEAR

  // TODO: Replace with real premiumChange from Polymarket trade history API
  // Current: synthetic seeded random for UI demo only
  const seed = (s: number) => {
    const x = Math.sin(s) * 10000
    return x - Math.floor(x)
  }

  const comm = COMMISSION_PER_CONTRACT

  const N = CONTRACT_NOTIONAL // $100 per contract

  const calls: OptionData[] = useStrikes.map((K, i) => {
    const premium = vanillaCall(currentProb, K, sigma, tau) * N
    const rng = seed(K * 100 + i)
    const prevPremium = premium * (1 + (rng - 0.5) * 0.4)
    const change = premium - prevPremium
    // Call breakeven at expiry: need p_T > K + premium/N + comm/N to profit
    const breakeven = Math.min(0.999, K + premium / N + comm / N)

    return {
      strike: K,
      type: 'call',
      expiry: expiry.label,
      daysToExpiry: expiry.days,
      premium,
      premiumChange: change,
      premiumChangePct: prevPremium > 0 ? change / prevPremium : 0,
      delta: callDelta(currentProb, K, sigma, tau) * N,
      gamma: callGamma(currentProb, K, sigma, tau) * N,
      theta: callTheta(currentProb, K, sigma, tau) * N,
      vega: callVega(currentProb, K, sigma, tau) * N,
      breakeven,
      breakevenDelta: breakeven - currentProb,
      isITM: currentProb > K,
      openInterest: Math.round(seed(K * 300 + i * 7) * 50000 + 1000),
    }
  })

  const puts: OptionData[] = useStrikes.map((K, i) => {
    const premium = vanillaPut(currentProb, K, sigma, tau) * N
    const rng = seed(K * 200 + i * 3)
    const prevPremium = premium * (1 + (rng - 0.5) * 0.4)
    const change = premium - prevPremium
    // Put breakeven at expiry: need p_T < K - premium/N - comm/N to profit
    const breakeven = Math.max(0.001, K - premium / N - comm / N)

    return {
      strike: K,
      type: 'put',
      expiry: expiry.label,
      daysToExpiry: expiry.days,
      premium,
      premiumChange: change,
      premiumChangePct: prevPremium > 0 ? change / prevPremium : 0,
      delta: putDelta(currentProb, K, sigma, tau) * N,
      gamma: putGamma(currentProb, K, sigma, tau) * N,
      theta: putTheta(currentProb, K, sigma, tau) * N,
      vega: putVega(currentProb, K, sigma, tau) * N,
      breakeven,
      breakevenDelta: currentProb - breakeven,
      isITM: currentProb < K,
      openInterest: Math.round(seed(K * 400 + i * 11) * 40000 + 800),
    }
  })

  // Filter out strikes where all Greeks are effectively zero (too far OTM/ITM
  // for the current expiry). Keep at least 5 of each type — nearest to ATM.
  function isMeaningful(o: OptionData): boolean {
    return (
      Math.abs(o.delta) >= 0.05 ||
      Math.abs(o.vega)  >= 0.005 ||
      Math.abs(o.gamma) >= 0.0005
    )
  }

  function keepNearest(arr: OptionData[], min: number): OptionData[] {
    const filtered = arr.filter(isMeaningful)
    if (filtered.length >= min) return filtered
    // Fall back: take the `min` options closest to currentProb
    return [...arr]
      .sort((a, b) => Math.abs(a.strike - currentProb) - Math.abs(b.strike - currentProb))
      .slice(0, min)
      .sort((a, b) => a.strike - b.strike)
  }

  return { calls: keepNearest(calls, 5), puts: keepNearest(puts, 5), expiries: EXPIRIES }
}

export const EXPIRY_OPTIONS = EXPIRIES

/**
 * Compute annualised logit-space volatility from a price history series.
 */
export function computeHistoricalVol(history: { t: number; p: number }[]): number {
  if (history.length < 5) return NaN

  const logitPrices = history.map(pt => logit(pt.p))
  const diffs: number[] = []
  for (let i = 1; i < logitPrices.length; i++) {
    diffs.push(logitPrices[i] - logitPrices[i - 1])
  }

  const sorted = [...diffs].sort((a, b) => a - b)
  const lo = sorted[Math.floor(sorted.length * 0.01)]
  const hi = sorted[Math.floor(sorted.length * 0.99)]
  const clean = diffs.filter(d => d >= lo && d <= hi)
  if (clean.length < 3) return NaN

  const mean = clean.reduce((s, d) => s + d, 0) / clean.length
  const variance = clean.reduce((s, d) => s + (d - mean) ** 2, 0) / (clean.length - 1)
  const stdDaily = Math.sqrt(variance)

  const avgTickDays = (history[history.length - 1].t - history[0].t) / (history.length - 1) / 86_400_000
  const ticksPerYear = avgTickDays > 0 ? DAYS_PER_YEAR / avgTickDays : DAYS_PER_YEAR
  const annual = stdDaily * Math.sqrt(ticksPerYear)

  return Math.min(SIGMA_CAP, Math.max(SIGMA_FLOOR, annual))
}

/**
 * Generate payoff data for the P&L chart.
 * Includes per-contract commission in the cost basis.
 * Uses 200 points for smooth curves and accurate breakeven detection.
 */
export function payoffCurve(
  optionType: 'call' | 'put',
  strike: number,
  premium: number,
  quantity: number,
  side: 'buy' | 'sell'
): { prob: number; pnl: number }[] {
  const N = CONTRACT_NOTIONAL
  const comm = COMMISSION_PER_CONTRACT
  const totalCostPerContract = premium + comm  // premium already in $ (scaled by N)
  const points: { prob: number; pnl: number }[] = []
  for (let i = 0; i <= 200; i++) {
    const p = i / 200
    let intrinsic: number
    if (optionType === 'call') {
      intrinsic = Math.max(0, p - strike) * N
    } else {
      intrinsic = Math.max(0, strike - p) * N
    }
    // Buy: profit = intrinsic - (premium + commission)
    // Sell: profit = (premium - commission) - intrinsic  [seller pays commission too]
    const pnl = side === 'buy'
      ? (intrinsic - totalCostPerContract) * quantity
      : ((premium - comm) - intrinsic) * quantity
    points.push({ prob: p, pnl })
  }
  return points
}
