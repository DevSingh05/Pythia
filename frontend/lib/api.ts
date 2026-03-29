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
    let msg = `API error ${res.status}: ${res.statusText}`
    try {
      const data = await res.json()
      if (data.error) msg = `API error ${res.status}: ${data.error}`
    } catch {}
    throw new ApiError(res.status, msg)
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
  endDateIso: string          // "YYYY-MM-DD" — camelCase from Gamma API
  endDate?: string            // full ISO fallback
  volume: number | string
  volume24hr: number | string
  liquidity: number | string  // string at market level inside events response
  liquidityNum?: number
  outcomes: string[] | string
  outcomePrices: string | string[]
  clobTokenIds?: string[] | string  // always JSON string in events endpoint
  tags?: { id: string; label: string }[]
  active: boolean
  closed: boolean
  oneDayPriceChange?: number
  negRisk?: boolean
  groupItemTitle?: string     // outcome label for negRisk markets (e.g. "Spain", "Haiti")
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
  // Event-level metadata (populated for multi-outcome / negRisk markets)
  eventTitle?: string     // e.g. "2026 FIFA World Cup Winner"
  outcomeLabel?: string   // e.g. "Spain" (groupItemTitle from Gamma)
  negRisk?: boolean       // true = this is one outcome of a multi-outcome event
}

export interface PricePoint {
  t: number   // unix ms
  p: number   // 0–1
}

