/**
 * Single-contract American option pricing.
 * Prefers the Python pricing service; falls back to the same American binomial in TypeScript.
 */

import { NextRequest, NextResponse } from 'next/server'
import { americanGreeks, AMERICAN_TREE_STEPS } from '@/lib/pricing'

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
    // Service unavailable — local American tree
  }

  const tau = tau_days / 365
  const g = americanGreeks(p0, strike, sigma, tau, type, AMERICAN_TREE_STEPS)
  return NextResponse.json({
    price: g.price,
    delta: g.delta,
    theta: g.theta,
    vega: g.vega,
    gamma: g.gamma,
    source: 'american_local',
  })
}
