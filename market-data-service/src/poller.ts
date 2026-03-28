/**
 * Market probability poller.
 *
 * Polls Polymarket CLOB at 1s intervals per market.
 * On each tick:
 *   1. Extract mid-price → p(t)
 *   2. Clamp to [0.001, 0.999]
 *   3. Publish to Redis (TTL 5s)
 *   4. Batch-write to Postgres (every 5s)
 *   5. Check for resolution (p → 0 or 1)
 *   6. Update in-memory circular buffer (last 500 ticks)
 */

import { redis, keys }    from "./redis.js";
import { insertProbTick, updateMarketProb } from "./db.js";
import { fetchMidPrice }  from "./polymarket.js";
import { estimateVol }    from "./vol.js";
import type { ResolutionEvent } from "./types.js";

const POLL_INTERVAL_MS  = 1000;
const BATCH_WRITE_TICKS = 5;
const BUFFER_SIZE       = 500;

// In-memory per-market state
const marketState = new Map<string, {
  tokenId:    string;
  buffer:     number[];  // circular buffer of last BUFFER_SIZE probs
  batchQueue: Array<{ prob: number; ts: Date }>;
  batchCount: number;
  lastVol:    number;
  volSource:  string;
}>();

let resolutionCallback: ((event: ResolutionEvent) => void) | null = null;

export function onResolution(cb: (event: ResolutionEvent) => void): void {
  resolutionCallback = cb;
}

export function registerMarket(condition_id: string, token_id: string): void {
  if (!marketState.has(condition_id)) {
    marketState.set(condition_id, {
      tokenId:    token_id,
      buffer:     [],
      batchQueue: [],
      batchCount: 0,
      lastVol:    0.30,
      volSource:  "estimated",
    });
  }
}

export function deregisterMarket(condition_id: string): void {
  marketState.delete(condition_id);
}

export function getActiveMarkets(): string[] {
  return Array.from(marketState.keys());
}

async function tick(condition_id: string): Promise<void> {
  const state = marketState.get(condition_id);
  if (!state) return;

  const prob = await fetchMidPrice(state.tokenId);
  if (prob === null) return;

  const ts = new Date();

  // Update circular buffer
  state.buffer.push(prob);
  if (state.buffer.length > BUFFER_SIZE) state.buffer.shift();

  // Publish to Redis (TTL 5s)
  await redis.set(
    keys.prob(condition_id),
    { prob, ts: ts.toISOString(), condition_id },
    5
  );

  // Batch DB writes
  state.batchQueue.push({ prob, ts });
  state.batchCount++;

  if (state.batchCount >= BATCH_WRITE_TICKS) {
    const batch = state.batchQueue.splice(0, state.batchQueue.length);
    state.batchCount = 0;
    // Fire-and-forget batch inserts
    Promise.all(batch.map((row) => insertProbTick(condition_id, row.prob, row.ts))).catch(
      console.error
    );
  }

  // Update market table (throttled)
  if (state.batchCount === 0) {
    updateMarketProb(condition_id, prob, state.lastVol, state.volSource).catch(
      console.error
    );
  }

  // Resolution detection
  if (prob <= 0.001 || prob >= 0.999) {
    const value = prob >= 0.999 ? 1 : 0;
    const event: ResolutionEvent = {
      condition_id,
      value: value as 0 | 1,
      ts:    ts.toISOString(),
    };
    await redis.set(keys.resolved(condition_id), event, 3600);
    resolutionCallback?.(event);
    console.log(`[poller] Market resolved: ${condition_id} → ${value}`);
    deregisterMarket(condition_id);
  }
}

// ── Vol refresh loop (every 1 hour per market) ─────────────────────────────────

export async function refreshVol(
  condition_id: string,
  histPrices: number[],
  fallbackSigma: number = 0.30
): Promise<void> {
  const state = marketState.get(condition_id);
  if (!state) return;

  const { estimateVol } = await import("./vol.js");
  const result = estimateVol(histPrices, fallbackSigma);

  state.lastVol   = result.sigma;
  state.volSource = result.source;

  await redis.set(keys.vol(condition_id), result, 3600);  // TTL 1h
  console.log(`[vol] ${condition_id}: σ=${result.sigma.toFixed(3)} (${result.source})`);
}

// ── Start polling all registered markets ──────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    const markets = getActiveMarkets();
    await Promise.allSettled(markets.map((id) => tick(id)));
  }, POLL_INTERVAL_MS);
  console.log("[poller] Started");
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
