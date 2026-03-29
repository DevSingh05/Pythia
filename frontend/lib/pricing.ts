/**
 * Logit-normal YES% options: American binomial (`americanOptionBinomial`) matches Python pricer.
 * European-style `vanillaCall` / `vanillaPut` remain for parity/reference and legacy bump Greeks.
 *
 * Underlying: p ∈ [0,1]; L = logit(p) with driftless BM in L.
 * Calendar τ in years = days/365.
 */

export const PROB_CLAMP = { lo: 1e-6, hi: 1 - 1e-6 } as const
export const SIGMA_FLOOR = 0.05
export const SIGMA_CAP = 5.0
/** Midpoint rule points for vanilla premiums (Greeks reuse same integrator). */
export const INTEGRATION_N = 400

/** Minimum σ√τ below which we treat terminal p as degenerate at current p (avoids 0/0 in binary d). */
const DEGENERATE_SIGTAU = 1e-12

export function safeProb(p: number): number {
  if (!Number.isFinite(p)) return 0.5
  return Math.min(PROB_CLAMP.hi, Math.max(PROB_CLAMP.lo, p))
}

export function clampSigma(sigma: number): number {
  if (!Number.isFinite(sigma) || sigma <= 0) return SIGMA_FLOOR
  return Math.min(SIGMA_CAP, Math.max(SIGMA_FLOOR, sigma))
}

/** Binomial tree steps for American options (match Python chain speed). */
export const AMERICAN_TREE_STEPS = 50

/**
 * American option on logit-normal YES% (same tree as Python `american_option_binomial`).
 */
export function americanOptionBinomial(
  p0: number,
  K: number,
  sigma: number,
  tau: number,
  N: number = AMERICAN_TREE_STEPS,
  kind: 'call' | 'put' = 'call',
): number {
  const p = safeProb(p0)
  if (tau <= 0) {
    return kind === 'call' ? Math.max(0, p - K) : Math.max(0, K - p)
  }

  const s = clampSigma(sigma)
  const dt = tau / N
  const sigmaT = s * Math.sqrt(dt)
  const q = 0.5
  const L0 = logit(p0)

  const V = new Float64Array(N + 1)
  for (let j = 0; j <= N; j++) {
    const LT = L0 + (2 * j - N) * sigmaT
    const pT = sigmoid(LT)
    V[j] = kind === 'call' ? Math.max(0, pT - K) : Math.max(0, K - pT)
  }

  for (let i = N - 1; i >= 0; i--) {
    const next = new Float64Array(i + 1)
    for (let j = 0; j <= i; j++) {
      const continuation = q * V[j + 1] + (1 - q) * V[j]
      const Lj = L0 + (2 * j - i) * sigmaT
      const pj = sigmoid(Lj)
      const exercise = kind === 'call' ? Math.max(0, pj - K) : Math.max(0, K - pj)
      next[j] = Math.max(continuation, exercise)
    }
    for (let j = 0; j <= i; j++) V[j] = next[j]
  }

  return V[0]
}

export interface AmericanGreeks {
  price: number
  delta: number
  gamma: number
  theta: number
  vega: number
}

/**
 * Bump-and-reprice Greeks on the American binomial (aligned with `backend/pricer.greeks`).
 */
export function americanGreeks(
  p0: number,
  K: number,
  sigma: number,
  tau: number,
  kind: 'call' | 'put',
  N: number = AMERICAN_TREE_STEPS,
): AmericanGreeks {
  const priceAt = (p: number, sig: number, t: number) =>
    americanOptionBinomial(safeProb(p), K, clampSigma(sig), Math.max(0, t), N, kind)

  const base = priceAt(p0, sigma, tau)

  const dp = 0.01
  const pUp = safeProb(p0 + dp)
  const pDn = safeProb(p0 - dp)
  const denP = pUp - pDn
  const delta = denP < 1e-15 ? 0 : (priceAt(pUp, sigma, tau) - priceAt(pDn, sigma, tau)) / denP

  const ds = 0.01
  const sigUp = clampSigma(sigma + ds)
  const sigDn = clampSigma(Math.max(sigma - ds, SIGMA_FLOOR))
  const denS = sigUp - sigDn
  const vega = denS < 1e-15 ? 0 : (priceAt(p0, sigUp, tau) - priceAt(p0, sigDn, tau)) / denS

  const dtDay = 1 / 365
  const tauBumped = Math.max(dtDay / 10, tau - dtDay)
  const theta = tau <= 0 ? 0 : (priceAt(p0, sigma, tauBumped) - base) / dtDay

  const gp = 0.005
  const rawGamma =
    (priceAt(safeProb(p0 + gp), sigma, tau) - 2 * base + priceAt(safeProb(p0 - gp), sigma, tau)) /
    (gp * gp)
  const gamma = rawGamma * 0.01

  return { price: base, delta, gamma, theta, vega }
}

