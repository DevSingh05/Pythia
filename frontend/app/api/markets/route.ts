/**
 * Server-side proxy for Polymarket Gamma API market list.
 * Avoids CORS — the browser calls /api/markets, this calls gamma-api server-to-server.
 */

import { NextRequest, NextResponse } from 'next/server'

const GAMMA = 'https://gamma-api.polymarket.com'

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()
  const url = `${GAMMA}/markets${qs ? `?${qs}` : ''}`

  let upstream: Response
  try {
    upstream = await fetch(url, { next: { revalidate: 30 } })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Polymarket' }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  return NextResponse.json(data, { status: upstream.status })
}
