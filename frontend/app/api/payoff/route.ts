import { NextRequest, NextResponse } from "next/server";

const PRICING = process.env.PRICING_SERVICE_URL!;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res  = await fetch(`${PRICING}/payoff`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    return NextResponse.json({ error: "pricing unavailable" }, { status: 502 });
  }
  return NextResponse.json(await res.json());
}
