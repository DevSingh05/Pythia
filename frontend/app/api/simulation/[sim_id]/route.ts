import { NextRequest, NextResponse } from "next/server";

const MDS = process.env.MARKET_DATA_SERVICE_URL!;

export async function GET(
  _req: NextRequest,
  { params }: { params: { sim_id: string } }
) {
  const res = await fetch(`${MDS}/simulation/${params.sim_id}`, {
    next: { revalidate: 3600 },  // static data, long cache
  });
  if (!res.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(await res.json());
}
