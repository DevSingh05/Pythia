'use client'

import { useState, useMemo } from 'react'
import { Position } from '@/lib/api'
import { PaperOrder, MarketSnapshot, INITIAL_BALANCE } from '@/lib/paperTrade'
import { americanOptionBinomial, AMERICAN_TREE_STEPS } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import { RotateCcw } from 'lucide-react'

interface ScenarioAnalysisProps {
  positions: Position[]; orders: PaperOrder[]; balance: number; marketPrices: Map<string, MarketSnapshot>
}

interface MarketSlider {
  marketId: string; marketTitle: string; currentProb: number; impliedVol: number; scenarioProb: number
}

function computeScenarioValue(
  positions: Position[], orders: PaperOrder[], balance: number,
  scenarioProbs: Map<string, number>, defaultIV: Map<string, number>,
): number {
  let mtm = 0
  for (const pos of positions) {
    const sP = scenarioProbs.get(pos.marketId)
    if (sP === undefined) { mtm += (pos.side === 'long' ? 1 : -1) * pos.currentValue * pos.quantity; continue }
    const ref = orders.find(o => o.marketId === pos.marketId && o.strike === pos.strike && o.type === pos.type)
    const sigma = defaultIV.get(pos.marketId) ?? ref?.impliedVol ?? 1.5
    const days = ref ? (Date.now() - ref.timestamp) / 86_400_000 : 0
    const tau = Math.max(0.1, (ref?.daysToExpiry ?? 7) - days) / 365
    const prem = americanOptionBinomial(sP, pos.strike, sigma, tau, AMERICAN_TREE_STEPS, pos.type)
    mtm += (pos.side === 'long' ? 1 : -1) * prem * pos.quantity
  }
  return balance + mtm
}