function toAppMarket(m: PolymarketMarket): AppMarket {
  let prices: string[] = []
  try {
    prices = (typeof m.outcomePrices === 'string'
      ? JSON.parse(m.outcomePrices)
      : m.outcomePrices) ?? []
  } catch { /* malformed JSON — leave prices empty */ }
  const yesProb = parseFloat(prices[0]) || 0

  // endDateIso is "YYYY-MM-DD"; fall back to endDate (full ISO)
  const resolutionStr = m.endDateIso ?? m.endDate ?? ''
  const resolution = new Date(resolutionStr)
  const daysLeft = resolutionStr
    ? Math.max(0, Math.ceil((resolution.getTime() - Date.now()) / 86_400_000))
    : 0

  // clobTokenIds[0] = YES token, required by Gamma /prices-history
  // Always a JSON string in the events endpoint response
  let rawTokenIds: string[] | undefined
  try {
    rawTokenIds = typeof m.clobTokenIds === 'string'
      ? JSON.parse(m.clobTokenIds as unknown as string)
      : m.clobTokenIds
  } catch { /* leave undefined */ }
  const clobTokenId = rawTokenIds?.[0] ?? ''

  // Polymarket URLs use the EVENT slug: polymarket.com/event/{event-slug}
  // For negRisk outcomes (e.g. "Will Haiti win the World Cup?"), the parent
  // event slug (e.g. "2026-fifa-world-cup-winner-595") is the correct link.
  // For standalone binary markets the event slug == market slug.
  const parentEventSlug = m.events?.[0]?.slug
  const polySlug = parentEventSlug ?? m.slug ?? m.conditionId

  return {
    id: m.id,
    conditionId: m.conditionId,
    slug: polySlug,
    clobTokenId,
    title: m.question,
    description: m.description,
    resolutionDate: resolutionStr,
    daysToResolution: daysLeft,
    currentProb: yesProb,
    change24h: m.oneDayPriceChange ?? 0,
    volume24h: parseFloat(m.volume24hr as any) || 0,
    liquidity: parseFloat((m.liquidityNum ?? m.liquidity) as any) || 0,
    tags: m.tags?.map(t => t.label) ?? [],
    active: m.active,
    closed: m.closed,
    eventTitle: m.events?.[0]?.title,
    outcomeLabel: m.groupItemTitle,
    negRisk: m.negRisk ?? false,
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
    const res = await apiFetch<any>(`${API_BASE}/markets?${qs}`)
    const arr = Array.isArray(res) ? res : (res?.markets || [])

    // If the response came directly from Gamma (user configured backend to Gamma), use toAppMarket.
    // Gamma uses `conditionId` (camelCase) while the Pythia backend uses `condition_id` (snake_case).
    if (arr.length > 0 && arr[0].conditionId && !arr[0].condition_id) {
      return arr.flatMap((m: any) => { try { return [toAppMarket(m)] } catch { return [] } })
    }

    return arr.map((m: any) => ({
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
    limit: String(params?.limit ?? 20),
    offset: String(params?.offset ?? 0),
  })
  if (params?.tag) qs.set('tag', params.tag)
  if (params?.q) qs.set('q', params.q)
  const res = await apiFetch<unknown>(`${MARKETS_BASE}/markets?${qs}`)
  // Gamma returns a plain array; backend wraps in { markets: [...] }
  const arr: PolymarketMarket[] = Array.isArray(res)
    ? res
    : Array.isArray((res as any)?.markets)
      ? (res as any).markets
      : []
  return arr.flatMap(m => { try { return [toAppMarket(m)] } catch { return [] } })
}

/** Fetch single market. */
export async function fetchMarket(id: string): Promise<AppMarket> {
  if (API_BASE) {
    const m = await apiFetch<any>(`${API_BASE}/markets/${id}`)
    // When API_BASE points to our own Next.js proxy (/api), the response is
    // Gamma format (camelCase conditionId). When it points to the real Pythia
    // backend, it's snake_case (condition_id). Detect and route accordingly.
    if (m.conditionId && !m.condition_id) {
      return toAppMarket(m as PolymarketMarket)
    }
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


/** Fetch probability history for a market (CLOB time-series).
 *  Stitches daily (full lifetime) + hourly (recent detail) for complete coverage.
 *
 *  CLOB caps at ~500 buckets per request, so:
 *    fidelity=1440 (daily)  → ~500 days = full market lifetime
 *    fidelity=60   (hourly) → ~500 hours = ~21 days recent detail
 *
 *  We stitch: daily points for the old range + hourly for the recent range.
 */
export async function fetchPriceHistory(
  tokenId: string,
  _interval?: string,
  _marketId?: string,
): Promise<PricePoint[]> {
  if (!tokenId) return []
  const [resDaily, resHourly] = await Promise.all([
    apiFetch<{ history: { t: number; p: number }[] }>(`/api/prices-history?market=${tokenId}&interval=max&fidelity=1440`).catch(() => null),
    apiFetch<{ history: { t: number; p: number }[] }>(`/api/prices-history?market=${tokenId}&interval=max&fidelity=60`).catch(() => null)
  ])

  const daily = (resDaily?.history ?? []).map(pt => ({ t: pt.t * 1000, p: pt.p }))
  const hourly = (resHourly?.history ?? []).map(pt => ({ t: pt.t * 1000, p: pt.p }))

  if (hourly.length === 0) return daily
  if (daily.length === 0) return hourly

  const oldestHourly = hourly[0].t
  // Stitch: all daily points older than the first hourly point, plus all hourly points
  return [...daily.filter(pt => pt.t < oldestHourly), ...hourly]
}

/**
 * Fetch stitched price history for chart display.
 * Combines daily (full lifetime, ~272 pts) + hourly (recent ~21 days, ~500 pts)
 * to get both the full range AND recent detail — matching Polymarket's chart.
 *
 * Single request version available via `lite` flag for vol estimation.
 */
export async function fetchPriceHistoryFast(tokenId: string): Promise<PricePoint[]> {
  if (!tokenId) return []

  // Fetch daily (full lifetime) + hourly (recent detail) in parallel
  const [resDaily, resHourly] = await Promise.all([
    apiFetch<{ history: { t: number; p: number }[] }>(
      `/api/prices-history?market=${tokenId}&interval=max&fidelity=1440`
    ).catch(() => null),
    apiFetch<{ history: { t: number; p: number }[] }>(
      `/api/prices-history?market=${tokenId}&interval=max&fidelity=60`
    ).catch(() => null),
  ])

  const daily = (resDaily?.history ?? []).map(pt => ({ t: pt.t * 1000, p: pt.p }))
  const hourly = (resHourly?.history ?? []).map(pt => ({ t: pt.t * 1000, p: pt.p }))

  if (hourly.length === 0) return daily
  if (daily.length === 0) return hourly

  // Stitch: daily points for the old range + hourly for the recent range
  const oldestHourly = hourly[0].t
  return [...daily.filter(pt => pt.t < oldestHourly), ...hourly]
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