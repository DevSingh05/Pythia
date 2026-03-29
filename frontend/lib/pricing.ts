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

/** Clamp p to avoid logit singularities */
function clampP(p: number): number {
  return Math.max(0.001, Math.min(0.999, p))
}

/**
 * Delta (call): bump-and-reprice central difference on vanillaCall
 * Δ ∈ [0, 1] for calls
 */
export function callDelta(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.001
  const pUp = clampP(p0 + eps)
  const pDn = clampP(p0 - eps)
  return (vanillaCall(pUp, K, sigma, tau) - vanillaCall(pDn, K, sigma, tau)) / (pUp - pDn)
}

/**
 * Delta (put): bump-and-reprice central difference on vanillaPut
 * Δ ∈ [-1, 0] for puts
 */
export function putDelta(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.001
  const pUp = clampP(p0 + eps)
  const pDn = clampP(p0 - eps)
  return (vanillaPut(pUp, K, sigma, tau) - vanillaPut(pDn, K, sigma, tau)) / (pUp - pDn)
}

/**
 * Gamma: d²V/dp² normalised to "delta change per 1pp probability move".
 *
 * Why not d²V/dp² raw?
 *   The [0,1] probability range creates curvature ~100x stock-world gamma
 *   (values of 25-30 at ATM). Unintuitive for traders.
 *
 * Why not d²V/dL² (logit-space)?
 *   Goes negative for deep ITM because sigmoid''(L) < 0 when p > 0.5.
 *   A long call showing negative gamma is misleading.
 *
 * Solution: probability-space d²V/dp² × 0.01 ("per 1pp").
 *   - Always non-negative for long vanilla options
 *   - Peaks ATM (~0.25), tapers to ~0 deep ITM/OTM
 *   - Comparable magnitude to stock-world gamma (~0.02)
 *   - Interpretation: "if probability moves 1pp, delta changes by Γ"
 */
export function callGamma(p0: number, K: number, sigma: number, tau: number): number {
  const dp = 0.005 // half-pp bump for stable second derivative
  const pUp = clampP(p0 + dp)
  const pDn = clampP(p0 - dp)
  const raw = (vanillaCall(pUp, K, sigma, tau) - 2 * vanillaCall(p0, K, sigma, tau) + vanillaCall(pDn, K, sigma, tau)) / (dp * dp)
  return raw * 0.01 // normalise to delta-change per 1pp
}

export function putGamma(p0: number, K: number, sigma: number, tau: number): number {
  const dp = 0.005
  const pUp = clampP(p0 + dp)
  const pDn = clampP(p0 - dp)
  const raw = (vanillaPut(pUp, K, sigma, tau) - 2 * vanillaPut(p0, K, sigma, tau) + vanillaPut(pDn, K, sigma, tau)) / (dp * dp)
  return raw * 0.01
}

/**
 * Theta (call): time decay per day via bump-and-reprice
 * Θ = [V(τ − dt) − V(τ)] / dt  where dt = 1/365
 */
export function callTheta(p0: number, K: number, sigma: number, tau: number): number {
  const dt = 1 / 365
  const tauBumped = Math.max(dt / 10, tau - dt) // avoid tau ≤ 0
  return (vanillaCall(p0, K, sigma, tauBumped) - vanillaCall(p0, K, sigma, tau)) / dt
}

/**
 * Theta (put): time decay per day via bump-and-reprice
 */
export function putTheta(p0: number, K: number, sigma: number, tau: number): number {
  const dt = 1 / 365
  const tauBumped = Math.max(dt / 10, tau - dt)
  return (vanillaPut(p0, K, sigma, tauBumped) - vanillaPut(p0, K, sigma, tau)) / dt
}

/**
 * Vega (call): sensitivity to volatility via central difference
 * ν = [V(σ+ε) − V(σ−ε)] / (2ε)
 */
export function callVega(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.01
  const sigUp = sigma + eps
  const sigDn = Math.max(0.01, sigma - eps)
  return (vanillaCall(p0, K, sigUp, tau) - vanillaCall(p0, K, sigDn, tau)) / (sigUp - sigDn)
}

/**
 * Vega (put): sensitivity to volatility via central difference
 */
