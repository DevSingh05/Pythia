'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts'
import { fetchPriceHistoryFast, PricePoint } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  type ChartIntervalId,
  filterByChartInterval,
  intervalsAvailableForSpan,
  defaultChartInterval,
  CHART_INTERVAL_LABEL,
} from '@/lib/chartTimeRanges'
import { downsampleProbTimeBiased } from '@/lib/chartSampling'

/** Colors for multi-outcome chart lines */
const LINE_COLORS = [
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
]

export interface ProbChartOutcomeInfo {
  label: string
  tokenId: string
  prob: number
  marketId: string
}

interface ProbChartProps {
  tokenId?: string
  currentProb?: number
  outcomes?: ProbChartOutcomeInfo[]
  activeMarketId?: string
  /** If set, only this outcome’s line is fetched and drawn (e.g. Spain’s YES in a FIFA event). */
  isolateTokenId?: string
  className?: string
}

interface MergedPoint {
  t: number
  [key: string]: number
}

function CustomTooltip({ active, payload, outcomes }: any) {
  if (!active || !payload?.length) return null
  const t = payload[0]?.payload?.t
  if (!t) return null
  const dt = new Date(t)
  const timeStr = dt.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl min-w-[120px]">
      <div className="text-zinc-500 mb-1.5">{timeStr}</div>
      {payload
        .filter((p: any) => p.value != null)
        .sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0))
        .map((p: any, i: number) => {
          const idx = parseInt(p.dataKey?.replace('outcome_', '') ?? '0')
          const label = outcomes?.[idx]?.label ?? 'YES'
          return (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.stroke }} />
                <span className="text-zinc-400">{label}</span>
              </div>
              <span className="text-zinc-100 font-mono font-medium">
                {(p.value * 100).toFixed(1)}%
              </span>
            </div>
          )
        })}
    </div>
  )
}

