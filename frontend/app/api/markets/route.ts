/**
 * Server-side proxy using the Gamma EVENTS endpoint.
 *
 * Fetches events, flattens markets, filters out resolved/closed/stale entries,
 * and supports client-side category filtering via tag slug matching.
 */

import { NextRequest, NextResponse } from 'next/server'

const GAMMA = process.env.NEXT_PUBLIC_POLYMARKET_API ?? 'https://gamma-api.polymarket.com'

/**
 * Map our UI category slugs to Gamma tag slugs.
 * A market matches if ANY of its tags match ANY slug in the category.
 */
const CATEGORY_TAG_MAP: Record<string, string[]> = {
  crypto:      ['crypto', 'bitcoin', 'ethereum', 'defi', 'nft', 'blockchain', 'solana', 'altcoins', 'exchange'],
  economics:   ['economics', 'economy', 'finance', 'stocks', 'fed', 'inflation', 'gdp', 'interest-rates', 'trade', 'business', 'ipos'],
  sports:      ['sports', 'nba', 'nfl', 'mlb', 'soccer', 'football', 'basketball', 'baseball', 'tennis', 'mma', 'ufc', 'boxing', 'hockey', 'nhl', 'golf', 'cricket'],
  science:     ['science', 'technology', 'tech', 'ai', 'space', 'climate', 'health', 'medicine', 'biotech'],
  geopolitics: ['geopolitics', 'war', 'china', 'russia', 'ukraine', 'nato', 'middle-east', 'india', 'europe', 'asia', 'iran', 'israel'],
}

/** Tags always excluded regardless of category filter. */
const EXCLUDED_TAGS = [
  // Politics
  'politics', 'elections', 'congress', 'trump', 'democrats', 'republicans', 'biden', 'senate', 'governor', 'presidential',
  // Entertainment / racing
  'eurovision', 'f1', 'racing', 'formula-1', 'formula1',
]

function parsePrice(outcomePrices: any): number {
  try {
    const arr = typeof outcomePrices === 'string' ? JSON.parse(outcomePrices) : outcomePrices
    return parseFloat(arr?.[0] ?? '0.5') || 0.5
  } catch { return 0.5 }
}

export async function GET(req: NextRequest) {
  const incoming = req.nextUrl.searchParams

  const q = incoming.get('q') ?? ''

  // Always fetch a large set — client-side filters and event grouping reduce the final count
  const fetchLimit = '150'

  const params = new URLSearchParams({
    active:    'true',
    closed:    'false',
    order:     'volume24hr',
    ascending: 'false',
    limit:     fetchLimit,
    offset:    incoming.get('offset') ?? '0',
  })
  if (q) params.set('q', q)

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

  const categoryFilter = (incoming.get('tag') ?? '').toLowerCase()
  const categoryTags = CATEGORY_TAG_MAP[categoryFilter] ?? []

  const MAX_NEGRISK_OUTCOMES = 5

  let markets = events.flatMap((event: any) => {
    const eventCtx = { id: event.id, slug: event.slug, title: event.title }
    let mktList: any[] = event.markets ?? []

    // Skip events where ALL markets are closed/resolved
    const activeMarkets = mktList.filter((m: any) => !m.closed)
    if (activeMarkets.length === 0) return []

    // Always exclude blocked content
    const eventTags = (event.tags ?? []).map((t: any) => (t.slug ?? '').toLowerCase())
    if (EXCLUDED_TAGS.some(pt => eventTags.includes(pt))) return []

    // Category filtering: check if event tags match the selected category
    if (categoryTags.length > 0) {
      const matches = categoryTags.some(ct => eventTags.includes(ct))
      if (!matches) return []
    }

    // Filter out closed/resolved individual markets
    mktList = activeMarkets.filter((m: any) => {
      const prob = parsePrice(m.outcomePrices)
      if (prob <= 0.001 || prob >= 0.999) return false
      return true
    })

    if (mktList.length === 0) return []

    if (event.negRisk && mktList.length > MAX_NEGRISK_OUTCOMES) {
      mktList = [...mktList]
        .sort((a, b) => (b.volume24hr ?? 0) - (a.volume24hr ?? 0))
        .slice(0, MAX_NEGRISK_OUTCOMES)
    }

    return mktList.map((mkt: any) => ({
      ...mkt,
      volume24hr: mkt.volume24hr ?? event.volume24hr ?? 0,
      liquidity:  mkt.liquidityNum ?? mkt.liquidity ?? event.liquidity ?? 0,
      negRisk: event.negRisk ?? false,
      events: [eventCtx],
      tags: mkt.tags ?? event.tags ?? [],
    }))
  })

  // Client-side q filter against individual market questions (Gamma q only matches event titles)
  if (q) {
    const qLower = q.toLowerCase()
    markets = markets.filter((mkt: any) =>
      (mkt.question ?? '').toLowerCase().includes(qLower) ||
      (mkt.events?.[0]?.title ?? '').toLowerCase().includes(qLower)
    )
  }

  return NextResponse.json(markets, { status: 200 })
}
