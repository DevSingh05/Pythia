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
  category:    string;
  endDate:     string | null;
  active:      boolean;
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
  const params = new URLSearchParams({
    q:      query,
    limit:  String(limit),
    active: "true",
  });
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
    return (await res.json()) as GammaMarket;
  } catch {
    return null;
  }
}

// ── Gamma — historical prices (public) ────────────────────────────────────────

export async function fetchHistoricalPrices(
  condition_id: string,
  days = 30
): Promise<GammaPricePoint[]> {
  const params = new URLSearchParams({
    market:   condition_id,
    interval: "1d",
    fidelity: "1",
  });
  try {
    const res = await fetch(`${GAMMA_BASE}/prices-history?${params}`, {
      signal: timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const history: GammaPricePoint[] = data.history ?? [];
    return history.slice(-days);
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
  return (
    market.tokens.find((t) => t.outcome.toLowerCase() === "yes")?.token_id ??
    null
  );
}
