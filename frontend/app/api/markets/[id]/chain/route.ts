import { NextRequest, NextResponse } from 'next/server'

const MDS = process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3001'
const PRICER = process.env.PRICING_SERVICE_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    // 1. Get current probability and vol from market-data-service
    const mdsRes = await fetch(`${MDS}/markets/${id}`, { next: { revalidate: 5 } })
    if (!mdsRes.ok) {
      return NextResponse.json({ error: `Backend returned ${mdsRes.status} ${mdsRes.statusText} for id ${id}` }, { status: 404 })
    }
    const market = await mdsRes.json()

    const volRes = await fetch(`${MDS}/markets/${id}/vol`, { next: { revalidate: 60 } })
    let impliedVol = 1.5
    if (volRes.ok) {
      const volData = await volRes.json()
      impliedVol = volData.sigma || 1.5
    }

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

    // 3. Format to OptionsChainResponse
    const expiries = Array.from(new Set(chainData.chain.map((c: any) => c.tau_days + 'D')))
    
    const calls = chainData.chain.map((c: any) => ({
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

    const puts = chainData.chain.map((c: any) => ({
      strike: c.strike,
      type: 'put',
      expiry: c.tau_days + 'D',
      daysToExpiry: c.tau_days,
      premium: c.put_price,
      premiumChange: 0,
      premiumChangePct: 0,
      delta: c.put_delta !== undefined ? c.put_delta : -c.delta, // put delta approx
      gamma: c.gamma,
      theta: c.theta,
      vega: c.vega,
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
       historicalVol: impliedVol * 0.9,
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
