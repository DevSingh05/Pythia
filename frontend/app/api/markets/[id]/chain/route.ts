import { NextRequest, NextResponse } from 'next/server'
import { computeHistoricalVol, buildOptionsChain, EXPIRY_OPTIONS } from '@/lib/pricing'

const MDS    = process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3001'
const PRICER = process.env.PRICING_SERVICE_URL     || 'http://localhost:8000'
const GAMMA  = process.env.NEXT_PUBLIC_POLYMARKET_API ?? 'https://gamma-api.polymarket.com'

function parseExpiryDays(label: string | null): number {
  if (!label) return 30
  const u = label.trim().toUpperCase()
  if (u === '1W')  return 7
  if (u === '2W')  return 14
  if (u === '1M')  return 30
  const m = u.match(/^(\d+)D$/)
  if (m) return parseInt(m[1], 10)
  return 30
}

/** Parse outcomePrices from any Polymarket market response shape. */
function parseGammaProb(m: any): number | null {
  try {
    const raw = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices
    if (!Array.isArray(raw) || raw.length === 0) return null
    const p = parseFloat(String(raw[0]))
    return Number.isFinite(p) && p > 0 && p < 1 ? p : null
  } catch { return null }
}

async function probFromGamma(id: string): Promise<number | null> {
  try {
    const res = await fetch(`${GAMMA}/markets/${id}`, {
      next: { revalidate: 10 },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    return parseGammaProb(await res.json())
  } catch { return null }
}

/** Keep only options with non-trivial delta or premium. Guarantees min 5 ATM-adjacent. */
function filterMeaningful(rows: any[], p0: number): any[] {
  const meaningful = rows.filter(r =>
    Math.abs(r.delta ?? 0) >= 0.008 || (r.call_price ?? r.put_price ?? 0) >= 0.00005
  )
  if (meaningful.length >= 5) return meaningful
  // fallback: take 5 closest to ATM
  return [...rows]
    .sort((a, b) => Math.abs(a.strike - p0) - Math.abs(b.strike - p0))
    .slice(0, 5)
    .sort((a, b) => a.strike - b.strike)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sp = req.nextUrl.searchParams
  const expiryDays = parseExpiryDays(sp.get('expiry'))

  // ── 1. Resolve p0 — client-supplied takes absolute priority ─────────────────
  let p0: number | null = null
  const p0Param = parseFloat(sp.get('p0') ?? '')
  if (Number.isFinite(p0Param) && p0Param > 0 && p0Param < 1) p0 = p0Param

  // ── 2. If no client p0, try MDS then Gamma ────────────────────────────────
  let mdsHasMarket = false
  if (p0 === null) {
    try {
      const mdsRes = await fetch(`${MDS}/markets/${id}`, {
        next: { revalidate: 5 },
        signal: AbortSignal.timeout(2000),
      })
      if (mdsRes.ok) {
        const market = await mdsRes.json()
        const v = market.current_prob ?? null
        if (v != null && v > 0 && v < 1) { p0 = v; mdsHasMarket = true }
      }
    } catch { /* fall through */ }
  }

  if (p0 === null) {
    p0 = await probFromGamma(id) ?? 0.5
  }

  // ── 3. Resolve implied vol ────────────────────────────────────────────────
  let impliedVol = 1.5
  if (mdsHasMarket) {
    try {
      const volRes = await fetch(`${MDS}/markets/${id}/vol`, {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(2000),
      })
      if (volRes.ok) {
        const v = (await volRes.json()).sigma ?? 1.5
        impliedVol = Math.max(v, 0.8)   // floor at 0.8 so short-dated chains are readable
      }
    } catch { /* keep 1.5 */ }
  }

  // ── 4. Historical vol ──────────────────────────────────────────────────────
  let historicalVol = impliedVol
  if (mdsHasMarket) {
    try {
      const histRes = await fetch(`${MDS}/markets/${id}/history?days=30`, {
        next: { revalidate: 120 },
        signal: AbortSignal.timeout(2000),
      })
      if (histRes.ok) {
        const j = await histRes.json()
        const hv = computeHistoricalVol(
          (Array.isArray(j.history) ? j.history : []) as { t: number; p: number }[]
        )
        if (Number.isFinite(hv) && hv > 0) historicalVol = hv
      }
    } catch { /* use impliedVol */ }
  }

  // ── 5. Python Pricing Service ──────────────────────────────────────────────
  try {
    const pRes = await fetch(`${PRICER}/chain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p0, sigma: impliedVol, n_steps: 50 }),
      signal: AbortSignal.timeout(3000),
    })

    if (pRes.ok) {
      const chainData = await pRes.json()
      const allRows: any[] = chainData.chain ?? []

      if (allRows.length > 0) {
        // Pick requested expiry, fall back to 30D
        let rows = allRows.filter(r => r.tau_days === expiryDays)
        if (rows.length === 0) rows = allRows.filter(r => r.tau_days === 30)

        // Keep 3 above ATM + ATM + 3 below, filter zero-premium
        const meaningful = filterMeaningful(rows, p0)
        const byDist = [...meaningful].sort((a, b) => Math.abs(a.strike - p0!) - Math.abs(b.strike - p0!))
        const atm = byDist[0]?.strike ?? p0
        const above = meaningful.filter(r => r.strike > atm).sort((a, b) => a.strike - b.strike).slice(0, 3)
        const below = meaningful.filter(r => r.strike < atm).sort((a, b) => b.strike - a.strike).slice(0, 3)
        const atmRow = meaningful.filter(r => r.strike === atm)

        // Final set, sorted DESCENDING (highest strike first) for display
        const selected = [...above, ...atmRow, ...below].sort((a, b) => b.strike - a.strike)

        const expiries = Array.from(new Set(allRows.map((c: any) => `${c.tau_days}D`)))
          .sort((a, b) => parseInt(a) - parseInt(b))

        const calls = selected.map((c: any) => ({
          strike: c.strike, type: 'call' as const,
          expiry: `${c.tau_days}D`, daysToExpiry: c.tau_days,
          premium: c.call_price, premiumChange: 0, premiumChangePct: 0,
          delta: c.delta, gamma: c.gamma, theta: c.theta, vega: c.vega,
          breakeven: Math.min(0.999, c.strike + c.call_price),
          breakevenDelta: 0, isITM: p0! > c.strike, openInterest: 0, impliedVol,
        }))

        const puts = selected.map((c: any) => ({
          strike: c.strike, type: 'put' as const,
          expiry: `${c.tau_days}D`, daysToExpiry: c.tau_days,
          premium: c.put_price, premiumChange: 0, premiumChangePct: 0,
          delta: c.put_delta ?? -c.delta, gamma: c.gamma,
          theta: c.put_theta ?? c.theta, vega: c.put_vega ?? c.vega,
          breakeven: Math.max(0.001, c.strike - c.put_price),
          breakevenDelta: 0, isITM: p0! < c.strike, openInterest: 0, impliedVol,
        }))

        return NextResponse.json({
          marketId: id, currentProb: p0, impliedVol, historicalVol,
          expiries, calls, puts, updatedAt: new Date().toISOString(),
        })
      }
    }
  } catch { /* fall through to TS pricer */ }

  // ── 6. TypeScript fallback ─────────────────────────────────────────────────
  const expiryOpt = EXPIRY_OPTIONS.find(e => e.days === expiryDays) ?? EXPIRY_OPTIONS[3]
  const chain = buildOptionsChain(p0, impliedVol, expiryOpt)

  // Sort descending for display
  const sortDesc = <T extends { strike: number }>(arr: T[]) =>
    [...arr].sort((a, b) => b.strike - a.strike)

  return NextResponse.json({
    marketId: id, currentProb: p0, impliedVol, historicalVol,
    expiries: EXPIRY_OPTIONS.map(e => e.label),
    calls: sortDesc(chain.calls).map(c => ({ ...c, impliedVol })),
    puts:  sortDesc(chain.puts).map(p => ({ ...p, impliedVol })),
    updatedAt: new Date().toISOString(),
  })
}
