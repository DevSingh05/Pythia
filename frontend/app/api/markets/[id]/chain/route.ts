import { NextRequest, NextResponse } from 'next/server'
import { computeHistoricalVol } from '@/lib/pricing'

const MDS = process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3001'
const PRICER = process.env.PRICING_SERVICE_URL || 'http://localhost:8000'

/** Map UI expiry label → calendar days (must match pricer EXPIRY_GRID). */
function parseExpiryDays(label: string | null): number | null {
  if (!label) return null
  const u = label.trim().toUpperCase()
  if (u === '1W') return 7
  if (u === '2W') return 14
  if (u === '1M') return 30
  const m = u.match(/^(\d+)D$/)
  if (m) return parseInt(m[1], 10)
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const expiryParam = req.nextUrl.searchParams.get('expiry')
  const expiryDays = parseExpiryDays(expiryParam)
  
  try {
    // 1. Get current probability and vol from market-data-service
    const mdsRes = await fetch(`${MDS}/markets/${id}`, { next: { revalidate: 5 } })
    if (!mdsRes.ok) {
      return NextResponse.json({ error: `Backend returned ${mdsRes.status} ${mdsRes.statusText} for id ${id}` }, { status: 404 })
    }
    const market = await mdsRes.json()

    let impliedVol = 1.5
    try {
      const volRes = await fetch(`${MDS}/markets/${id}/vol`, { next: { revalidate: 60 } })
      if (volRes.ok) {
        const volData = await volRes.json()
        impliedVol = volData.sigma ?? 1.5
      }
    } catch { /* keep default */ }

    // Historical vol from tick history (same pipeline as pricing.ts); fall back to pricing σ if sparse
    let historicalVol = impliedVol
    try {
      const histRes = await fetch(`${MDS}/markets/${id}/history?days=30`, { next: { revalidate: 120 } })
      if (histRes.ok) {
        const histJson = await histRes.json()
        const series = Array.isArray(histJson.history) ? histJson.history : []
        const hv = computeHistoricalVol(series as { t: number; p: number }[])
        if (Number.isFinite(hv)) historicalVol = hv
      }
    } catch { /* use impliedVol */ }

    // 2. Query Python Pricing Service
    const chainReq = {
      p0: market.current_prob ?? 0.5,
      sigma: impliedVol,
      n_steps: 50
    }

    const pRes = await fetch(`${PRICER}/chain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chainReq),
      next: { revalidate: 5 }
    })

    if (!pRes.ok) return NextResponse.json({ error: 'Pricer failed' }, { status: 502 })
    const chainData = await pRes.json()

    if (!chainData.chain) {
      return NextResponse.json({ error: 'Invalid pricer response' }, { status: 502 })
    }

    // Filter to requested maturity (API returns all τ from pricer; client sends ?expiry=7D)
    let rows = chainData.chain as any[]
    if (expiryDays != null) {
      const filtered = rows.filter((c: any) => c.tau_days === expiryDays)
      rows = filtered.length > 0 ? filtered : rows.filter((c: any) => c.tau_days === 7)
    }

    // 3. Format to OptionsChainResponse
    const expiries: string[] = Array.from(
      new Set((chainData.chain as any[]).map((c: any) => `${c.tau_days}D`)),
    ).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))

    const calls = rows.map((c: any) => ({
      strike: c.strike,
      type: 'call',
      expiry: c.tau_days + 'D',
      daysToExpiry: c.tau_days,
      premium: c.call_price,
      premiumChange: 0,
      premiumChangePct: 0,
      delta: c.delta,
      gamma: c.gamma,
      theta: c.theta,
      vega: c.vega,
      breakeven: c.strike + c.call_price,
      breakevenDelta: 0,
      isITM: (market.current_prob ?? 0.5) > c.strike,
      openInterest: 0, // Placeholder
      impliedVol
    }))

    const puts = rows.map((c: any) => ({
      strike: c.strike,
      type: 'put',
      expiry: c.tau_days + 'D',
      daysToExpiry: c.tau_days,
      premium: c.put_price,
      premiumChange: 0,
      premiumChangePct: 0,
      delta: c.put_delta !== undefined ? c.put_delta : -c.delta,
      gamma: c.gamma,
      theta: c.put_theta !== undefined ? c.put_theta : c.theta,
      vega: c.put_vega !== undefined ? c.put_vega : c.vega,
      breakeven: c.strike - c.put_price,
      breakevenDelta: 0,
      isITM: (market.current_prob ?? 0.5) < c.strike,
      openInterest: 0, // Placeholder
      impliedVol
    }))
    
    return NextResponse.json({
       marketId: id,
       currentProb: market.current_prob ?? 0.5,
       impliedVol,
       historicalVol,
       expiries,
       calls,
       puts,
       updatedAt: new Date().toISOString()
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
