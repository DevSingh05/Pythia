/**
 * Implied vol endpoint.
 * 1. Tries the Market Data Service (MDS) at MARKET_DATA_SERVICE_URL — used when
 *    the Python backend is running (typically one dev machine or production).
 * 2. Falls back to computing historical vol from Polymarket price history — used
 *    on all other machines so sigma is consistent regardless of local setup.
 *
 * Consistent sigma across all machines → consistent gamma in the options chain.
 */

import { NextRequest, NextResponse } from 'next/server'

const MDS   = process.env.MARKET_DATA_SERVICE_URL || ''
const GAMMA = process.env.NEXT_PUBLIC_POLYMARKET_API ?? 'https://gamma-api.polymarket.com'
const CLOB  = 'https://clob.polymarket.com'

function logit(p: number): number {
  const c = Math.max(0.001, Math.min(0.999, p))
  return Math.log(c / (1 - c))
}

/**
 * Compute annualised logit-space volatility from a price history series.
 * Mirrors the client-side computeHistoricalVol() in pricing.ts exactly so
 * every machine produces the same number for the same data.
 */
function computeVol(history: { t: number; p: number }[]): number | null {
  if (history.length < 5) return null

  const logitPrices = history.map(pt => logit(pt.p))
  const diffs: number[] = []
  for (let i = 1; i < logitPrices.length; i++) {
    diffs.push(logitPrices[i] - logitPrices[i - 1])
  }

  const sorted = [...diffs].sort((a, b) => a - b)
  const lo = sorted[Math.floor(sorted.length * 0.01)]
  const hi = sorted[Math.floor(sorted.length * 0.99)]
  const clean = diffs.filter(d => d >= lo && d <= hi)
  if (clean.length < 3) return null

  const mean = clean.reduce((s, d) => s + d, 0) / clean.length
  const variance = clean.reduce((s, d) => s + (d - mean) ** 2, 0) / (clean.length - 1)
  const stdDaily = Math.sqrt(variance)

  const avgTickDays =
    (history[history.length - 1].t - history[0].t) / (history.length - 1) / 86_400_000
  const ticksPerYear = avgTickDays > 0 ? 365 / avgTickDays : 252
  const annual = stdDaily * Math.sqrt(ticksPerYear)

  return Math.min(5.0, Math.max(0.05, annual))
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── 1. Try MDS (Python backend, one machine or production) ──────────────────
  if (MDS) {
    try {
      const res = await fetch(`${MDS}/markets/${id}/vol`, {
        signal: AbortSignal.timeout(2_000),
        next: { revalidate: 60 },
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.sigma) return NextResponse.json({ sigma: data.sigma, source: 'mds' })
      }
    } catch { /* fall through */ }
  }

  // ── 2. Fetch market to get the CLOB token ID ─────────────────────────────────
  let tokenId: string | null = null
  try {
    const mktRes = await fetch(`${GAMMA}/markets/${id}`, {
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    })
    if (mktRes.ok) {
      const mkt = await mktRes.json()
      const raw = typeof mkt.clobTokenIds === 'string'
        ? JSON.parse(mkt.clobTokenIds)
        : mkt.clobTokenIds
      tokenId = raw?.[0] ?? null
    }
  } catch { /* fall through */ }

  // ── 3. Fetch 30-day price history and compute vol ────────────────────────────
  if (tokenId) {
    try {
      const histRes = await fetch(
        `${CLOB}/prices-history?market=${tokenId}&interval=max&fidelity=1440`,
        { signal: AbortSignal.timeout(5_000), cache: 'no-store' }
      )
      if (histRes.ok) {
        const raw = await histRes.json()
        const history: { t: number; p: number }[] = (raw.history ?? []).map((pt: any) => ({
          t: pt.t,
          p: parseFloat(pt.p),
        }))
        const sigma = computeVol(history)
        if (sigma) {
          return NextResponse.json({ sigma, source: 'historical' })
        }
      }
    } catch { /* fall through */ }
  }

  // ── 4. Default fallback ───────────────────────────────────────────────────────
  return NextResponse.json({ sigma: 1.5, source: 'default' })
}
