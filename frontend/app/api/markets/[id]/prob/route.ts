/**
 * SSE relay: proxies the Market Data Service SSE stream to the browser.
 * The browser never calls the MDS directly.
 */

import { NextRequest } from "next/server";

const MDS = process.env.MARKET_DATA_SERVICE_URL!;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const upstream = await fetch(`${MDS}/markets/${params.id}/prob`, {
    headers: { Accept: "text/event-stream" },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream unavailable", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      Connection:      "keep-alive",
    },
  });
}