export default function ProbChart({
  tokenId,
  currentProb,
  outcomes,
  activeMarketId,
  isolateTokenId,
  className,
}: ProbChartProps) {
  const [interval, setInterval] = useState<ChartIntervalId>('all')
  const [histories, setHistories] = useState<Map<number, PricePoint[]>>(new Map())
  const [loading, setLoading] = useState(true)

  const effectiveOutcomes = useMemo(() => {
    let base: ProbChartOutcomeInfo[]
    if (outcomes && outcomes.length > 0) base = outcomes
    else if (tokenId) base = [{ label: 'YES', tokenId, prob: currentProb ?? 0.5, marketId: '' }]
    else return []
    if (isolateTokenId) {
      const one = base.filter(o => o.tokenId === isolateTokenId)
      if (one.length > 0) return one
      return [
        {
          label: 'This outcome',
          tokenId: isolateTokenId,
          prob: currentProb ?? 0.5,
          marketId: activeMarketId ?? '',
        },
      ]
    }
    return base
  }, [outcomes, tokenId, currentProb, isolateTokenId, activeMarketId])

  // Top 4 outcomes by probability
  const displayOutcomes = useMemo(() => {
    return effectiveOutcomes
      .slice()
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 4)
  }, [effectiveOutcomes])

  const displayTokenKey = useMemo(
    () => displayOutcomes.map(o => o.tokenId).join(','),
    [displayOutcomes]
  )

  // Fetch all histories once (full lifetime, hourly fidelity)
  useEffect(() => {
    if (displayOutcomes.length === 0) { setLoading(false); return }
    setLoading(true)

    Promise.all(
      displayOutcomes.map(o =>
        fetchPriceHistoryFast(o.tokenId).catch(() => [] as PricePoint[])
      )
    ).then(results => {
      const map = new Map<number, PricePoint[]>()
      results.forEach((pts, i) => map.set(i, pts))
      setHistories(map)
      setLoading(false)
    })
  }, [displayTokenKey])

  const dataExtent = useMemo(() => {
    let minT = Infinity
    let maxT = -Infinity
    for (const pts of histories.values()) {
      for (const p of pts) {
        minT = Math.min(minT, p.t)
        maxT = Math.max(maxT, p.t)
      }
    }
    if (!Number.isFinite(minT)) return null
    return { minT, maxT }
  }, [histories])

  const availableIntervals = useMemo(() => {
    if (!dataExtent) return [] as ChartIntervalId[]
    return intervalsAvailableForSpan(dataExtent.minT, dataExtent.maxT)
  }, [dataExtent])

  useEffect(() => {
    if (!dataExtent) return
    const span = dataExtent.maxT - dataExtent.minT
    const avail = intervalsAvailableForSpan(dataExtent.minT, dataExtent.maxT)
    setInterval(iv => (avail.includes(iv) ? iv : defaultChartInterval(span)))
  }, [dataExtent?.minT, dataExtent?.maxT])

  // Merge all outcome histories into unified time-series
  const { mergedData, yMin, yMax } = useMemo(() => {
    const timeSet = new Set<number>()
    const filteredHistories: PricePoint[][] = []

    const targetPoints = interval === 'all' ? 520 : interval === '30d' ? 440 : 300

    displayOutcomes.forEach((_, i) => {
      const raw = histories.get(i) ?? []
      const filtered = filterByChartInterval(raw, interval)
      const sampled = downsampleProbTimeBiased(filtered, targetPoints)
      filteredHistories.push(sampled)
      sampled.forEach(pt => timeSet.add(pt.t))
    })

    if (timeSet.size === 0) {
      return { mergedData: [] as MergedPoint[], yMin: 0, yMax: 1 }
    }

    const times = [...timeSet].sort((a, b) => a - b)

    const merged: MergedPoint[] = times.map(t => {
      const point: MergedPoint = { t }
      displayOutcomes.forEach((_, i) => {
        const hist = filteredHistories[i]
        if (!hist.length) return
        // Find closest point — tolerance scales with data density
        const avgGap = hist.length > 1
          ? (hist[hist.length - 1].t - hist[0].t) / hist.length
          : 7200_000
        const tolerance = Math.max(avgGap * 2, 3600_000)
        let best: PricePoint | null = null
        let bestDist = Infinity
        for (const pt of hist) {
          const dist = Math.abs(pt.t - t)
          if (dist < bestDist) { bestDist = dist; best = pt }
          if (pt.t > t + tolerance) break // early exit since sorted
        }
        if (best && bestDist < tolerance) {
          point[`outcome_${i}`] = best.p
        }
      })
      return point
    })

    // Filter out points where no outcome has data
    const validMerged = merged.filter(pt =>
      displayOutcomes.some((_, i) => pt[`outcome_${i}`] != null)
    )

    let minP = 1, maxP = 0
    validMerged.forEach(pt => {
      displayOutcomes.forEach((_, i) => {
        const v = pt[`outcome_${i}`]
        if (v != null) {
          minP = Math.min(minP, v)
          maxP = Math.max(maxP, v)
        }
      })
    })

    const range = maxP - minP
    const pad = Math.max(range * 0.14, 0.025, range < 0.04 ? 0.018 : 0)
    return {
      mergedData: validMerged,
      yMin: Math.max(0, minP - pad),
      yMax: Math.min(1, maxP + pad),
    }
  }, [histories, displayOutcomes, interval])

  const tickFormatter = (v: number) => {
    const d = new Date(v)
    if (interval === '1d') {
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const isMulti = displayOutcomes.length > 1

  if (loading) {
    return <div className={cn('h-72 bg-zinc-900/50 rounded-xl border border-zinc-800 animate-pulse', className)} />
  }

  if (mergedData.length === 0) {
    return (
      <div className={cn('h-72 flex items-center justify-center rounded-xl border border-zinc-800', className)}>
        <span className="text-zinc-600 text-sm">No price history available</span>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header: legend + interval picker */}
      <div className="flex items-start justify-between gap-4">
        {isMulti ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {displayOutcomes.map((o, i) => {
              const isActive = o.marketId === activeMarketId
              return (
                <div key={i} className={cn('flex items-center gap-1.5 text-xs', isActive && 'font-medium')}>
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
                  />
                  <span className={isActive ? 'text-zinc-100' : 'text-zinc-400'}>{o.label}</span>
                  <span className={cn('font-mono tabular-nums', isActive ? 'text-zinc-200' : 'text-zinc-500')}>
                    {(o.prob * 100).toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">YES probability</span>
        )}

        <div className="flex gap-0.5 shrink-0 flex-wrap justify-end">
          {availableIntervals.map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setInterval(id)}
              className={cn(
                'px-2 py-1 text-xs rounded font-medium transition-colors',
                interval === id ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {CHART_INTERVAL_LABEL[id]}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergedData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid stroke="#1e1e22" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={tickFormatter}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={60}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickCount={5}
            />
            <Tooltip
              content={<CustomTooltip outcomes={displayOutcomes} />}
              cursor={{ stroke: '#3f3f46', strokeDasharray: '3 3' }}
            />

            {yMin < 0.5 && yMax > 0.5 && (
              <ReferenceLine y={0.5} stroke="#27272a" strokeDasharray="3 3" />
            )}

            {displayOutcomes.map((o, i) => {
              const isActive = o.marketId === activeMarketId
              return (
                <Line
                  key={i}
                  type="linear"
                  dataKey={`outcome_${i}`}
                  isAnimationActive={false}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  strokeOpacity={isActive || !activeMarketId ? 1 : 0.6}
                  dot={false}
                  activeDot={{
                    r: isActive ? 4 : 3,
                    fill: LINE_COLORS[i % LINE_COLORS.length],
                    strokeWidth: 0,
                  }}
                  connectNulls
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}