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
import { computeHistoricalVol } from '@/lib/pricing'

const MDS   = process.env.MARKET_DATA_SERVICE_URL || ''
const GAMMA = process.env.NEXT_PUBLIC_POLYMARKET_API ?? 'https://gamma-api.polymarket.com'
const CLOB  = 'https://clob.polymarket.com'

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
        const history: { t: number; p: number }[] = (raw.history ?? []).map((pt: { t: number; p: string | number }) => ({
          t: pt.t,
          p: typeof pt.p === 'string' ? parseFloat(pt.p) : pt.p,
        }))
        const sigma = computeHistoricalVol(history)
        if (Number.isFinite(sigma)) {
          return NextResponse.json({ sigma, source: 'historical' })
        }
      }
    } catch { /* fall through */ }
  }

  // ── 4. Default fallback ───────────────────────────────────────────────────────
  return NextResponse.json({ sigma: 1.5, source: 'default' })
}
