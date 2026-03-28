/**
 * Pythia Market Data Service — Bun HTTP server
 *
 * Responsibilities:
 *  - Poll Polymarket CLOB for live probabilities
 *  - Estimate volatility from historical data
 *  - Serve SSE streams to Next.js for live prob updates
 *  - Expose REST endpoints for market search, history, metadata
 *  - Detect market resolution and trigger auto-settlement
 */

/* eslint-disable */
declare const process: { env: Record<string, string | undefined> };
declare const Bun: { serve: (opts: { port: number; fetch: (req: Request) => Promise<Response> }) => unknown };
/* eslint-enable */

import { redis, keys }   from "./redis.js";
import { searchMarkets, getMarket, getProbHistory, listSimulations, getSimulationSeries, upsertMarket } from "./db.js";
import { fetchMarkets, fetchMarket, resolveYesTokenId, verifyApiKey } from "./polymarket.js";
import { estimateVol } from "./vol.js";
import { startPolling, registerMarket, onResolution } from "./poller.js";
import type { ResolutionEvent } from "./types.js";

const PORT = parseInt(process.env.PORT ?? "3001");

// Active SSE connections: condition_id → Set of writers
const sseClients = new Map<string, Set<ReadableStreamDefaultController>>();

// ── Resolution handler ─────────────────────────────────────────────────────────
onResolution(async (event: ResolutionEvent) => {
  console.log(`[resolution] ${event.condition_id} settled at ${event.value}`);
  // Broadcast resolution to all SSE clients watching this market
  broadcastProb(event.condition_id, event.value, true);
});

function broadcastProb(condition_id: string, prob: number, resolved = false): void {
  const clients = sseClients.get(condition_id);
  if (!clients || clients.size === 0) return;

  const msg = JSON.stringify({ prob, ts: new Date().toISOString(), resolved });
  const data = `data: ${msg}\n\n`;
  const encoder = new TextEncoder();

  for (const ctrl of clients) {
    try {
      ctrl.enqueue(encoder.encode(data));
    } catch {
      clients.delete(ctrl);
    }
  }
}

// Broadcast latest prob from Redis to SSE clients every second
setInterval(async () => {
  for (const condition_id of sseClients.keys()) {
    const snap = await redis.get<{ prob: number }>(keys.prob(condition_id));
    if (snap?.prob !== undefined) {
      broadcastProb(condition_id, snap.prob);
    }
  }
}, 1000);

// ── Routes ─────────────────────────────────────────────────────────────────────

async function router(req: Request): Promise<Response> {
  const url      = new URL(req.url);
  const pathname = url.pathname;

  // Health check
  if (pathname === "/health") {
    return json({ status: "ok", service: "market-data" });
  }

  // GET /markets?q=...
  if (pathname === "/markets" && req.method === "GET") {
    const q     = url.searchParams.get("q") ?? "";
    const limit = parseInt(url.searchParams.get("limit") ?? "20");

    // First try DB
    let markets = await searchMarkets(q, limit);

    // If empty, fall back to Polymarket Gamma API and hydrate DB
    if (markets.length === 0 && q.length > 0) {
      const raw = await fetchMarkets(q, limit);
      for (const m of raw) {
        await upsertMarket({
          condition_id:  m.conditionId,
          question:      m.question,
          category:      m.category,
          resolution_ts: m.endDate ?? undefined,
        });
      }
      markets = await searchMarkets(q, limit);
    }

    return json({ markets });
  }

  // GET /markets/:id
  const marketDetail = pathname.match(/^\/markets\/([^/]+)$/);
  if (marketDetail && req.method === "GET") {
    const condition_id = marketDetail[1];

    // Check Redis resolution flag
    const resolved = await redis.get(keys.resolved(condition_id));
    if (resolved) {
      return json({ ...resolved, resolved: true });
    }

    let market = await getMarket(condition_id);
    if (!market) {
      const raw = await fetchMarket(condition_id);
      if (!raw) return notFound();
      await upsertMarket({
        condition_id:  raw.conditionId,
        question:      raw.question,
        category:      raw.category,
        resolution_ts: raw.endDate ?? undefined,
      });
      market = await getMarket(condition_id);
    }

    // Ensure we're polling this market
    const token_id = await resolveYesTokenId(condition_id);
    if (token_id) registerMarket(condition_id, token_id);

    const prob_snap = await redis.get<{ prob: number }>(keys.prob(condition_id));
    const vol_snap  = await redis.get<{ sigma: number; source: string }>(keys.vol(condition_id));

    return json({
      ...market,
      current_prob: prob_snap?.prob ?? market?.current_prob,
      current_vol:  vol_snap?.sigma ?? market?.current_vol,
      vol_source:   vol_snap?.source ?? market?.vol_source,
    });
  }

  // GET /markets/:id/prob   — SSE stream
  const probStream = pathname.match(/^\/markets\/([^/]+)\/prob$/);
  if (probStream && req.method === "GET") {
    const condition_id = probStream[1];

    const stream = new ReadableStream({
      start(ctrl) {
        if (!sseClients.has(condition_id)) sseClients.set(condition_id, new Set());
        sseClients.get(condition_id)!.add(ctrl);

        // Send current prob immediately
        redis.get<{ prob: number }>(keys.prob(condition_id)).then((snap) => {
          if (snap?.prob !== undefined) {
            const encoder = new TextEncoder();
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ prob: snap.prob, ts: new Date().toISOString() })}\n\n`));
          }
        });
      },
      cancel(ctrl) {
        sseClients.get(condition_id)?.delete(ctrl as unknown as ReadableStreamDefaultController);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        Connection:       "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // GET /markets/:id/history?days=30
  const history = pathname.match(/^\/markets\/([^/]+)\/history$/);
  if (history && req.method === "GET") {
    const condition_id = history[1];
    const days = parseInt(url.searchParams.get("days") ?? "30");
    const rows = await getProbHistory(condition_id, days);
    return json({ condition_id, history: rows });
  }

  // GET /markets/:id/vol
  const volRoute = pathname.match(/^\/markets\/([^/]+)\/vol$/);
  if (volRoute && req.method === "GET") {
    const condition_id = volRoute[1];

    // Try Redis cache first
    const cached = await redis.get<{ sigma: number; source: string }>(keys.vol(condition_id));
    if (cached) return json(cached);

    // Compute from history
    const rows = await getProbHistory(condition_id, 30);
    const probs = rows.map((r) => r.prob).reverse();
    const result = estimateVol(probs);

    await redis.set(keys.vol(condition_id), result, 3600);
    return json(result);
  }

  // GET /simulation
  if (pathname === "/simulation" && req.method === "GET") {
    const sims = await listSimulations();
    return json({ simulations: sims });
  }

  // GET /simulation/:sim_id
  const simDetail = pathname.match(/^\/simulation\/([^/]+)$/);
  if (simDetail && req.method === "GET") {
    const sim_id = simDetail[1];
    const series = await getSimulationSeries(sim_id);
    if (!series.length) return notFound();
    return json({ sim_id, series });
  }

  return new Response("Not found", { status: 404 });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: "not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────────

startPolling();

const server = Bun.serve({ port: PORT, fetch: router });
console.log(`[market-data] Listening on :${PORT}`);
