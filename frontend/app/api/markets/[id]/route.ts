import { NextRequest, NextResponse } from "next/server";

const MDS = process.env.MARKET_DATA_SERVICE_URL!;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = await fetch(`${MDS}/markets/${params.id}`, {
    next: { revalidate: 5 },
  });
  if (!res.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await res.json());
}