export default function ScenarioAnalysis({ positions, orders, balance, marketPrices }: ScenarioAnalysisProps) {
  const initialSliders = useMemo<MarketSlider[]>(() => {
    const seen = new Set<string>(); const s: MarketSlider[] = []
    for (const pos of positions) {
      if (seen.has(pos.marketId)) continue; seen.add(pos.marketId)
      const snap = marketPrices.get(pos.marketId)
      const ref = orders.find(o => o.marketId === pos.marketId)
      s.push({ marketId: pos.marketId, marketTitle: pos.marketTitle,
        currentProb: snap?.currentProb ?? ref?.currentProbAtFill ?? 0.5,
        impliedVol: snap?.impliedVol ?? ref?.impliedVol ?? 1.5,
        scenarioProb: snap?.currentProb ?? ref?.currentProbAtFill ?? 0.5 })
    }
    return s
  }, [positions, orders, marketPrices])

  const [sliders, setSliders] = useState<MarketSlider[]>(initialSliders)
  const merged = useMemo(() => initialSliders.map(init => {
    const ex = sliders.find(s => s.marketId === init.marketId)
    return ex ? { ...init, scenarioProb: ex.scenarioProb } : init
  }), [initialSliders, sliders])

  const sProbs = useMemo(() => new Map(merged.map(s => [s.marketId, s.scenarioProb])), [merged])
  const ivMap = useMemo(() => new Map(merged.map(s => [s.marketId, s.impliedVol])), [merged])

  const curVal = useMemo(() => balance + positions.reduce((s, p) => s + (p.side === 'long' ? 1 : -1) * p.currentValue * p.quantity, 0), [positions, balance])
  const scenVal = useMemo(() => computeScenarioValue(positions, orders, balance, sProbs, ivMap), [positions, orders, balance, sProbs, ivMap])

  const scenPnl = scenVal - INITIAL_BALANCE, scenDelta = scenVal - curVal
  const isUp = scenPnl >= 0, isDUp = scenDelta >= 0
  const modified = merged.some(s => Math.abs(s.scenarioProb - s.currentProb) > 0.001)

  if (positions.length === 0) return null

  return (
    <div className="bg-[#0c0c14] border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-3 bg-violet-500" />
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-bold">Scenario</span>
        </div>
        {modified && (
          <button onClick={() => setSliders(initialSliders.map(s => ({ ...s, scenarioProb: s.currentProb })))}
            className="text-[9px] text-zinc-600 hover:text-zinc-400 font-mono flex items-center gap-1 transition-colors">
            <RotateCcw className="w-2.5 h-2.5" />RESET
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-px bg-zinc-800">
          <div className="bg-[#0c0c14] px-3 py-2">
            <div className="text-[9px] text-zinc-600 font-mono font-bold tracking-wider">VALUE</div>
            <div className={cn('text-sm font-mono font-bold tabular-nums', isUp ? 'text-emerald-400' : 'text-red-400')}>
              ${scenVal.toFixed(2)}
            </div>
          </div>
          <div className="bg-[#0c0c14] px-3 py-2">
            <div className="text-[9px] text-zinc-600 font-mono font-bold tracking-wider">P&L</div>
            <div className={cn('text-sm font-mono font-bold tabular-nums', isUp ? 'text-emerald-400' : 'text-red-400')}>
              {isUp ? '+' : ''}${scenPnl.toFixed(2)}
            </div>
          </div>
          <div className="bg-[#0c0c14] px-3 py-2">
            <div className="text-[9px] text-zinc-600 font-mono font-bold tracking-wider">VS CURRENT</div>
            <div className={cn('text-sm font-mono font-bold tabular-nums', !modified ? 'text-zinc-700' : isDUp ? 'text-emerald-400' : 'text-red-400')}>
              {!modified ? '--' : `${isDUp ? '+' : ''}$${scenDelta.toFixed(2)}`}
            </div>
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-2">
          {merged.map(slider => {
            const delta = slider.scenarioProb - slider.currentProb
            const isSlUp = delta > 0.001, isSlDn = delta < -0.001
            const title = slider.marketTitle.length > 36 ? slider.marketTitle.slice(0, 34) + '...' : slider.marketTitle
            return (
              <div key={slider.marketId} className="border border-zinc-800/60 bg-zinc-900/30 p-2 space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-zinc-400 font-mono truncate max-w-[220px]" title={slider.marketTitle}>{title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {(isSlUp || isSlDn) && (
                      <span className={cn('text-[9px] font-mono px-1 py-px', isSlUp ? 'text-emerald-400 bg-emerald-950/50' : 'text-red-400 bg-red-950/50')}>
                        {isSlUp ? '+' : ''}{(delta * 100).toFixed(1)}pp
                      </span>
                    )}
                    <span className="font-mono font-bold tabular-nums text-zinc-200 w-14 text-right">
                      {(slider.scenarioProb * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="relative h-[14px]">
                  {/* Track background */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[6px] bg-zinc-800" />
                  {/* Filled portion */}
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 h-[6px]"
                    style={{
                      width: `${slider.scenarioProb * 100}%`,
                      backgroundColor: isSlUp ? '#059669' : isSlDn ? '#dc2626' : '#3b82f6',
                    }} />
                  {/* Transparent input on top */}
                  <input type="range" min={0} max={100} step={0.5} value={slider.scenarioProb * 100}
                    onChange={e => setSliders(prev => {
                      const ex = prev.find(s => s.marketId === slider.marketId)
                      const prob = parseFloat(e.target.value) / 100
                      if (ex) return prev.map(s => s.marketId === slider.marketId ? { ...s, scenarioProb: prob } : s)
                      return [...prev, { ...slider, scenarioProb: prob }]
                    })}
                    className="absolute inset-0 w-full appearance-none cursor-pointer bg-transparent slider-grip"
                  />
                </div>
                <div className="flex justify-between text-[8px] text-zinc-700 font-mono">
                  <span>0%</span><span>Current: {(slider.currentProb * 100).toFixed(1)}%</span><span>100%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
