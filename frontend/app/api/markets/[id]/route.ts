/**
 * Server-side proxy for a single Polymarket Gamma API market.
 * Also fetches the parent event so we have the correct event slug for the Polymarket URL.
 */

import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.MARKET_DATA_SERVICE_URL ?? 'http://localhost:3001'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let mktRes: Response
  try {
    mktRes = await fetch(`${BACKEND}/markets/${id}`, { cache: 'no-store' })
  } catch {
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 })
  }

  const data = await mktRes.json().catch(() => null)
  return NextResponse.json(data, { status: mktRes.status })
}
