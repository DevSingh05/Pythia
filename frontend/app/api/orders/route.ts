/**
 * Paper-trading order handler.
 * Auth: clients send  Authorization: Bearer <supabase-access-token>
 *
 * JWT is verified server-side via supabase.auth.getUser(token) — the Supabase
 * admin client validates the signature against the auth server, so forged tokens
 * are rejected before any DB operation happens.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Allowed values for strict input validation
const VALID_TYPES = new Set(['call', 'put'])
const VALID_SIDES = new Set(['buy', 'sell'])
const VALID_STRIKES = new Set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
const MAX_QUANTITY = 1_000
const EXPIRY_RE = /^\d{4}-\d{2}-\d{2}$/   // YYYY-MM-DD

function log(label: string, data?: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[orders] ${label}`, data !== undefined ? JSON.stringify(data) : '')
  }
}

/**
 * In-memory token verification cache.
 * Supabase Auth has strict rate limits — without caching, every portfolio
 * refresh (every 30s) would hit the API and exhaust the free-tier quota.
 * We cache the verified user ID keyed by the last 64 chars of the token
 * (the signature portion) for TOKEN_CACHE_TTL_MS. Tokens expire after 1 hour
 * so a 5-minute cache is safe: it would still reject a revoked token within
 * TOKEN_CACHE_TTL_MS of revocation.
 */
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1_000   // 5 minutes
const tokenCache = new Map<string, { userId: string; expiresAt: number }>()

function cacheKey(token: string): string {
  // Use last 64 chars (JWT signature) — unique per token, avoids storing full JWT
  return token.slice(-64)
}

function getCachedUserId(token: string): string | null {
  const entry = tokenCache.get(cacheKey(token))
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    tokenCache.delete(cacheKey(token))
    return null
  }
  return entry.userId
}

function setCachedUserId(token: string, userId: string): void {
  // Evict stale entries if cache grows large (safety valve)
  if (tokenCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of tokenCache) {
      if (now > v.expiresAt) tokenCache.delete(k)
    }
  }
  tokenCache.set(cacheKey(token), { userId, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS })
}

/**
 * Verify a Supabase JWT by calling auth.getUser(token).
 * Results are cached for TOKEN_CACHE_TTL_MS to stay within Supabase rate limits.
 * Returns the user ID or null if the token is invalid/expired.
 */
async function verifyToken(token: string): Promise<string | null> {
  if (!token) return null

  // Return cached result if still fresh
  const cached = getCachedUserId(token)
  if (cached) return cached

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY || ANON_KEY, {
      auth: { persistSession: false },
    })
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user?.id) {
      log('token verification failed', error?.message)
      return null
    }
    setCachedUserId(token, data.user.id)
    return data.user.id
  } catch (e) {
    log('verifyToken error', String(e))
    return null
  }
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  return token || null
}

/** DB client using service role key (bypasses RLS for trusted server operations) */
function db() {
  return createClient(SUPABASE_URL, SERVICE_KEY || ANON_KEY, {
    auth: { persistSession: false },
  })
}

/** Validate and sanitize order fields. Returns an error string or null if valid. */
function validateOrderBody(body: Record<string, unknown>): string | null {
  const { marketId, strike, type, expiry, side, quantity, limitPrice } = body

  if (!marketId || typeof marketId !== 'string' || marketId.trim().length === 0) {
    return 'marketId is required'
  }
  if (typeof strike !== 'number' || !VALID_STRIKES.has(strike)) {
    return `strike must be one of: ${[...VALID_STRIKES].join(', ')}`
  }
  if (!VALID_TYPES.has(type as string)) {
    return 'type must be "call" or "put"'
  }
  if (!VALID_SIDES.has(side as string)) {
    return 'side must be "buy" or "sell"'
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return `quantity must be an integer between 1 and ${MAX_QUANTITY}`
  }
  if (typeof expiry !== 'string' || !EXPIRY_RE.test(expiry)) {
    return 'expiry must be a date string in YYYY-MM-DD format'
  }
  // Expiry must be in the future
  const expiryDate = new Date(expiry + 'T00:00:00Z')
  if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
    return 'expiry must be a future date'
  }
  if (limitPrice !== undefined && (typeof limitPrice !== 'number' || limitPrice < 0 || limitPrice > 1)) {
    return 'limitPrice must be a number between 0 and 1'
  }

  return null
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  log('--- POST /api/orders ---')

  // Auth check — reject unauthenticated requests
  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = await verifyToken(token)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validationError = validateOrderBody(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { marketId, strike, type, expiry, side, quantity, limitPrice, metadata } = body as {
    marketId: string
    strike: number
    type: 'call' | 'put'
    expiry: string
    side: 'buy' | 'sell'
    quantity: number
    limitPrice?: number
    metadata?: Record<string, unknown>  // full PaperOrder for cross-device reconstruction
  }

  const orderId = crypto.randomUUID()
  log('saving order', { orderId, userId: userId.slice(0, 8) + '…' })

  const { error: insertError } = await db().from('orders').insert({
    id: orderId,
    user_id: userId,
    market_id: marketId.trim(),
    strike,
    type,
    expiry,
    side,
    quantity,
    premium: limitPrice ?? null,
    status: 'filled',
    metadata: metadata ?? null,
  })

  if (insertError) {
    // Log the real error server-side only; never expose DB internals to clients
    console.error('[orders] INSERT ERROR:', insertError.message)
    return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
  }

  log('order saved OK', orderId)
  return NextResponse.json({ orderId, status: 'filled', filledAt: Date.now() })
}

// ─── GET /api/orders ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  log('--- GET /api/orders ---')

  const token = extractBearerToken(req)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = await verifyToken(token)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const marketId = req.nextUrl.searchParams.get('market')
  log('querying for user', { userId: userId.slice(0, 8) + '…', marketId })

  let query = db()
    .from('orders')
    .select('*')
    .eq('user_id', userId)   // users can only see their own orders
    .order('created_at', { ascending: false })

  if (marketId && typeof marketId === 'string' && marketId.trim()) {
    query = query.eq('market_id', marketId.trim())
  }

  const { data, error } = await query

  if (error) {
    console.error('[orders] SELECT ERROR:', error.message)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }

  log('returning rows', data?.length ?? 0)
  return NextResponse.json(data ?? [])
}

// ─── DELETE /api/orders ───────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  log('--- DELETE /api/orders ---')

  const token = extractBearerToken(req)
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = await verifyToken(token)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db()
    .from('orders')
    .delete()
    .eq('user_id', userId)

  if (error) {
    console.error('[orders] DELETE ERROR:', error.message)
    return NextResponse.json({ error: 'Failed to delete orders' }, { status: 500 })
  }

  log('all orders deleted for user', userId.slice(0, 8) + '…')
  return NextResponse.json({ deleted: true })
}
