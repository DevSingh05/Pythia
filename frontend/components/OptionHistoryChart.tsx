'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import type { AppMarket, OptionQuote, OptionsChainResponse, PricePoint } from '@/lib/api'
import {
  buildOptionPremiumHistory,
  tauYearsFromOption,
  alignPremiumSeriesToChainSpot,
  type OptionPremiumPoint,
} from '@/lib/optionPremiumHistory'
import {
  computeIndicator,
  optionIndicatorRegistry,
  type IndicatorId,
} from '@/lib/optionChartIndicators'
import {
  type ChartIntervalId,
  filterByChartInterval,
  intervalsAvailableForSpan,
  defaultChartInterval,
  CHART_INTERVAL_LABEL,
} from '@/lib/chartTimeRanges'
import { downsampleProbTimeBiased } from '@/lib/chartSampling'

type ChartRow = OptionPremiumPoint & {
  sma?: number | null
  ema?: number | null
  rsi?: number | null
}

interface OptionHistoryChartProps {
  probHistory: PricePoint[]
  option: OptionQuote
  chain: OptionsChainResponse
  market: AppMarket
  className?: string
}

export default function OptionHistoryChart({
  probHistory,
  option,
  chain,
  market,
  className,
}: OptionHistoryChartProps) {
  const [interval, setInterval] = useState<ChartIntervalId>('all')
  const [enabled, setEnabled] = useState<Record<IndicatorId, boolean>>({
    sma: false,
    ema: false,
    rsi: false,
  })
  const [periods, setPeriods] = useState<Record<IndicatorId, number>>(() =>
    Object.fromEntries(optionIndicatorRegistry.map(s => [s.id, s.defaultPeriod])) as Record<
      IndicatorId,
      number
    >,
  )

  const sigma = option.impliedVol > 0 ? option.impliedVol : chain.impliedVol
  const tauYears = tauYearsFromOption(option)

  const dataExtent = useMemo(() => {
    if (probHistory.length === 0) return null
    let minT = Infinity
    let maxT = -Infinity
    for (const p of probHistory) {
      minT = Math.min(minT, p.t)
      maxT = Math.max(maxT, p.t)
    }
    return { minT, maxT }
  }, [probHistory])

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

  const chartData = useMemo(() => {
    const targetPoints =
      interval === 'all' ? 560 : interval === '30d' ? 480 : interval === '7d' ? 360 : 320
    const filtered = filterByChartInterval(probHistory, interval)
    const sampled = downsampleProbTimeBiased(filtered, targetPoints)
    const raw = buildOptionPremiumHistory(sampled, {
      strike: option.strike,
      type: option.type,
      sigma,
      tauYears,
    })
    const premSeries = alignPremiumSeriesToChainSpot(raw, option, chain.currentProb)
    if (premSeries.length === 0) return []

    const premiums = premSeries.map(p => p.premium)
    const smaVals = enabled.sma ? computeIndicator('sma', premiums, periods.sma) : null
    const emaVals = enabled.ema ? computeIndicator('ema', premiums, periods.ema) : null
    const rsiVals = enabled.rsi ? computeIndicator('rsi', premiums, periods.rsi) : null

    return premSeries.map((row, i) => {
      const out: ChartRow = { ...row }
      if (smaVals && smaVals[i] != null) out.sma = smaVals[i]!
      if (emaVals && emaVals[i] != null) out.ema = emaVals[i]!
      if (rsiVals && rsiVals[i] != null) out.rsi = rsiVals[i]!
      return out
    })
  }, [
    probHistory,
    interval,
    option.strike,
    option.type,
    option.premium,
    option.daysToExpiry,
    sigma,
    tauYears,
    chain.currentProb,
    enabled.sma,
    enabled.ema,
    enabled.rsi,
    periods.sma,
    periods.ema,
    periods.rsi,
  ])

  const premYDomain = useMemo((): [number, number] | null => {
    if (chartData.length === 0) return null
    let minV = Infinity
    let maxV = -Infinity
    for (const d of chartData) {
      if (d.premium != null && Number.isFinite(d.premium)) {
        minV = Math.min(minV, d.premium)
        maxV = Math.max(maxV, d.premium)
      }
      if (enabled.sma && d.sma != null && Number.isFinite(d.sma)) {
        minV = Math.min(minV, d.sma)
        maxV = Math.max(maxV, d.sma)
      }
      if (enabled.ema && d.ema != null && Number.isFinite(d.ema)) {
        minV = Math.min(minV, d.ema)
        maxV = Math.max(maxV, d.ema)
      }
    }
    if (!Number.isFinite(minV)) return null
    const range = maxV - minV
    const pad = Math.max(range * 0.14, maxV * 0.04, range < maxV * 0.08 ? maxV * 0.06 : 0.002)
    return [Math.max(0, minV - pad), maxV + pad]
  }, [chartData, enabled.sma, enabled.ema])

  const tickFormatter = (v: number) => {
    const d = new Date(v)
    if (interval === '1d') {
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const outcomeLabel = market.outcomeLabel ?? market.title.slice(0, 28)
  const showRsi = enabled.rsi && chartData.some(d => d.rsi != null)

  if (probHistory.length === 0) {
    return (
      <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 p-4', className)}>
        <p className="text-sm text-zinc-500">No underlying history — cannot build an option series.</p>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 p-4', className)}>
        <p className="text-sm text-zinc-500">Not enough data in this time range.</p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold text-zinc-200">This contract (model)</span>
          <span className="text-[10px] text-violet-400/90 font-medium px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/25">
            {outcomeLabel}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          {option.type.toUpperCase()} @ {fmtProb(option.strike)} · {option.expiry} — repriced from{' '}
          <span className="text-zinc-400">{outcomeLabel}</span> YES% with the same tenor as the chain (
          {option.daysToExpiry}d → τ = {(tauYears * 365).toFixed(1)}d, σ ≈ {(sigma * 100).toFixed(1)}%). Right edge
          matches the quoted premium. Not exchange tape.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {optionIndicatorRegistry.map(spec => (
          <label
            key={spec.id}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] cursor-pointer',
              enabled[spec.id]
                ? 'border-violet-500/40 bg-violet-500/10 text-violet-200'
                : 'border-zinc-700 text-zinc-500 hover:border-zinc-600',
            )}
          >
            <input
              type="checkbox"
              className="rounded border-zinc-600"
              checked={enabled[spec.id]}
              onChange={e => setEnabled(s => ({ ...s, [spec.id]: e.target.checked }))}
            />
            {spec.label}
            <input
              type="number"
              min={2}
              max={99}
              value={periods[spec.id]}
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                if (!Number.isFinite(n)) return
                setPeriods(s => ({ ...s, [spec.id]: Math.min(99, Math.max(2, n)) }))
              }}
              className="w-8 bg-zinc-900 border border-zinc-700 rounded px-0.5 py-0 text-[10px] font-mono text-zinc-300"
              onClick={e => e.stopPropagation()}
            />
          </label>
        ))}
      </div>

      <div className="flex gap-0.5 justify-end flex-wrap">
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

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: showRsi ? 8 : 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#1e1e22" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={tickFormatter}
              tick={{ fill: '#52525b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={50}
            />
            <YAxis
              yAxisId="prem"
              domain={premYDomain ?? ['auto', 'auto']}
              tickFormatter={v => fmtPremium(v)}
              tick={{ fill: '#52525b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            {showRsi && (
              <YAxis
                yAxisId="rsi"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={v => `${v}`}
                tick={{ fill: '#a78bfa', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
            )}
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as ChartRow
                const dt = new Date(row.t)
                return (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                    <div className="text-zinc-500 mb-1">
                      {dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div className="font-mono text-zinc-200">Prem {fmtPremium(row.premium)}</div>
                    <div className="text-zinc-500 text-[10px]">YES {fmtProb(row.prob, 1)}</div>
                    {row.sma != null && <div className="text-amber-400/90">SMA {fmtPremium(row.sma)}</div>}
                    {row.ema != null && <div className="text-sky-400/90">EMA {fmtPremium(row.ema)}</div>}
                    {row.rsi != null && <div className="text-violet-300">RSI {row.rsi.toFixed(1)}</div>}
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />

            <Line
              yAxisId="prem"
              type="linear"
              dataKey="premium"
              name="Premium"
              stroke="#e4e4e7"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {enabled.sma && (
              <Line
                yAxisId="prem"
                type="linear"
                dataKey="sma"
                name={`SMA(${periods.sma})`}
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
            {enabled.ema && (
              <Line
                yAxisId="prem"
                type="linear"
                dataKey="ema"
                name={`EMA(${periods.ema})`}
                stroke="#38bdf8"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
            {enabled.rsi && (
              <Line
                yAxisId="rsi"
                type="linear"
                dataKey="rsi"
                name={`RSI(${periods.rsi})`}
                stroke="#a78bfa"
                strokeWidth={1.2}
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
