import { NextRequest, NextResponse } from "next/server";

const MDS = process.env.MARKET_DATA_SERVICE_URL!;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const days = req.nextUrl.searchParams.get("days") ?? "30";
  const res = await fetch(`${MDS}/markets/${params.id}/history?days=${days}`, {
    next: { revalidate: 60 },
  });
  return NextResponse.json(await res.json());
}
