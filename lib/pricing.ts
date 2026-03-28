/**
 * Logit-Normal option pricing model for probability underliers.
 * Underlying: YES% on Polymarket (p ∈ [0,1])
 * Model: dL = σ dW where L = logit(p), logit is unbounded → Brownian motion
 */

export function logit(p: number): number {
  const clamped = Math.max(0.001, Math.min(0.999, p))
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

/**
 * Vanilla call: pays (p_T − K) if p_T > K
 * Numerical integration via midpoint rule over logit-normal distribution
 */
export function vanillaCall(p0: number, K: number, sigma: number, tau: number): number {
  const L0 = logit(p0)
  const sigTau = sigma * Math.sqrt(tau)
  const lMin = L0 - 5 * sigTau
  const lMax = L0 + 5 * sigTau
  const n = 200
  const dl = (lMax - lMin) / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const l = lMin + (i + 0.5) * dl
    const pT = sigmoid(l)
    const payoff = Math.max(pT - K, 0)
    const z = (l - L0) / sigTau
    const pdfVal = Math.exp(-0.5 * z * z) / (sigTau * Math.sqrt(2 * Math.PI))
    sum += payoff * pdfVal * dl
  }
  return Math.max(0, sum)
}

/** Vanilla put via put-call parity: V_put = V_call - (p0 - K) */
export function vanillaPut(p0: number, K: number, sigma: number, tau: number): number {
  return Math.max(0, vanillaCall(p0, K, sigma, tau) - (p0 - K))
}

/**
 * Delta: sensitivity of call premium to 1pp move in p0
 * Δ = φ(d) / (σ√τ · p₀(1-p₀))
 */
export function callDelta(p0: number, K: number, sigma: number, tau: number): number {
  const sigTau = sigma * Math.sqrt(tau)
  const d = (logit(p0) - logit(K)) / sigTau
  return phi(d) / (sigTau * p0 * (1 - p0))
}

export function putDelta(p0: number, K: number, sigma: number, tau: number): number {
  return -callDelta(p0, K, sigma, tau)
}

/**
 * Gamma: second-order sensitivity
 * Approximate numerically
 */
export function gamma(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.01
  const d1 = callDelta(Math.min(0.99, p0 + eps), K, sigma, tau)
  const d0 = callDelta(Math.max(0.01, p0 - eps), K, sigma, tau)
  return (d1 - d0) / (2 * eps)
}

/**
 * Theta: time decay per day
 * Θ = −φ(d) · d / (2τ)
 */
export function callTheta(p0: number, K: number, sigma: number, tau: number): number {
  const sigTau = sigma * Math.sqrt(tau)
  const d = (logit(p0) - logit(K)) / sigTau
  return (-phi(d) * d) / (2 * tau) / 365 // per day
}

/**
 * Vega: sensitivity to volatility
 * ν = −φ(d) · d / σ
 * (flips sign at strike — negative ITM, positive OTM)
 */
export function callVega(p0: number, K: number, sigma: number, tau: number): number {
  const sigTau = sigma * Math.sqrt(tau)
  const d = (logit(p0) - logit(K)) / sigTau
  return (-phi(d) * d) / sigma
}

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

export function buildOptionsChain(
  currentProb: number,
  sigma: number,
  expiry: { label: string; days: number } = EXPIRIES[1],
  strikes: number[] = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80]
): { calls: OptionData[]; puts: OptionData[]; expiries: typeof EXPIRIES } {
  const tau = expiry.days / 365

  // Seeded random for deterministic-looking daily changes
  const seed = (s: number) => {
    const x = Math.sin(s) * 10000
    return x - Math.floor(x)
  }

  const calls: OptionData[] = strikes.map((K, i) => {
    const premium = vanillaCall(currentProb, K, sigma, tau)
    const rng = seed(K * 100 + i)
    const prevPremium = premium * (1 + (rng - 0.5) * 0.4)
    const change = premium - prevPremium
    const breakeven = Math.min(0.999, K + premium)

    return {
      strike: K,
      type: 'call',
      expiry: expiry.label,
      daysToExpiry: expiry.days,
      premium,
      premiumChange: change,
      premiumChangePct: prevPremium > 0 ? change / prevPremium : 0,
      delta: callDelta(currentProb, K, sigma, tau),
      gamma: gamma(currentProb, K, sigma, tau),
      theta: callTheta(currentProb, K, sigma, tau),
      vega: callVega(currentProb, K, sigma, tau),
      breakeven,
      breakevenDelta: breakeven - currentProb,
      isITM: currentProb > K,
      openInterest: Math.round(seed(K * 300 + i * 7) * 50000 + 1000),
    }
  })

  const puts: OptionData[] = strikes.map((K, i) => {
    const premium = vanillaPut(currentProb, K, sigma, tau)
    const rng = seed(K * 200 + i * 3)
    const prevPremium = premium * (1 + (rng - 0.5) * 0.4)
    const change = premium - prevPremium
    const breakeven = Math.max(0.001, K - premium)

    return {
      strike: K,
      type: 'put',
      expiry: expiry.label,
      daysToExpiry: expiry.days,
      premium,
      premiumChange: change,
      premiumChangePct: prevPremium > 0 ? change / prevPremium : 0,
      delta: putDelta(currentProb, K, sigma, tau),
      gamma: gamma(currentProb, K, sigma, tau),
      theta: callTheta(currentProb, K, sigma, tau),
      vega: callVega(currentProb, K, sigma, tau),
      breakeven,
      breakevenDelta: currentProb - breakeven,
      isITM: currentProb < K,
      openInterest: Math.round(seed(K * 400 + i * 11) * 40000 + 800),
    }
  })

  return { calls, puts, expiries: EXPIRIES }
}

export const EXPIRY_OPTIONS = EXPIRIES

/**
 * Generate payoff data for the P&L chart
 * Returns array of {prob, pnl} points for the hockey-stick diagram
 */
export function payoffCurve(
  optionType: 'call' | 'put',
  strike: number,
  premium: number,
  quantity: number,
  side: 'buy' | 'sell'
): { prob: number; pnl: number }[] {
  const points: { prob: number; pnl: number }[] = []
  for (let i = 0; i <= 100; i++) {
    const p = i / 100
    let intrinsic: number
    if (optionType === 'call') {
      intrinsic = Math.max(0, p - strike)
    } else {
      intrinsic = Math.max(0, strike - p)
    }
    const pnl = side === 'buy'
      ? (intrinsic - premium) * quantity
      : (premium - intrinsic) * quantity
    points.push({ prob: p, pnl })
  }
  return points
}
