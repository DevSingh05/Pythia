/**
 * Early exercise boundary — cached in Redis (TTL 30s).
 */

import { NextRequest, NextResponse } from "next/server";
import { redis, keys } from "@/lib/redis";

const PRICING = process.env.PRICING_SERVICE_URL!;

export async function POST(req: NextRequest) {
  const body: { K: number; sigma: number; tau_days: number; kind: "call" | "put" } =
    await req.json();

  const cacheKey = keys.boundary("_", body.K, body.kind);

  const cached = await redis.get(cacheKey);
  if (cached) return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } });

  const res = await fetch(`${PRICING}/boundary`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "pricing unavailable" }, { status: 502 });
  }

  const data = await res.json();
  await redis.set(cacheKey, data, 30);

  return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
}
