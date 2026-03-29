/**
 * Server-side proxy for Polymarket CLOB price history.
 *
 * Data source: clob.polymarket.com/prices-history
 * Gamma API returns 404 for this endpoint with modern token IDs — CLOB is authoritative.
 *
 * We request fidelity=1440 (daily buckets). CLOB caps at 500 points, so:
 *   500 days × 1440 min = ~16 months of history — covers full market lifetime.
 */

import { NextRequest, NextResponse } from 'next/server'

const CLOB = 'https://clob.polymarket.com'

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()

  try {
    const upstream = await fetch(`${CLOB}/prices-history${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
    })
    const data = await upstream.json().catch(() => null)
    return NextResponse.json(data, { status: upstream.status })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Polymarket CLOB' }, { status: 502 })
  }
}
