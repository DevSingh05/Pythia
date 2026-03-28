/**
 * Polymarket CLOB order proxy.
 *
 * This route adds L2 authentication headers (API key / HMAC signature / passphrase)
 * to every request before forwarding to the Polymarket CLOB API.
 *
 * L1 (wallet / EIP-712) signing is NOT handled here — the client must include a
 * fully signed order struct in the POST body.  See:
 *   https://docs.polymarket.com/#place-order
 *
 * Env vars required (server-side only, no NEXT_PUBLIC_ prefix):
 *   POLYMARKET_API_KEY
 *   POLYMARKET_SECRET   (base64-encoded)
 *   POLYMARKET_PASSPHRASE
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'

const CLOB_BASE = 'https://clob.polymarket.com'

function missingEnv(): NextResponse | null {
  const missing = ['POLYMARKET_API_KEY', 'POLYMARKET_SECRET', 'POLYMARKET_PASSPHRASE'].filter(
    k => !process.env[k]
  )
  if (missing.length === 0) return null
  return NextResponse.json(
    { error: `Missing server env vars: ${missing.join(', ')}` },
    { status: 500 }
  )
}

/**
 * Build the four L2 auth headers Polymarket's CLOB requires.
 * Signature = HMAC-SHA256(base64-decoded secret, timestamp + METHOD + path + body)
 * encoded as base64.
 */
function l2Headers(method: string, path: string, body: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const message = timestamp + method.toUpperCase() + path + body

  const keyBuffer = Buffer.from(process.env.POLYMARKET_SECRET!, 'base64')
  const signature = crypto.createHmac('sha256', keyBuffer).update(message).digest('base64')

  return {
    'POLY-API-KEY': process.env.POLYMARKET_API_KEY!,
    'POLY-TIMESTAMP': timestamp,
    'POLY-SIGNATURE': signature,
    'POLY-PASSPHRASE': process.env.POLYMARKET_PASSPHRASE!,
    'Content-Type': 'application/json',
  }
}

/** POST /api/orders — place an order on the CLOB */
export async function POST(req: NextRequest) {
  const envErr = missingEnv()
  if (envErr) return envErr

  const body = await req.text()
  const path = '/order'

  let upstream: Response
  try {
    upstream = await fetch(`${CLOB_BASE}${path}`, {
      method: 'POST',
      headers: l2Headers('POST', path, body),
      body,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to reach Polymarket CLOB' }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  return NextResponse.json(data, { status: upstream.status })
}

/** GET /api/orders — fetch open orders for a market or address */
export async function GET(req: NextRequest) {
  const envErr = missingEnv()
  if (envErr) return envErr

  // Forward any query params the client passes (market, owner, etc.)
  const qs = req.nextUrl.searchParams.toString()
  const path = qs ? `/orders?${qs}` : '/orders'

  let upstream: Response
  try {
    upstream = await fetch(`${CLOB_BASE}${path}`, {
      method: 'GET',
      headers: l2Headers('GET', path, ''),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to reach Polymarket CLOB' }, { status: 502 })
  }

  const data = await upstream.json().catch(() => null)
  return NextResponse.json(data, { status: upstream.status })
}
