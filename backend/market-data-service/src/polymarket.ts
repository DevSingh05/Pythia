/**
 * Polymarket API client.
 *
 * CLOB API (https://clob.polymarket.com)
 *   - Public endpoints: order book, price history — no auth needed
 *   - Authenticated endpoints: balances, orders, trades — L1 auth required
 *
 * Gamma API (https://gamma-api.polymarket.com)
 *   - Always public — market metadata + historical prices
 *
 * Auth: L1 API key credentials (authFetch from auth.ts)
 */

import { authFetch } from "./auth.js";

const CLOB_BASE  = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma-api.polymarket.com";
const TIMEOUT_MS = 8000;

function timeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrderBookRow {
  price: string;
  size:  string;
}

interface CLOBOrderBook {
  bids: OrderBookRow[];
  asks: OrderBookRow[];
}

export interface GammaMarket {
  conditionId: string;
  question:    string;
  description: string;
  category:    string;
  endDate:     string | null;
  active:      boolean;
  closed:      boolean;
  volume24hr:  number;
  liquidity:   number;
  slug?:       string;
  events?:     Array<{ id: string; slug: string; title?: string }>;
  clobTokenIds?: string[]; // [yesTokenId, noTokenId]
  tags?:       Array<{ id: string; label: string }>;
  tokens: Array<{
    token_id: string;
    outcome:  string;
    price:    number;
  }>;
}

interface GammaPricePoint {
  t: number;   // unix timestamp
  p: number;   // YES probability
}

// ── CLOB — public order book ───────────────────────────────────────────────────

/**
 * Fetch mid-price for a YES token from the CLOB order book.
 * This endpoint is public — no auth required.
 * Returns null on any failure; caller should fall back to cached value.
 */
