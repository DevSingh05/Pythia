/**
 * Server-side proxy for a single Polymarket Gamma API market.
 * Enriches the response with event context (slug, title) so the client
 * can resolve the correct event slug for Polymarket links and sibling tabs.
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

  if (!mktRes.ok) {
    return NextResponse.json({ error: `Market not found` }, { status: mktRes.status })
  }

  const market = await mktRes.json().catch(() => null)
  if (!market) return NextResponse.json({ error: 'Invalid response' }, { status: 502 })

  // If the market has an eventId but no events array, fetch event context
  // so toAppMarket can resolve the event slug for Polymarket links.
  if (market.eventId && !market.events?.length) {
    try {
      const evtRes = await fetch(`${GAMMA}/events/${market.eventId}`, { cache: 'no-store' })
      if (evtRes.ok) {
        const evt = await evtRes.json()
        market.events = [{ id: evt.id, slug: evt.slug, title: evt.title }]
      }
    } catch { /* non-critical — proceed without event context */ }
  }

  return NextResponse.json(market)
}
