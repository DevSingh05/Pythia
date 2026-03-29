'use client'

/**
 * ScenarioAnalysis
 * ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
 * Interactive "what-if" panel: per-market probability sliders that reprice all
 * open positions in real-time, showing portfolio value at each scenario.
 *
 * Extraction: drop this file + its import in page.tsx; requires:
 *   - @/lib/api       ΓåÆ Position
 *   - @/lib/paperTrade ΓåÆ PaperOrder, MarketSnapshot, INITIAL_BALANCE
 *   - @/lib/pricing   ΓåÆ vanillaCall, vanillaPut
 *   - @/lib/utils     ΓåÆ cn, fmtProb, fmtPremium
 */

import { useState, useMemo } from 'react'
import { Position } from '@/lib/api'
import { PaperOrder, MarketSnapshot, INITIAL_BALANCE } from '@/lib/paperTrade'
import { vanillaCall, vanillaPut } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import { SlidersHorizontal, TrendingUp, TrendingDown, RotateCcw } from 'lucide-react'

// ΓöÇΓöÇΓöÇ Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

interface ScenarioAnalysisProps {
  positions: Position[]
  orders: PaperOrder[]
  balance: number
  marketPrices: Map<string, MarketSnapshot>
}

interface MarketSlider {
  marketId: string
  marketTitle: string
  currentProb: number
  impliedVol: number
  scenarioProb: number  // user-controlled
}

// ΓöÇΓöÇΓöÇ Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * Reprice all positions using the provided scenario prob per market.
 * Returns total portfolio value (cash balance + scenario MTM of positions).
 */
function computeScenarioValue(
  positions: Position[],
  orders: PaperOrder[],
  balance: number,
  scenarioProbs: Map<string, number>,
  defaultImpliedVol: Map<string, number>,
): number {
  let positionMtm = 0

  for (const pos of positions) {
    const scenarioP = scenarioProbs.get(pos.marketId)
    if (scenarioP === undefined) {
      // No slider for this market ΓÇö use current value with correct sign
      const sign = pos.side === 'long' ? 1 : -1
      positionMtm += sign * pos.currentValue * pos.quantity
      continue
    }

    // Find the reference order for tau + iv
    const ref = orders.find(
      o => o.marketId === pos.marketId && o.strike === pos.strike && o.type === pos.type
    )
    const sigma = defaultImpliedVol.get(pos.marketId) ?? ref?.impliedVol ?? 1.5
    const daysSinceFill = ref ? (Date.now() - ref.timestamp) / 86_400_000 : 0
    const remainingDays = Math.max(0.1, (ref?.daysToExpiry ?? 7) - daysSinceFill)
    const tau = remainingDays / 365

    const scenarioPremium = pos.type === 'call'
      ? vanillaCall(scenarioP, pos.strike, sigma, tau)
      : vanillaPut(scenarioP, pos.strike, sigma, tau)

    // Long positions add value; short positions subtract (buyback liability)
    const sign = pos.side === 'long' ? 1 : -1
    positionMtm += sign * scenarioPremium * pos.quantity
  }

  return balance + positionMtm
}

