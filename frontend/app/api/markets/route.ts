/**
 * Server-side proxy for Polymarket Gamma API market list.
 * Avoids CORS — the browser calls /api/markets, this calls gamma-api server-to-server.
 * Gamma API already includes an `events` array on each market in list responses.
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.MARKET_DATA_SERVICE_URL ?? 'http://localhost:3001'

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()
  const url = `${BACKEND}/markets${qs ? `?${qs}` : ''}`

  let upstream: Response
  try {
    upstream = await fetch(url, { next: { revalidate: 30 } })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Polymarket' }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  return NextResponse.json(data, { status: upstream.status })
}