export function logit(p: number): number {
  const x = safeProb(p)
  return Math.log(x / (1 - x))
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
 * Binary call price: pays $1 if p_T > K at expiry.
 * τ≤0 or σ√τ≈0 → step function at current p (no division by zero).
 */
export function binaryCall(p0: number, K: number, sigma: number, tau: number): number {
  const p = safeProb(p0)
  if (tau <= 0) return p > K ? 1 : p < K ? 0 : 0.5
  const s = clampSigma(sigma)
  const sigTau = s * Math.sqrt(tau)
  if (sigTau < DEGENERATE_SIGTAU) return p > K ? 1 : p < K ? 0 : 0.5
  const d = (logit(p0) - logit(K)) / sigTau
  return Phi(d)
}

export function binaryPut(p0: number, K: number, sigma: number, tau: number): number {
  return 1 - binaryCall(p0, K, sigma, tau)
}

function logitNormalPdf(l: number, L0: number, sigTau: number): number {
  const z = (l - L0) / sigTau
  return Math.exp(-0.5 * z * z) / (sigTau * Math.sqrt(2 * Math.PI))
}

/**
 * E[p_T] = E[sigmoid(L_T)] under driftless logit-normal (needed for put–call parity).
 */
export function expectedTerminalProb(p0: number, sigma: number, tau: number): number {
  if (tau <= 0) return safeProb(p0)
  const s = clampSigma(sigma)
  const L0 = logit(p0)
  const sigTau = s * Math.sqrt(tau)
  if (sigTau < DEGENERATE_SIGTAU) return safeProb(p0)

  const lMin = L0 - 6 * sigTau
  const lMax = L0 + 6 * sigTau
  const n = INTEGRATION_N
  const dl = (lMax - lMin) / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const l = lMin + (i + 0.5) * dl
    sum += sigmoid(l) * logitNormalPdf(l, L0, sigTau) * dl
  }
  return Math.min(PROB_CLAMP.hi, Math.max(PROB_CLAMP.lo, sum))
}

/**
 * Vanilla call: ∫ max(sigmoid(l)-K,0) · f_L(l) dl.
 * Integrates only l ≥ logit(K) (payoff 0 below kink). Midpoint rule, INTEGRATION_N points.
 */
export function vanillaCall(p0: number, K: number, sigma: number, tau: number): number {
  const p = safeProb(p0)
  if (tau <= 0) return Math.max(0, p - K)

  const s = clampSigma(sigma)
  const L0 = logit(p0)
  const LK = logit(K)
  const sigTau = s * Math.sqrt(tau)
  if (sigTau < DEGENERATE_SIGTAU) return Math.max(0, p - K)

  const lMinEff = Math.max(L0 - 6 * sigTau, LK)
  const lMax = L0 + 6 * sigTau
  if (lMinEff >= lMax) return 0

  const n = INTEGRATION_N
  const dl = (lMax - lMinEff) / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const l = lMinEff + (i + 0.5) * dl
    const payoff = sigmoid(l) - K
    if (payoff <= 0) continue
    sum += payoff * logitNormalPdf(l, L0, sigTau) * dl
  }
  return Math.max(0, sum)
}

/**
 * European put via parity: P = C - E[p_T] + K; floor at spot intrinsic max(K-p0,0) for early-exercise lower bound.
 */
