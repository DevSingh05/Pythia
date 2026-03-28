/**
 * Server-side proxy for a single Polymarket Gamma API market.
 */

import { NextRequest, NextResponse } from 'next/server'

const GAMMA = 'https://gamma-api.polymarket.com'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  let upstream: Response
  try {
    upstream = await fetch(`${GAMMA}/markets/${params.id}`, { next: { revalidate: 30 } })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Polymarket' }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  return NextResponse.json(data, { status: upstream.status })
}
