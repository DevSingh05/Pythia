/**
 * Server-side proxy using the Gamma EVENTS endpoint.
 *
 * Per Polymarket docs, the events endpoint is the canonical source for
 * discovering markets: events contain embedded markets, and the event.slug
 * is what maps to polymarket.com/event/{slug}.
 *
 * We flatten event.markets[] and inject events[0] (the parent event) onto
 * each market object so toAppMarket can use the correct event slug for links.
 */

import { NextRequest, NextResponse } from 'next/server'

const GAMMA = process.env.NEXT_PUBLIC_POLYMARKET_API ?? 'https://gamma-api.polymarket.com'

export async function GET(req: NextRequest) {
  const incoming = req.nextUrl.searchParams

  const params = new URLSearchParams({
    active:       'true',
    closed:       'false',
    // Official Gamma sort field (no underscore, per API docs)
    order:        'volume24hr',
    ascending:    'false',
    limit:        incoming.get('limit')  ?? '20',
    offset:       incoming.get('offset') ?? '0',
  })
  if (incoming.get('q'))   params.set('q',      incoming.get('q')!)
  if (incoming.get('tag')) params.set('tag_id', incoming.get('tag')!)

  let upstream: Response
  try {
    upstream = await fetch(`${GAMMA}/events?${params}`, { cache: 'no-store' })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Polymarket' }, { status: 502 })
  }

  const events = await upstream.json().catch(() => [])
  if (!Array.isArray(events)) {
    return NextResponse.json(events, { status: upstream.status })
  }

  // Flatten: for each event, attach event context to every embedded market.
  // toAppMarket will use events[0].slug (the event slug) for the Polymarket link.
  //
  // NegRisk events (e.g. "2026 FIFA World Cup Winner") have 40+ outcome markets
  // (one per country). Showing all of them floods the list with near-zero-prob
  // outcomes like "Will Haiti win?". Cap negRisk events to the top 5 by volume.
  const MAX_NEGRISK_OUTCOMES = 5

  const markets = events.flatMap((event: any) => {
    const eventCtx = { id: event.id, slug: event.slug, title: event.title }
    let mktList: any[] = event.markets ?? []

    if (event.negRisk && mktList.length > MAX_NEGRISK_OUTCOMES) {
      // Keep only top outcomes by 24h volume to avoid list pollution
      mktList = [...mktList]
        .sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0))
        .slice(0, MAX_NEGRISK_OUTCOMES)
    }

    return mktList.map((mkt: any) => ({
      ...mkt,
      volume24hr: mkt.volume24hr ?? event.volume24hr ?? 0,
      liquidity:  mkt.liquidityNum ?? mkt.liquidity ?? event.liquidity ?? 0,
      events: [eventCtx],
    }))
  })

  return NextResponse.json(markets, { status: 200 })
}
