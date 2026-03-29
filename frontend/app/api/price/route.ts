/**
 * Single-contract American option pricing.
 * Tries the Python pricing service (American binomial tree).
 * Falls back transparently to European vanilla if the service is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  vanillaCall,
  vanillaPut,
  callDelta,
  putDelta,
  callTheta,
  callGamma as calcGamma,
  callVega,
} from '@/lib/pricing'

const PRICER = process.env.PRICING_SERVICE_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  let body: {
    p0: number
    strike: number
    type: 'call' | 'put'
    tau_days: number
    sigma: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { p0, strike, type, tau_days, sigma } = body
  if (p0 == null || strike == null || !type || tau_days == null || sigma == null) {
    return NextResponse.json({ error: 'Missing required fields: p0, strike, type, tau_days, sigma' }, { status: 400 })
  }

  // ─── American binomial via Python pricing service ──────────────────────────
  try {
    const pricerRes = await fetch(`${PRICER}/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p0, strike, tau_days, sigma, kind: type, n_steps: 50 }),
      signal: AbortSignal.timeout(2_000),  // 2 s — don't block portfolio refresh
    })
    if (pricerRes.ok) {
      const d = await pricerRes.json()
      return NextResponse.json({
        price: d.price,
        delta: d.delta,
        theta: d.theta,
        vega:  d.vega,
        gamma: d.gamma,
        source: 'american',
      })
    }
  } catch {
    // Service unavailable — fall through to European vanilla fallback
  }

  // ─── European vanilla fallback (computed in TypeScript) ───────────────────
  const tau = tau_days / 365
  const price = type === 'call'
    ? vanillaCall(p0, strike, sigma, tau)
    : vanillaPut(p0, strike, sigma, tau)
  const delta = type === 'call'
    ? callDelta(p0, strike, sigma, tau)
    : putDelta(p0, strike, sigma, tau)
  const theta = callTheta(p0, strike, sigma, tau)
  const g     = calcGamma(p0, strike, sigma, tau)
  const vega  = callVega(p0, strike, sigma, tau)

  return NextResponse.json({ price, delta, theta, vega, gamma: g, source: 'european_fallback' })
}
