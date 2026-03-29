'use client'

import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { cn, fmtProb } from '@/lib/utils'
import type { OptionQuote, AppMarket, OptionsChainResponse, PricePoint } from '@/lib/api'
import { fetchPriceHistoryFast } from '@/lib/api'
import ProbChart, { type ProbChartOutcomeInfo } from '@/components/ProbChart'
import OptionHistoryChart from '@/components/OptionHistoryChart'
import CodeSandbox, { type CodeSandboxData } from '@/components/CodeSandbox'
import {
  buildOptionPremiumHistory,
  tauYearsFromOption,
  alignPremiumSeriesToChainSpot,
} from '@/lib/optionPremiumHistory'

export type PreTradeTab = 'price' | 'code'

type PriceFocus = 'contract' | 'underlying'

const TABS: { id: PreTradeTab; label: string }[] = [
  { id: 'price', label: 'Price history' },
  { id: 'code', label: 'Custom code' },
]

export interface PreTradeAnalysisProps {
  option: OptionQuote
  side: 'buy' | 'sell'
  quantity: number
  market: AppMarket
  chain: OptionsChainResponse
  outcomes?: ProbChartOutcomeInfo[]
  onClose: () => void
  /** Paper demo: run simulated order book from the analysis drawer. */
  onAddToPaperDemo?: () => void
}

export default function PreTradeAnalysis({
  option,
  side,
  quantity,
  market,
  chain,
  outcomes,
  onClose,
  onAddToPaperDemo,
}: PreTradeAnalysisProps) {
  const [tab, setTab] = useState<PreTradeTab>('price')
  const [priceFocus, setPriceFocus] = useState<PriceFocus>('contract')
  const [history, setHistory] = useState<PricePoint[]>([])

  useEffect(() => {
    const id = market.clobTokenId
    if (!id) {
      setHistory([])
      return
    }
    let cancelled = false
    fetchPriceHistoryFast(id).then(pts => {
      if (!cancelled) setHistory(pts)
    })
    return () => {
      cancelled = true
    }
  }, [market.clobTokenId])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const optionPremiumHistory = useMemo(() => {
    if (history.length === 0) return []
    const sigma = option.impliedVol > 0 ? option.impliedVol : chain.impliedVol
    const sorted = [...history].sort((a, b) => a.t - b.t)
    const maxPts = 500
    const step = Math.max(1, Math.ceil(sorted.length / maxPts))
    const thin: PricePoint[] = []
    for (let i = 0; i < sorted.length; i++) {
      if (i % step === 0 || i === sorted.length - 1) thin.push(sorted[i])
    }
    const raw = buildOptionPremiumHistory(thin, {
      strike: option.strike,
      type: option.type,
      sigma,
      tauYears: tauYearsFromOption(option),
    })
    return alignPremiumSeriesToChainSpot(raw, option, chain.currentProb)
  }, [
    history,
    option.strike,
    option.type,
    option.impliedVol,
    option.daysToExpiry,
    option.premium,
    chain.impliedVol,
    chain.currentProb,
  ])

  const sandboxData: CodeSandboxData = useMemo(
    () => ({
      history: history.map(h => ({ t: h.t, p: h.p })),
      optionPremiumHistory: optionPremiumHistory.map(o => ({
        t: o.t,
        premium: o.premium,
        prob: o.prob,
      })),
      currentProb: market.currentProb,
      impliedVol: chain.impliedVol,
      historicalVol: chain.historicalVol,
      option: {
        strike: option.strike,
        premium: option.premium,
        type: option.type,
        expiry: option.expiry,
        delta: option.delta,
        gamma: option.gamma,
        theta: option.theta,
        vega: option.vega,
      },
      side,
      quantity,
    }),
    [
      history,
      optionPremiumHistory,
      market.currentProb,
      chain.impliedVol,
      chain.historicalVol,
      option,
      side,
      quantity,
    ],
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-label="Close analysis"
        onClick={onClose}
      />

      <div
        className={cn(
          'relative z-[101] flex flex-col w-full max-h-[92vh] lg:max-h-none lg:h-full',
          'bg-[#09090b] border-t lg:border-t-0 lg:border-l border-zinc-800 shadow-2xl',
          'rounded-t-2xl lg:rounded-none lg:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Pre-trade analysis</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {market.outcomeLabel && (
                <span className="text-violet-400/90 font-medium">{market.outcomeLabel}</span>
              )}
              {market.outcomeLabel && ' / '}
              {side.toUpperCase()} {quantity}x {option.type} @ {fmtProb(option.strike)} / {option.expiry}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-2 py-2 border-b border-zinc-800 overflow-x-auto shrink-0 scrollbar-thin">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors',
                tab === t.id
                  ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 min-h-0">
          {tab === 'price' && (
            <div className="space-y-3">
              <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setPriceFocus('contract')}
                  className={cn(
                    'flex-1 px-3 py-2 transition-colors',
                    priceFocus === 'contract'
                      ? 'bg-violet-600/30 text-violet-100'
                      : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/40',
                  )}
                >
                  This option
                </button>
                <button
                  type="button"
                  onClick={() => setPriceFocus('underlying')}
                  className={cn(
                    'flex-1 px-3 py-2 border-l border-zinc-700 transition-colors',
                    priceFocus === 'underlying'
                      ? 'bg-violet-600/30 text-violet-100'
                      : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/40',
                  )}
                >
                  Underlying YES%
                </button>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
                {priceFocus === 'contract' ? (
                  <OptionHistoryChart
                    probHistory={history}
                    option={option}
                    chain={chain}
                    market={market}
                  />
                ) : (
                  <ProbChart
                    tokenId={market.clobTokenId}
                    currentProb={market.currentProb}
                    outcomes={outcomes}
                    activeMarketId={market.id}
                    isolateTokenId={market.clobTokenId}
                  />
                )}
              </div>
            </div>
          )}

          {tab === 'code' && <CodeSandbox data={sandboxData} />}
        </div>

        {onAddToPaperDemo && (
          <div className="shrink-0 border-t border-zinc-800 p-3 bg-zinc-900/80">
            <button
              type="button"
              onClick={onAddToPaperDemo}
              className={cn(
                'w-full py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors',
                'border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 hover:border-amber-500/55',
              )}
            >
              Add to paper order book
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