export function vanillaPut(p0: number, K: number, sigma: number, tau: number): number {
  const p = safeProb(p0)
  const intrinsicSpot = Math.max(0, K - p)
  if (tau <= 0) return intrinsicSpot

  const E = expectedTerminalProb(p0, sigma, tau)
  const parity = vanillaCall(p0, K, sigma, tau) - E + K
  return Math.max(0, Math.max(intrinsicSpot, parity))
}

/** Clamp p for finite-difference bumps (same as safeProb range). */
function clampP(p: number): number {
  return safeProb(p)
}

/**
 * Delta (call): bump-and-reprice central difference on vanillaCall
 * Δ ∈ [0, 1] for calls
 */
export function callDelta(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.001
  const pUp = clampP(p0 + eps)
  const pDn = clampP(p0 - eps)
  const den = pUp - pDn
  if (den < 1e-15) return 0
  return (vanillaCall(pUp, K, sigma, tau) - vanillaCall(pDn, K, sigma, tau)) / den
}

/**
 * Delta (put): bump-and-reprice central difference on vanillaPut
 * Δ ∈ [-1, 0] for puts
 */
export function putDelta(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.001
  const pUp = clampP(p0 + eps)
  const pDn = clampP(p0 - eps)
  const den = pUp - pDn
  if (den < 1e-15) return 0
  return (vanillaPut(pUp, K, sigma, tau) - vanillaPut(pDn, K, sigma, tau)) / den
}

/**
 * Gamma: d²V/dp² normalised to "delta change per 1pp probability move".
 */
export function callGamma(p0: number, K: number, sigma: number, tau: number): number {
  const dp = 0.005
  const pUp = clampP(p0 + dp)
  const pDn = clampP(p0 - dp)
  const den = dp * dp
  const raw = (vanillaCall(pUp, K, sigma, tau) - 2 * vanillaCall(p0, K, sigma, tau) + vanillaCall(pDn, K, sigma, tau)) / den
  return raw * 0.01
}

export function putGamma(p0: number, K: number, sigma: number, tau: number): number {
  const dp = 0.005
  const pUp = clampP(p0 + dp)
  const pDn = clampP(p0 - dp)
  const den = dp * dp
  const raw = (vanillaPut(pUp, K, sigma, tau) - 2 * vanillaPut(p0, K, sigma, tau) + vanillaPut(pDn, K, sigma, tau)) / den
  return raw * 0.01
}

/**
 * Theta (call): time decay per day via bump-and-reprice
 * Θ = [V(τ − dt) − V(τ)] / dt  where dt = 1/365
 */
export function callTheta(p0: number, K: number, sigma: number, tau: number): number {
  const dt = 1 / 365
  if (tau <= 0) return 0
  const tauBumped = Math.max(dt / 10, tau - dt)
  return (vanillaCall(p0, K, sigma, tauBumped) - vanillaCall(p0, K, sigma, tau)) / dt
}

/**
 * Theta (put): time decay per day via bump-and-reprice
 */
export function putTheta(p0: number, K: number, sigma: number, tau: number): number {
  const dt = 1 / 365
  if (tau <= 0) return 0
  const tauBumped = Math.max(dt / 10, tau - dt)
  return (vanillaPut(p0, K, sigma, tauBumped) - vanillaPut(p0, K, sigma, tau)) / dt
}

/**
 * Vega (call): sensitivity to volatility via central difference
 * ν = [V(σ+ε) − V(σ−ε)] / (2ε); lower vol branch floored at SIGMA_FLOOR so σ−ε never hits 0.
 */
export function callVega(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.01
  const sigUp = clampSigma(sigma + eps)
  const sigDn = clampSigma(Math.max(sigma - eps, SIGMA_FLOOR))
  const den = sigUp - sigDn
  if (den < 1e-15) return 0
  return (vanillaCall(p0, K, sigUp, tau) - vanillaCall(p0, K, sigDn, tau)) / den
}

/**
 * Vega (put): sensitivity to volatility via central difference
 */
