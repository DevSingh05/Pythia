/**
 * Pythia API client
 * Configure NEXT_PUBLIC_API_URL to point to your backend.
 * Falls back to Polymarket Gamma API for market data.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''
// Browser can't hit Gamma API directly (no CORS headers) — use local proxy routes instead
const MARKETS_BASE = API_BASE ? `${API_BASE}` : '/api'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    throw new ApiError(res.status, `API error ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

// ─── Market data ─────────────────────────────────────────────────────────────

export interface PolymarketMarket {
  id: string
  conditionId: string
  slug?: string
  question: string
  description: string
  endDateIso: string          // "2026-03-31" — camelCase from Gamma API
  endDate?: string            // full ISO fallback
  volume: number
  volume24hr: number
  liquidity: number
  outcomes: string[]
  outcomePrices: string | string[]
  clobTokenIds?: string[]     // [yesTokenId, noTokenId]
  tags: { id: string; label: string }[]
  active: boolean
  closed: boolean
  oneDayPriceChange?: number  // 24h probability change (-1 to 1)
  events?: { id: string; slug: string; title?: string }[]
}

export interface AppMarket {
  id: string
  conditionId: string
  slug: string
  clobTokenId: string    // YES token ID for /prices-history
  title: string
  description: string
  resolutionDate: string
  daysToResolution: number
  currentProb: number     // YES probability 0–1
  change24h: number       // pp change
  volume24h: number
  liquidity: number
  tags: string[]
  active: boolean
  closed: boolean
}

export interface PricePoint {
  t: number   // unix ms
  p: number   // 0–1
}

function toAppMarket(m: PolymarketMarket): AppMarket {
  const prices = (typeof m.outcomePrices === 'string'
    ? JSON.parse(m.outcomePrices)
    : m.outcomePrices) as string[]
  const yesProb = parseFloat(prices[0]) || 0

  // endDateIso is "YYYY-MM-DD"; fall back to endDate (full ISO)
  const resolutionStr = m.endDateIso ?? m.endDate ?? ''
  const resolution = new Date(resolutionStr)
  const daysLeft = resolutionStr
    ? Math.max(0, Math.ceil((resolution.getTime() - Date.now()) / 86_400_000))
    : 0

  // clobTokenIds[0] = YES token, required by Gamma /prices-history
  const clobTokenId = m.clobTokenIds?.[0] ?? ''

  // Use the parent event slug for the Polymarket URL — it matches polymarket.com/event/{slug}.
  // Market-level slugs sometimes include a numeric suffix that doesn't map to a real page.
  const eventSlug = m.events?.[0]?.slug ?? m.slug ?? m.conditionId

  return {
    id: m.id,
    conditionId: m.conditionId,
    slug: eventSlug,
    clobTokenId,
    title: m.question,
    description: m.description,
    resolutionDate: resolutionStr,
    daysToResolution: daysLeft,
    currentProb: yesProb,
    change24h: m.oneDayPriceChange ?? 0,
    volume24h: m.volume24hr ?? 0,
    liquidity: m.liquidity ?? 0,
    tags: m.tags?.map(t => t.label) ?? [],
    active: m.active,
    closed: m.closed,
  }
}

/** Fetch active markets. Uses Pythia backend if configured, else Polymarket directly. */
export async function fetchMarkets(params?: {
  limit?: number
  offset?: number
  tag?: string
  q?: string
}): Promise<AppMarket[]> {
  if (API_BASE) {
    // Your backend endpoint
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    if (params?.tag) qs.set('tag', params.tag)
    if (params?.q) qs.set('q', params.q)
    const res = await apiFetch<{ markets: any[] }>(`${API_BASE}/markets?${qs}`)
    return res.markets.map(m => ({
      id: m.condition_id,
      conditionId: m.condition_id,
      slug: m.slug ?? m.condition_id,
      clobTokenId: m.clob_token_id ?? '',
      title: m.question,
      description: m.description ?? '',
      resolutionDate: m.resolution_ts ?? '',
      daysToResolution: m.resolution_ts ? Math.max(0, Math.ceil((new Date(m.resolution_ts).getTime() - Date.now()) / 86_400_000)) : 0,
      currentProb: m.current_prob ?? 0.5,
      change24h: 0,
      volume24h: m.volume24h ?? 0,
      liquidity: m.liquidity ?? 0,
      tags: m.tags ? (typeof m.tags === 'string' ? JSON.parse(m.tags) : m.tags).map((t: any) => t.label ?? t) : [],
      active: m.active ?? true,
      closed: m.closed ?? false,
    }))
  }

  // Proxy fallback — browser can't hit Gamma directly (CORS)
  const qs = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: String(params?.limit ?? 20),
    offset: String(params?.offset ?? 0),
  })
  if (params?.tag) qs.set('tag', params.tag)
  if (params?.q) qs.set('q', params.q)
  const raw = await apiFetch<PolymarketMarket[]>(`${MARKETS_BASE}/markets?${qs}`)
  return raw.map(toAppMarket)
}

