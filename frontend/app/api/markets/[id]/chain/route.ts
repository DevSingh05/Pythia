/**
 * Full options chain for a market.
 * Caching: Redis (TTL 5s) → Pricing Service → Redis.
 */

import { NextRequest, NextResponse } from "next/server";
import { redis, keys } from "@/lib/redis";

const PRICING = process.env.PRICING_SERVICE_URL!;
const MDS     = process.env.MARKET_DATA_SERVICE_URL!;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const condition_id = params.id;

  // 1. Redis cache hit
  const cached = await redis.get(keys.chain(condition_id));
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT" },
    });
  }

  // 2. Fetch current prob + vol from Redis (written by MDS poller)
  const probSnap = await redis.get<{ prob: number }>(keys.prob(condition_id));
  const volSnap  = await redis.get<{ sigma: number; source: string }>(keys.vol(condition_id));

  let p0    = probSnap?.prob  ?? 0.5;
  let sigma = volSnap?.sigma  ?? 0.3;

  // Fallback: ask MDS directly
  if (!probSnap) {
    try {
      const mRes = await fetch(`${MDS}/markets/${condition_id}`);
      if (mRes.ok) {
        const m = await mRes.json();
        p0    = m.current_prob  ?? p0;
        sigma = m.current_vol   ?? sigma;
      }
    } catch { /* use defaults */ }
  }

  // 3. Compute chain via Pricing Service
  const pRes = await fetch(`${PRICING}/chain`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p0, sigma }),
  });

  if (!pRes.ok) {
    return NextResponse.json({ error: "pricing unavailable" }, {
      status: 502,
      headers: { "X-Cache": "MISS" },
    });
  }

  const data = await pRes.json();

  // 4. Cache for 5s
  await redis.set(keys.chain(condition_id), data, 5);

  return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
}