export function putVega(p0: number, K: number, sigma: number, tau: number): number {
  const eps = 0.01
  const sigUp = clampSigma(sigma + eps)
  const sigDn = clampSigma(Math.max(sigma - eps, SIGMA_FLOOR))
  const den = sigUp - sigDn
  if (den < 1e-15) return 0
  return (vanillaPut(p0, K, sigUp, tau) - vanillaPut(p0, K, sigDn, tau)) / den
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
  { label: '7D', days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
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
 */
export function availableStrikes(
  currentProb: number,
  sigma: number,
  tauDays: number,
  nStd = 2.5,
  minStrikes = 7,
): number[] {
  const tau = Math.max(0, tauDays) / 365
  const L0 = logit(currentProb)
  const sigTau = clampSigma(sigma) * Math.sqrt(tau)
  const halfWidth = Math.max(nStd * sigTau, 0.8)
  const Llo = L0 - halfWidth
  const Lhi = L0 + halfWidth

  const filtered = STRIKE_GRID.filter(K => {
    const LK = logit(K)
    return LK >= Llo && LK <= Lhi
  })

  if (filtered.length >= minStrikes) return filtered

  const sorted = [...STRIKE_GRID].sort((a, b) => Math.abs(logit(a) - L0) - Math.abs(logit(b) - L0))
  return [...new Set([...filtered, ...sorted.slice(0, minStrikes)])].sort((a, b) => a - b)
}

export function buildOptionsChain(
  currentProb: number,
  sigma: number,
  expiry: { label: string; days: number } = EXPIRIES[1],
  strikes?: number[],
): { calls: OptionData[]; puts: OptionData[]; expiries: typeof EXPIRIES } {
  const useStrikes = strikes ?? availableStrikes(currentProb, sigma, expiry.days)
  const tau = Math.max(0, expiry.days) / 365

  const seed = (s: number) => {
    const x = Math.sin(s) * 10000
    return x - Math.floor(x)
  }

  const calls: OptionData[] = useStrikes.map((K, i) => {
    const g = americanGreeks(currentProb, K, sigma, tau, 'call', AMERICAN_TREE_STEPS)
    const premium = g.price
    const rng = seed(K * 100 + i)
    const prevPremium = premium * (1 + (rng - 0.5) * 0.4)
    const change = premium - prevPremium
    const breakeven = Math.min(PROB_CLAMP.hi, K + premium)

    return {
      strike: K,
      type: 'call',
      expiry: expiry.label,
      daysToExpiry: expiry.days,
      premium,
      premiumChange: change,
      premiumChangePct: prevPremium > 0 ? change / prevPremium : 0,
      delta: g.delta,
      gamma: g.gamma,
      theta: g.theta,
      vega: g.vega,
      breakeven,
      breakevenDelta: breakeven - safeProb(currentProb),
      isITM: safeProb(currentProb) > K,
      openInterest: Math.round(seed(K * 300 + i * 7) * 50000 + 1000),
    }
  })

  const puts: OptionData[] = useStrikes.map((K, i) => {
    const g = americanGreeks(currentProb, K, sigma, tau, 'put', AMERICAN_TREE_STEPS)
    const premium = g.price
    const rng = seed(K * 200 + i * 3)
    const prevPremium = premium * (1 + (rng - 0.5) * 0.4)
    const change = premium - prevPremium
    const breakeven = Math.max(PROB_CLAMP.lo, K - premium)

    return {
      strike: K,
      type: 'put',
      expiry: expiry.label,
      daysToExpiry: expiry.days,
      premium,
      premiumChange: change,
      premiumChangePct: prevPremium > 0 ? change / prevPremium : 0,
      delta: g.delta,
      gamma: g.gamma,
      theta: g.theta,
      vega: g.vega,
      breakeven,
      breakevenDelta: safeProb(currentProb) - breakeven,
      isITM: safeProb(currentProb) < K,
      openInterest: Math.round(seed(K * 400 + i * 11) * 40000 + 800),
    }
  })

  return { calls, puts, expiries: EXPIRIES }
}

export const EXPIRY_OPTIONS = EXPIRIES

function percentile(sorted: number[], pct: number): number {
  const idx = (pct / 100) * (sorted.length - 1)
  const loI = Math.floor(idx)
  const hiI = Math.ceil(idx)
  return sorted[loI] + (sorted[hiI] - sorted[loI]) * (idx - loI)
}

function winsorizeDiffs(diffs: number[]): number[] {
  if (diffs.length === 0) return diffs
  const sorted = [...diffs].sort((a, b) => a - b)
  const lo = percentile(sorted, 1)
  const hi = percentile(sorted, 99)
  return diffs.map(d => Math.max(lo, Math.min(hi, d)))
}

/**
 * Compute annualised logit-space volatility from a price history series.
 * Returns NaN if there aren't enough data points (caller should fall back).
 *
 * Winsorize in place (clamp), do not drop observations.
 */
export function computeHistoricalVol(history: { t: number; p: number }[]): number {
  if (history.length < 5) return NaN

  const logitPrices = history.map(pt => logit(pt.p))
  const diffs: number[] = []
  for (let i = 1; i < logitPrices.length; i++) {
    const d = logitPrices[i] - logitPrices[i - 1]
    if (Number.isFinite(d)) diffs.push(d)
  }
  if (diffs.length < 3) return NaN

  const clean = winsorizeDiffs(diffs)
  const mean = clean.reduce((s, d) => s + d, 0) / clean.length
  const variance = clean.reduce((s, d) => s + (d - mean) ** 2, 0) / Math.max(1, clean.length - 1)
  const stdDaily = Math.sqrt(variance)
  if (stdDaily === 0 || !Number.isFinite(stdDaily)) return NaN

  const spanMs = history[history.length - 1].t - history[0].t
  const avgTickDays = spanMs > 0 ? spanMs / (history.length - 1) / 86_400_000 : 0
  const ticksPerYear = avgTickDays > 0 ? 365 / avgTickDays : 365
  const annual = stdDaily * Math.sqrt(ticksPerYear)

  return Math.min(SIGMA_CAP, Math.max(SIGMA_FLOOR, annual))
}

/**
 * Generate payoff data for the P&L chart
 */
export function payoffCurve(
  optionType: 'call' | 'put',
  strike: number,
  premium: number,
  quantity: number,
  side: 'buy' | 'sell',
): { prob: number; pnl: number }[] {
  const points: { prob: number; pnl: number }[] = []
  const prem = Number.isFinite(premium) ? premium : 0
  const qty = Number.isFinite(quantity) ? quantity : 0
  for (let i = 0; i <= 100; i++) {
    const p = i / 100
    let intrinsic: number
    if (optionType === 'call') {
      intrinsic = Math.max(0, p - strike)
    } else {
      intrinsic = Math.max(0, strike - p)
    }
    const pnl = side === 'buy'
      ? (intrinsic - prem) * qty
      : (prem - intrinsic) * qty
    points.push({ prob: p, pnl })
  }
  return points
}

/**
 * Expiry exercise value breakeven (same payoff as the diagram / intrinsic at T).
 * Long call: p* = K + c. Long put: p* = K − c. Short positions share the same zero on the sloped leg.
 */
export function expiryBreakevenProb(
  optionType: 'call' | 'put',
  strike: number,
  premium: number,
  side: 'buy' | 'sell',
): number | null {
  const K = strike
  const c = Number.isFinite(premium) ? Math.max(0, premium) : 0
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

  if (side === 'buy' && optionType === 'call') {
    const pStar = K + c
    if (pStar > 1) {
      const pnlAt1 = 1 - K - c
      return Math.abs(pnlAt1) < 1e-12 ? 1 : null
    }
    if (pStar < K) return null
    return clamp01(pStar)
  }

  if (side === 'buy' && optionType === 'put') {
    const pStar = K - c
    if (pStar < 0) {
      const pnlAt0 = K - c
      return Math.abs(pnlAt0) < 1e-12 ? 0 : null
    }
    if (pStar > K) return null
    return clamp01(pStar)
  }

  if (side === 'sell' && optionType === 'call') {
    return expiryBreakevenProb('call', K, c, 'buy')
  }
  if (side === 'sell' && optionType === 'put') {
    return expiryBreakevenProb('put', K, c, 'buy')
  }

  return null
}