export function putVega(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.01
  const sigUp = sigma + eps
  const sigDn = Math.max(0.01, sigma - eps)
  return (vanillaPut(p0, K, sigUp, tau) - vanillaPut(p0, K, sigDn, tau)) / (sigUp - sigDn)
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

// Fine strike grid — same philosophy as the Python backend's STRIKE_GRID
const STRIKE_GRID = [
  0.03, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.22, 0.25,
  0.28, 0.30, 0.33, 0.35, 0.38, 0.40, 0.42, 0.45, 0.48, 0.50,
  0.52, 0.55, 0.58, 0.60, 0.62, 0.65, 0.68, 0.70, 0.72, 0.75,
  0.78, 0.80, 0.82, 0.85, 0.88, 0.90, 0.92, 0.95, 0.97,
]

/**
 * Dynamic strike selection: include strikes within nStd logit-space
 * standard deviations from the current probability.
 * Mirrors Python backend available_strikes() logic.
 * Guarantees at least minStrikes around ATM even in low/high probability
 * or short-dated/low-vol markets.
 */
export function availableStrikes(
  currentProb: number,
  sigma: number,
  tauDays: number,
  nStd = 2.5,
  minStrikes = 7,
): number[] {
  const tau = tauDays / 365
  const L0 = logit(currentProb)
  const sigTau = sigma * Math.sqrt(tau)
  // Minimum logit-space half-width so short-dated/low-vol markets
  // still show a meaningful chain
  const halfWidth = Math.max(nStd * sigTau, 0.8)
  const Llo = L0 - halfWidth
  const Lhi = L0 + halfWidth

  const filtered = STRIKE_GRID.filter(K => {
    const LK = logit(K)
    return LK >= Llo && LK <= Lhi
  })

  if (filtered.length >= minStrikes) return filtered

  // Fall back: pad with closest strikes in logit space
  const sorted = [...STRIKE_GRID].sort((a, b) => Math.abs(logit(a) - L0) - Math.abs(logit(b) - L0))
  return [...new Set([...filtered, ...sorted.slice(0, minStrikes)])].sort((a, b) => a - b)
}

export function buildOptionsChain(
  currentProb: number,
  sigma: number,
  expiry: { label: string; days: number } = EXPIRIES[1],
  strikes?: number[],
): { calls: OptionData[]; puts: OptionData[]; expiries: typeof EXPIRIES } {
  // If no explicit strikes, compute dynamically based on current prob + vol
  const useStrikes = strikes ?? availableStrikes(currentProb, sigma, expiry.days)
  const tau = expiry.days / 365

  // Seeded random for deterministic-looking daily changes
  const seed = (s: number) => {
    const x = Math.sin(s) * 10000
    return x - Math.floor(x)
  }

  const calls: OptionData[] = useStrikes.map((K, i) => {
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
      gamma: callGamma(currentProb, K, sigma, tau),
      theta: callTheta(currentProb, K, sigma, tau),
      vega: callVega(currentProb, K, sigma, tau),
      breakeven,
      breakevenDelta: breakeven - currentProb,
      isITM: currentProb > K,
      openInterest: Math.round(seed(K * 300 + i * 7) * 50000 + 1000),
    }
  })

  const puts: OptionData[] = useStrikes.map((K, i) => {
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
      gamma: putGamma(currentProb, K, sigma, tau),
      theta: putTheta(currentProb, K, sigma, tau),
      vega: putVega(currentProb, K, sigma, tau),
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
 * Compute annualised logit-space volatility from a price history series.
 * Returns NaN if there aren't enough data points.
 *
 * Method: treat logit(p) as the log-price equivalent in Black-Scholes.
 *   σ_annual = std(ΔL) × √(trading_days_per_year)
 * where ΔL_i = logit(p_{i+1}) - logit(p_i) per day.
 *
 * @param history  Array of {t: unix-ms, p: 0-1} from Polymarket price history
 */
export function computeHistoricalVol(history: { t: number; p: number }[]): number {
  if (history.length < 5) return NaN

  // Compute logit-space daily returns, winsorise at 1st/99th percentile
  const logitPrices = history.map(pt => logit(pt.p))
  const diffs: number[] = []
  for (let i = 1; i < logitPrices.length; i++) {
    diffs.push(logitPrices[i] - logitPrices[i - 1])
  }

  // Winsorise to remove outliers
  const sorted = [...diffs].sort((a, b) => a - b)
  const lo = sorted[Math.floor(sorted.length * 0.01)]
  const hi = sorted[Math.floor(sorted.length * 0.99)]
  const clean = diffs.filter(d => d >= lo && d <= hi)
  if (clean.length < 3) return NaN

  // Population std dev of clean returns
  const mean = clean.reduce((s, d) => s + d, 0) / clean.length
  const variance = clean.reduce((s, d) => s + (d - mean) ** 2, 0) / (clean.length - 1)
  const stdDaily = Math.sqrt(variance)

  // Annualise: estimate avg time between ticks in days, scale to annual
  const avgTickDays = (history[history.length - 1].t - history[0].t) / (history.length - 1) / 86_400_000
  const ticksPerYear = avgTickDays > 0 ? 365 / avgTickDays : 252
  const annual = stdDaily * Math.sqrt(ticksPerYear)

  // Clamp to sane range: 0.05 – 5.0
  return Math.min(5.0, Math.max(0.05, annual))
}

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
