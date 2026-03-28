/**
 * Server-side proxy for Polymarket Gamma API price history.
 */

import { NextRequest, NextResponse } from 'next/server'

const GAMMA = 'https://gamma-api.polymarket.com'

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()
  const url = `${GAMMA}/prices-history${qs ? `?${qs}` : ''}`

  let upstream: Response
  try {
    upstream = await fetch(url, { next: { revalidate: 60 } })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Polymarket' }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  return NextResponse.json(data, { status: upstream.status })
}