export async function fetchMidPrice(token_id: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${CLOB_BASE}/book?token_id=${encodeURIComponent(token_id)}`,
      { signal: timeout(5000) }
    );
    if (!res.ok) {
      if (res.status === 429) console.warn("[polymarket] Rate limited on /book");
      return null;
    }

    const book = (await res.json()) as CLOBOrderBook;
    const best_bid = book.bids?.[0]?.price ? parseFloat(book.bids[0].price) : null;
    const best_ask = book.asks?.[0]?.price ? parseFloat(book.asks[0].price) : null;

    if (best_bid === null || best_ask === null) return null;

    const mid = (best_bid + best_ask) / 2;
    return Math.max(0.001, Math.min(0.999, mid));
  } catch {
    return null;
  }
}

/**
 * Fetch full order book (bids + asks) for a token.
 * Used by the frontend order-book depth view (Pro V2).
 */
export async function fetchOrderBook(
  token_id: string
): Promise<CLOBOrderBook | null> {
  try {
    const res = await fetch(
      `${CLOB_BASE}/book?token_id=${encodeURIComponent(token_id)}`,
      { signal: timeout(5000) }
    );
    if (!res.ok) return null;
    return (await res.json()) as CLOBOrderBook;
  } catch {
    return null;
  }
}

// ── CLOB — authenticated endpoints ────────────────────────────────────────────

/**
 * Check API key validity and return profile info.
 * Useful for startup health check.
 */
export async function verifyApiKey(): Promise<boolean> {
  try {
    const res = await authFetch(`${CLOB_BASE}/auth/api-key`, {
      method: "GET",
      signal: timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json();
      console.log("[polymarket] API key verified:", data);
      return true;
    }
    console.error("[polymarket] API key verification failed:", res.status, await res.text());
    return false;
  } catch (err) {
    console.error("[polymarket] API key verification error:", err);
    return false;
  }
}

/**
 * Get current USDC balance for the API key's linked wallet.
 */
export async function fetchBalance(): Promise<number | null> {
  try {
    const res = await authFetch(`${CLOB_BASE}/balance`, {
      method: "GET",
      signal: timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json() as { balance: string };
    return parseFloat(data.balance);
  } catch {
    return null;
  }
}

/**
 * Fetch open orders for the authenticated account.
 */
export async function fetchOpenOrders(): Promise<unknown[]> {
  try {
    const res = await authFetch(`${CLOB_BASE}/orders?status=OPEN`, {
      method: "GET",
      signal: timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json() as { data?: unknown[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch recent trade history for the authenticated account.
 */
export async function fetchTrades(limit = 50): Promise<unknown[]> {
  try {
    const res = await authFetch(
      `${CLOB_BASE}/data/trades?limit=${limit}`,
      { method: "GET", signal: timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { data?: unknown[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Gamma — market metadata (public) ──────────────────────────────────────────

export async function fetchMarkets(
  query: string,
  limit = 20
): Promise<GammaMarket[]> {
  // Use the official end_date_min filter to exclude already-resolved markets.
  // This is the correct API-level filter — no client-side date hacking needed.
  const todayIso = new Date().toISOString();
  const params = new URLSearchParams({
    active:        "true",
    closed:        "false",
    end_date_min:  todayIso,   // only markets whose resolution date is in the future
    limit:         String(limit),
    order:         "volume24hr",
    ascending:     "false",
  });
  if (query) params.set("q", query);

  try {
    const res = await fetch(`${GAMMA_BASE}/markets?${params}`, {
      signal: timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.markets ?? data ?? []) as GammaMarket[];
  } catch {
    return [];
  }
}

export async function fetchMarket(
  condition_id: string
): Promise<GammaMarket | null> {
  try {
    const res = await fetch(
      `${GAMMA_BASE}/markets/${encodeURIComponent(condition_id)}`,
      { signal: timeout(TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const market = (await res.json()) as GammaMarket;

    try {
      const evRes = await fetch(`${GAMMA_BASE}/events?market=${encodeURIComponent(condition_id)}`, { signal: timeout(TIMEOUT_MS) });
      if (evRes.ok) {
        const events = await evRes.json();
        if (Array.isArray(events) && events.length > 0) {
          market.events = events;
        }
      }
    } catch (e) {
      // Ignore event fetch failure
    }

    return market;
  } catch {
    return null;
  }
}

// ── Gamma — historical prices (public) ────────────────────────────────────────

/**
 * Fetch YES-price history from Gamma.
 *
 * IMPORTANT: the `market` param on /prices-history expects the CLOB token ID
 * (called "asset id" in the official docs), NOT the condition_id.
 * Passing condition_id silently returns empty history.
 *
 * Interval values per official API: max | all | 1m | 1w | 1d | 6h | 1h
 *   "1d" = last 24 hours, "1w" = last 7 days, "1m" = last 30 days, "all" = all time.
 *
 * @param clob_token_id  YES token ID from market.clobTokenIds[0]
 * @param days           Lookback window — determines which interval enum to use
 */
export async function fetchHistoricalPrices(
  clob_token_id: string,
  days = 30
): Promise<GammaPricePoint[]> {
  if (!clob_token_id) return [];

  // Map requested days → correct interval enum
  let interval: string;
  if (days <= 1)       interval = "1d";
  else if (days <= 7)  interval = "1w";
  else if (days <= 30) interval = "1m";
  else                 interval = "all";

  const params = new URLSearchParams({
    market:   clob_token_id,   // must be CLOB token ID, not condition_id
    interval,
    fidelity: "60",            // 60-minute buckets — good balance of detail vs size
  });
  try {
    const res = await fetch(`${GAMMA_BASE}/prices-history?${params}`, {
      signal: timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.history ?? []) as GammaPricePoint[];
  } catch {
    return [];
  }
}

// ── Token resolution ───────────────────────────────────────────────────────────

/**
 * Resolve YES token_id from condition_id.
 * CLOB operates on token IDs; Gamma returns them in market metadata.
 */
export async function resolveYesTokenId(
  condition_id: string
): Promise<string | null> {
  const market = await fetchMarket(condition_id);
  if (!market) return null;
  // Fallback to clobTokenIds if tokens array doesn't exist
  if (market.tokens && market.tokens.length > 0) {
    return (
      market.tokens.find((t) => t.outcome.toLowerCase() === "yes")?.token_id ??
      null
    );
  }
  return market.clobTokenIds?.[0] ?? null;
}
