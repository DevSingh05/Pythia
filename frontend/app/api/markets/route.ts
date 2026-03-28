import { NextRequest, NextResponse } from "next/server";

const MDS = process.env.MARKET_DATA_SERVICE_URL!;

export async function GET(req: NextRequest) {
  const q     = req.nextUrl.searchParams.get("q") ?? "";
  const limit = req.nextUrl.searchParams.get("limit") ?? "20";
  const res   = await fetch(`${MDS}/markets?q=${encodeURIComponent(q)}&limit=${limit}`, {
    next: { revalidate: 30 },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