/** Fetch single market. */
export async function fetchMarket(id: string): Promise<AppMarket> {
  if (API_BASE) {
    const m = await apiFetch<any>(`${API_BASE}/markets/${id}`)
    return {
      id: m.condition_id,
      conditionId: m.condition_id,
      slug: m.slug ?? m.condition_id,
      clobTokenId: m.clob_token_id ?? '',
      title: m.question,
      description: m.description ?? '',
      resolutionDate: m.resolution_ts ?? '',
      daysToResolution: m.resolution_ts ? Math.max(0, Math.ceil((new Date(m.resolution_ts).getTime() - Date.now()) / 86_400_000)) : 0,
      currentProb: m.current_prob ?? 0.5,
      change24h: 0,
      volume24h: m.volume24h ?? 0,
      liquidity: m.liquidity ?? 0,
      tags: m.tags ? (typeof m.tags === 'string' ? JSON.parse(m.tags) : m.tags).map((t: any) => t.label ?? t) : [],
      active: m.active ?? true,
      closed: m.closed ?? false,
    }
  }
  const raw = await apiFetch<PolymarketMarket>(`${MARKETS_BASE}/markets/${id}`)
  return toAppMarket(raw)
}

// Official Gamma API interval enum: 1h | 6h | 1d | 1w | 1m | all
// Map our internal labels to what the API actually accepts
const INTERVAL_MAP: Record<string, string> = {
  '1h':  '1h',
  '6h':  '6h',
  '1d':  '1d',
  '7d':  '1w',   // "7d" is not valid — official value is "1w"
  '30d': '1m',   // "30d" is not valid — official value is "1m"
}

/** Fetch probability history for a market (CLOB time-series).
 *  @param tokenId  The YES CLOB token_id (market.clobTokenId) required by Gamma /prices-history.
 *                  Passing condition_id silently returns empty history.
 *  @param marketId The integer market ID, only used when routing through a custom backend.
 */
export async function fetchPriceHistory(
  tokenId: string,
  interval: '1h' | '6h' | '1d' | '7d' | '30d' = '7d',
  marketId?: string,
): Promise<PricePoint[]> {
  if (API_BASE && marketId) {
    const res = await apiFetch<{ history: PricePoint[] }>(`${API_BASE}/markets/${marketId}/history?interval=${interval}`)
    return res.history ?? []
  }
  if (!tokenId) return []
  const gammaInterval = INTERVAL_MAP[interval] ?? '1w'
  const res = await apiFetch<{ history: { t: number; p: number }[] }>(
    `${MARKETS_BASE}/prices-history?market=${tokenId}&interval=${gammaInterval}&fidelity=60`
  )
  return res.history ?? []
}

// ─── Options data (Pythia backend) ────────────────────────────────────────────

export interface OptionQuote {
  strike: number        // 0–1
  type: 'call' | 'put'
  expiry: string
  daysToExpiry: number
  premium: number       // USDC
  premiumChange: number
  premiumChangePct: number
  delta: number
  gamma: number
  theta: number
  vega: number
  breakeven: number
  breakevenDelta: number
  isITM: boolean
  openInterest: number
  impliedVol: number
}

export interface OptionsChainResponse {
  marketId: string
  currentProb: number
  impliedVol: number
  historicalVol: number
  expiries: string[]
  calls: OptionQuote[]
  puts: OptionQuote[]
  updatedAt: string
}

/** Fetch options chain from Pythia pricing engine. */
export async function fetchOptionsChain(
  marketId: string,
  expiry?: string
): Promise<OptionsChainResponse> {
  const qs = expiry ? `?expiry=${expiry}` : ''
  return apiFetch<OptionsChainResponse>(`${MARKETS_BASE}/markets/${marketId}/chain${qs}`)
}

/** Fetch current vol estimate for a market. */
export async function fetchVolatility(marketId: string): Promise<{ sigma: number; daysEstimated: number }> {
  if (API_BASE) {
    return apiFetch(`${API_BASE}/markets/${marketId}/vol`)
  }
  return apiFetch(`${MARKETS_BASE}/markets/${marketId}/vol`)
}

// ─── Order placement (Pythia backend) ─────────────────────────────────────────

export interface PlaceOrderRequest {
  marketId: string
  strike: number
  type: 'call' | 'put'
  expiry: string
  side: 'buy' | 'sell'
  quantity: number
  limitPrice?: number
  walletAddress: string
}

export interface PlaceOrderResponse {
  orderId: string
  status: 'pending' | 'filled' | 'partial'
  filledAt?: number
  fillPrice?: number
  txHash?: string
}

export async function placeOrder(order: PlaceOrderRequest): Promise<PlaceOrderResponse> {
  // With a backend: POST to backend which handles CLOB signing
  // Without a backend: POST to local Next.js API route which adds L2 headers
  const endpoint = API_BASE ? `${API_BASE}/orders` : '/api/orders'
  return apiFetch<PlaceOrderResponse>(endpoint, {
    method: 'POST',
    body: JSON.stringify(order),
  })
}

// ─── Portfolio (Pythia backend) ────────────────────────────────────────────────

export interface Position {
  marketId: string
  marketTitle: string
  strike: number
  type: 'call' | 'put'
  expiry: string
  side: 'long' | 'short'
  quantity: number
  avgCost: number
  currentValue: number
  pnl: number
  pnlPct: number
  delta: number
  theta: number
}

export async function fetchPortfolio(walletAddress: string): Promise<Position[]> {
  return apiFetch<Position[]>(`${API_BASE}/portfolio/${walletAddress}`)
}
