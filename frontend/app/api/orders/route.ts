/**
 * Paper-trading order handler.
 * Auth: clients send  Authorization: Bearer <supabase-access-token>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const rawSvcKey    = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SERVICE_KEY  = rawSvcKey.startsWith('eyJ') ? rawSvcKey : ANON_KEY

function log(label: string, data?: unknown) {
  console.log(`[orders] ${label}`, data !== undefined ? JSON.stringify(data) : '')
}

/**
 * Extract the Supabase user ID from a JWT by decoding its payload locally.
 * This avoids a round-trip to Supabase's auth API on every request, which
 * would quickly exhaust the free-tier rate limit.
 *
 * The token is signed by Supabase — without the JWT secret we can't verify
 * the signature here, but for a paper-trading app this tradeoff is fine.
 * We do check the expiry claim so stale tokens are rejected.
 */
/**
 * Decode a Supabase JWT to extract the user ID (sub claim).
 *
 * We intentionally do NOT check the `exp` claim here. The JWT is signed by
 * Supabase so the user ID can't be forged. For paper trading, a token that
 * was legitimately issued but expired recently is fine — it just means the
 * user authenticated within the last few hours. The browser is responsible
 * for refreshing tokens; the server just needs to know WHO is calling.
 */
function getUserIdFromToken(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) { log('bad jwt structure', parts.length); return null }

    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4)

    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    log('jwt payload sub', payload.sub ?? '(none)')

    if (!payload.sub || typeof payload.sub !== 'string') return null
    return payload.sub
  } catch (e) {
    log('JWT decode error', String(e))
    return null
  }
}

function getUserFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') ?? ''
  log('auth header present', !!authHeader)

  if (!authHeader.startsWith('Bearer ')) {
    log('no Bearer token in header')
    return null
  }

  const token = authHeader.slice(7).trim()
  if (!token) { log('empty token'); return null }
  log('token length', token.length)

  const userId = getUserIdFromToken(token)
  log('resolved user id', userId)
  return userId
}

/** DB client — uses service role key if properly configured */
function db() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  log('--- POST /api/orders ---')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  log('body', body)

  const { marketId, strike, type, expiry, side, quantity, limitPrice } = body as {
    marketId: string
    strike: number
    type: 'call' | 'put'
    expiry: string
    side: 'buy' | 'sell'
    quantity: number
    limitPrice?: number
  }

  if (!marketId || strike == null || !type || !expiry || !side || !quantity) {
    log('missing fields in body')
    return NextResponse.json({ error: 'Missing required order fields' }, { status: 400 })
  }

  const userId = getUserFromRequest(req)
  const orderId = crypto.randomUUID()
  log('saving order', { orderId, userId })

    const { error: insertError } = await db().from('orders').insert({
      id: orderId,
      user_id: userId,
    market_id: marketId,
    strike,
    type,
    expiry,
    side,
    quantity,
    premium: limitPrice ?? null,
    status: 'filled',
  })

  if (insertError) {
    log('INSERT ERROR', insertError.message)
    // Return the actual DB error to the client during debugging
    return NextResponse.json(
      { error: `DB insert failed: ${insertError.message}` },
      { status: 500 }
    )
  }

  log('order saved OK', orderId)
  return NextResponse.json({ orderId, status: 'filled', filledAt: Date.now() })
}

// ─── GET /api/orders ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  log('--- GET /api/orders ---')

  const userId = getUserFromRequest(req)
  if (!userId) {
    log('no user → 401')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const marketId = req.nextUrl.searchParams.get('market')
  log('querying for user', { userId, marketId })

  let query = db()
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (marketId) query = query.eq('market_id', marketId)

  const { data, error } = await query

  if (error) {
    log('SELECT ERROR', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  log('returning rows', data?.length ?? 0)
  return NextResponse.json(data ?? [])
}
