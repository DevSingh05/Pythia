import { NextResponse } from "next/server";

const MDS = process.env.MARKET_DATA_SERVICE_URL!;

export async function GET() {
  const res = await fetch(`${MDS}/simulation`, { next: { revalidate: 300 } });
  return NextResponse.json(await res.json());
}
