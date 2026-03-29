import { NextRequest, NextResponse } from 'next/server'

const MDS = process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3001'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(req.url)
  const interval = url.searchParams.get('interval') || '7d'
  
  // parse interval to days
  let days = 30
  if (interval === '1d') days = 1
  if (interval === '7d') days = 7
  if (interval === '30d') days = 30

  try {
    const upstream = await fetch(`${MDS}/markets/${id}/history?days=${days}`, { next: { revalidate: 60 } })
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: upstream.status })
    }
    const data = await upstream.json()
    
    // Map to expected PricePoint[]
    const mapped = (data.history || []).map((row: any) => ({
      t: new Date(row.ts).getTime(),
      p: row.prob
    })).sort((a: any, b: any) => a.t - b.t)
    
    return NextResponse.json(mapped)
  } catch (err) {
    console.error('History proxy error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