// ΓöÇΓöÇΓöÇ Sub-components ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function ProbSlider({
  slider,
  onChange,
}: {
  slider: MarketSlider
  onChange: (id: string, prob: number) => void
}) {
  const delta = slider.scenarioProb - slider.currentProb
  const isUp = delta > 0.001
  const isDown = delta < -0.001

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        {/* Market title */}
        <span className="text-zinc-300 truncate max-w-[200px]" title={slider.marketTitle}>
          {slider.marketTitle}
        </span>

        {/* Scenario prob + delta badge */}
        <div className="flex items-center gap-2 shrink-0">
          {(isUp || isDown) && (
            <span className={cn(
              'text-[10px] font-mono px-1.5 py-0.5 rounded',
              isUp ? 'text-green bg-green-muted' : 'text-red bg-red-muted'
            )}>
              {isUp ? '+' : ''}{(delta * 100).toFixed(1)}pp
            </span>
          )}
          <span className="font-mono font-semibold tabular-nums w-12 text-right">
            {(slider.scenarioProb * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Range input with color-coded track */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={slider.scenarioProb * 100}
          onChange={e => onChange(slider.marketId, parseFloat(e.target.value) / 100)}
          className="w-full h-1.5 appearance-none rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-400"
          style={{
            background: `linear-gradient(to right,
              ${isUp ? '#16a34a' : isDown ? '#dc2626' : '#3b82f6'} ${slider.scenarioProb * 100}%,
              #27272a ${slider.scenarioProb * 100}%)`
          }}
        />
        {/* Current prob marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-zinc-500/60 rounded pointer-events-none"
          style={{ left: `${slider.currentProb * 100}%` }}
          title={`Current: ${(slider.currentProb * 100).toFixed(1)}%`}
        />
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-[9px] text-muted/50">
        <span>0%</span>
        <span className="text-muted/70">
          Current: {(slider.currentProb * 100).toFixed(1)}%
        </span>
        <span>100%</span>
      </div>
    </div>
  )
}

// ΓöÇΓöÇΓöÇ Main Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export default function ScenarioAnalysis({
  positions,
  orders,
  balance,
  marketPrices,
}: ScenarioAnalysisProps) {
  // Build initial sliders from unique markets that have open positions
  const initialSliders = useMemo<MarketSlider[]>(() => {
    const seen = new Set<string>()
    const sliders: MarketSlider[] = []

    for (const pos of positions) {
      if (seen.has(pos.marketId)) continue
      seen.add(pos.marketId)

      const snap = marketPrices.get(pos.marketId)
      const ref = orders.find(o => o.marketId === pos.marketId)
      const currentProb = snap?.currentProb ?? ref?.currentProbAtFill ?? 0.5
      const impliedVol = snap?.impliedVol ?? ref?.impliedVol ?? 1.5

      sliders.push({
        marketId: pos.marketId,
        marketTitle: pos.marketTitle,
        currentProb,
        impliedVol,
        scenarioProb: currentProb,
      })
    }

    return sliders
  }, [positions, orders, marketPrices])

  const [sliders, setSliders] = useState<MarketSlider[]>(initialSliders)

  // Sync sliders when positions/markets change (e.g. on price refresh)
  // Only add new markets; preserve existing slider positions
  const mergedSliders = useMemo(() => {
    return initialSliders.map(init => {
      const existing = sliders.find(s => s.marketId === init.marketId)
      return existing
        ? { ...init, scenarioProb: existing.scenarioProb }
        : init
    })
  }, [initialSliders, sliders])

  // Build lookup maps for scenario computation
  const scenarioProbs = useMemo(
    () => new Map(mergedSliders.map(s => [s.marketId, s.scenarioProb])),
    [mergedSliders]
  )
  const defaultImpliedVol = useMemo(
    () => new Map(mergedSliders.map(s => [s.marketId, s.impliedVol])),
    [mergedSliders]
  )

  // Current portfolio value (for comparison)
  const currentValue = useMemo(() => {
    const positionMtm = positions.reduce((s, p) => {
      const sign = p.side === 'long' ? 1 : -1
      return s + sign * p.currentValue * p.quantity
    }, 0)
    return balance + positionMtm
  }, [positions, balance])

  // Scenario portfolio value
  const scenarioValue = useMemo(
    () => computeScenarioValue(positions, orders, balance, scenarioProbs, defaultImpliedVol),
    [positions, orders, balance, scenarioProbs, defaultImpliedVol]
  )

  const scenarioPnl = scenarioValue - INITIAL_BALANCE
  const scenarioDelta = scenarioValue - currentValue
  const isScenarioUp = scenarioPnl >= 0
  const isDeltaUp = scenarioDelta >= 0
  const isModified = mergedSliders.some(s => Math.abs(s.scenarioProb - s.currentProb) > 0.001)

  const handleSliderChange = (marketId: string, prob: number) => {
    setSliders(prev => {
      const exists = prev.find(s => s.marketId === marketId)
      if (exists) {
        return prev.map(s => s.marketId === marketId ? { ...s, scenarioProb: prob } : s)
      }
      // Add new slider from merged
      const base = mergedSliders.find(s => s.marketId === marketId)
      return base ? [...prev, { ...base, scenarioProb: prob }] : prev
    })
  }

  const handleReset = () => {
    setSliders(initialSliders.map(s => ({ ...s, scenarioProb: s.currentProb })))
  }

  if (positions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <SlidersHorizontal className="w-5 h-5 text-muted/40 mx-auto mb-2" />
        <p className="text-xs text-muted">Open positions to use scenario analysis</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs text-muted uppercase tracking-wider font-medium">
            Scenario Analysis
          </span>
        </div>
        {isModified && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-[10px] text-muted hover:text-zinc-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      <div className="p-4 space-y-5">
        {/* Scenario result summary */}
        <div className="grid grid-cols-3 gap-3">
          {/* Scenario Portfolio Value */}
          <div className="bg-surface rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-muted uppercase tracking-wider">Scenario Value</div>
            <div className={cn(
              'text-base font-semibold font-mono tabular-nums mt-0.5',
              isScenarioUp ? 'text-green' : 'text-red'
            )}>
              ${scenarioValue.toFixed(2)}
            </div>
          </div>

          {/* Scenario P&L */}
          <div className="bg-surface rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-muted uppercase tracking-wider">Scenario P&l</div>
            <div className={cn(
              'text-base font-semibold font-mono tabular-nums mt-0.5 flex items-center gap-1',
              isScenarioUp ? 'text-green' : 'text-red'
            )}>
              {isScenarioUp
                ? <TrendingUp className="w-3.5 h-3.5" />
                : <TrendingDown className="w-3.5 h-3.5" />
              }
              {isScenarioUp ? '+' : ''}${scenarioPnl.toFixed(2)}
            </div>
          </div>

          {/* Delta vs current */}
          <div className="bg-surface rounded-lg px-3 py-2.5">
            <div className="text-[10px] text-muted uppercase tracking-wider">vs Current</div>
            <div className={cn(
              'text-base font-semibold font-mono tabular-nums mt-0.5',
              !isModified ? 'text-muted' : isDeltaUp ? 'text-green' : 'text-red'
            )}>
              {!isModified ? '--' : `${isDeltaUp ? '+' : ''}$${scenarioDelta.toFixed(2)}`}
            </div>
          </div>
        </div>

        {/* Per-market sliders */}
        <div className="space-y-5">
          {mergedSliders.map(slider => (
            <ProbSlider
              key={slider.marketId}
              slider={slider}
              onChange={handleSliderChange}
            />
          ))}
        </div>

        <p className="text-[10px] text-muted/50 text-center">
          Drag sliders to simulate market resolution probabilities. Vertical line = current price.
        </p>
      </div>
    </div>
  )
}
