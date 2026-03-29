/**
 * Server-side proxy for Polymarket price history.
 *
 * Gamma prices-history has LONG history going back to when the event was
 * first created (months of data). The CLOB endpoint only has data from
 * when the specific binary token started trading (typically shorter).
 *
 * Strategy: try Gamma first for full history; fall back to CLOB if Gamma
 * returns non-200 or empty data.
 */

import { NextRequest, NextResponse } from 'next/server'

const GAMMA = 'https://gamma-api.polymarket.com'
const CLOB  = 'https://clob.polymarket.com'

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()

  // Try Gamma first — has full event history going back to market creation
  try {
    const gammaRes = await fetch(`${GAMMA}/prices-history${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
    })
    if (gammaRes.ok) {
      const data = await gammaRes.json().catch(() => null)
      // Gamma returns { history: [...] } — only use it if history is non-empty
      if (Array.isArray(data?.history) && data.history.length > 0) {
        return NextResponse.json(data, { status: 200 })
      }
    }
  } catch { /* fall through */ }

  // Fall back to CLOB — shorter history but always up-to-date
  try {
    const clobRes = await fetch(`${CLOB}/prices-history${qs ? `?${qs}` : ''}`, {
      cache: 'no-store',
    })
    const data = await clobRes.json().catch(() => null)
    return NextResponse.json(data, { status: clobRes.status })
  } catch {
    return NextResponse.json({ error: 'Failed to reach Polymarket' }, { status: 502 })
  }
}
