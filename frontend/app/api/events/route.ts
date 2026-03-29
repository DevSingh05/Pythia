/**
 * Fetch all markets belonging to a Polymarket event by event slug.
 * Used to show sibling markets (e.g. O/U 137.5, 138.5, 139.5…) as tabs.
 */

import { NextRequest, NextResponse } from 'next/server'

const GAMMA = 'https://gamma-api.polymarket.com'

// Matches Polymarket placeholder outcome names like "Team AM", "Team AD", "Team AF"
// These are created before real participants are announced and have no real prices/volume.
const PLACEHOLDER_TEAM = /^Team\s+[A-Z]{1,4}$/

function parsePrice(outcomePrices: any): number {
  try {
    const arr = typeof outcomePrices === 'string' ? JSON.parse(outcomePrices) : outcomePrices
    return parseFloat(arr?.[0] ?? '0') || 0
  } catch {
    return 0
  }
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json([])

  try {
    const res = await fetch(`${GAMMA}/events?slug=${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    const events: any[] = Array.isArray(data) ? data : [data]
    const event = events.find((e: any) => e.slug === slug) ?? events[0]
    if (!event?.markets?.length) return NextResponse.json([])

    const markets = (event.markets as any[])
      .filter((m: any) => {
        if (m.closed) return false
        // Drop Polymarket placeholder outcomes (e.g. "Team AM", "Team AD")
        if (PLACEHOLDER_TEAM.test(m.groupItemTitle ?? '')) return false
        // Drop markets with no trading activity and default 50% price
        const vol = parseFloat(m.volume24hr ?? m.volume ?? '0') || 0
        const price = parsePrice(m.outcomePrices)
        if (vol === 0 && price === 0.5) return false
        return true
      })
      .sort((a: any, b: any) => {
        // Primary: sort by total volume descending (most-traded = frontrunners first)
        const va = parseFloat(a.volume ?? a.volume24hr ?? '0') || 0
        const vb = parseFloat(b.volume ?? b.volume24hr ?? '0') || 0
        if (vb !== va) return vb - va
        // Tiebreak: YES price descending
        return parsePrice(b.outcomePrices) - parsePrice(a.outcomePrices)
      })

    return NextResponse.json(markets)
  } catch {
    return NextResponse.json([])
  }
}
