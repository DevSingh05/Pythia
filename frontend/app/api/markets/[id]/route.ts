/**
 * Server-side proxy for a single Polymarket Gamma API market.
 */

import { NextRequest, NextResponse } from 'next/server'

const GAMMA = process.env.NEXT_PUBLIC_POLYMARKET_API ?? 'https://gamma-api.polymarket.com'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let mktRes: Response
  try {
    mktRes = await fetch(`${GAMMA}/markets/${id}`, { cache: 'no-store' })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Polymarket' }, { status: 502 })
  }

  const market = await mktRes.json().catch(() => null)
  return NextResponse.json(market, { status: mktRes.status })
}
