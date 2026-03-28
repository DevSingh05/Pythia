/**
 * Client-side API helpers for React Query.
 * All calls go through Next.js route handlers — never directly to Polymarket.
 */

const BASE = "";   // same origin

// ── Market endpoints ───────────────────────────────────────────────────────────

export async function searchMarkets(q: string) {
  const res = await fetch(`${BASE}/api/markets?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("searchMarkets failed");
  return res.json();
}

export async function getMarket(id: string) {
  const res = await fetch(`${BASE}/api/markets/${id}`);
  if (!res.ok) throw new Error("getMarket failed");
  return res.json();
}

export async function getHistory(id: string, days = 30) {
  const res = await fetch(`${BASE}/api/markets/${id}/history?days=${days}`);
  if (!res.ok) throw new Error("getHistory failed");
  return res.json();
}

export async function getChain(id: string) {
  const res = await fetch(`${BASE}/api/markets/${id}/chain`);
  if (!res.ok) throw new Error("getChain failed");
  return res.json();
}

// ── Pricing endpoints ──────────────────────────────────────────────────────────

export interface PriceRequest {
  p0:       number;
  strike:   number;
  tau_days: number;
  sigma:    number;
  kind:     "call" | "put";
}

export async function priceContract(req: PriceRequest) {
  const res = await fetch(`${BASE}/api/price`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(req),
  });
  if (!res.ok) throw new Error("priceContract failed");
  return res.json();
}

export async function getBoundary(req: {
  K: number; sigma: number; tau_days: number; kind: "call" | "put";
}) {
  const res = await fetch(`${BASE}/api/boundary`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(req),
  });
  if (!res.ok) throw new Error("getBoundary failed");
  return res.json();
}

export async function getPayoffCurve(legs: Array<{
  kind: "call" | "put"; strike: number; premium: number; size: number;
}>) {
  const res = await fetch(`${BASE}/api/payoff`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ legs }),
  });
  if (!res.ok) throw new Error("getPayoffCurve failed");
  return res.json();
}

// ── Simulation endpoints ───────────────────────────────────────────────────────

export async function listSimulations() {
  const res = await fetch(`${BASE}/api/simulation`);
  if (!res.ok) throw new Error("listSimulations failed");
  return res.json();
}

export async function getSimulation(sim_id: string) {
  const res = await fetch(`${BASE}/api/simulation/${sim_id}`);
  if (!res.ok) throw new Error("getSimulation failed");
  return res.json();
}
