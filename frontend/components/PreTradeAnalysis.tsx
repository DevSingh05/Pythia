'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import type { OptionQuote, AppMarket, OptionsChainResponse, PricePoint } from '@/lib/api'
import { fetchPriceHistoryFast } from '@/lib/api'
import ProbChart, { type ProbChartOutcomeInfo } from '@/components/ProbChart'
import OptionHistoryChart from '@/components/OptionHistoryChart'
import PayoffChart, { fmtCents, computePayoffMetrics } from '@/components/PayoffChart'
import BacktestChart from '@/components/BacktestChart'
import CodeSandbox, { type CodeSandboxData } from '@/components/CodeSandbox'
import {
  buildOptionPremiumHistory,
  tauYearsFromOption,
  alignPremiumSeriesToChainSpot,
} from '@/lib/optionPremiumHistory'

export type PreTradeTab = 'payoff' | 'backtest' | 'price' | 'code'

type PriceFocus = 'contract' | 'underlying'

const TABS: { id: PreTradeTab; label: string }[] = [
  { id: 'payoff', label: 'Payoff' },
  { id: 'backtest', label: 'Backtest' },
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

/** LOT multiplier — same as TradePanel */
const LOT = 1000

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
  const [tab, setTab] = useState<PreTradeTab>('payoff')
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

  const metrics = useMemo(
    () => computePayoffMetrics(option, side, quantity),
    [option, side, quantity],
  )

  const isCall = option.type === 'call'

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
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Pre-trade analysis</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {market.outcomeLabel && (
                <span className="text-violet-400/90 font-medium">{market.outcomeLabel}</span>
              )}
              {market.outcomeLabel && ' · '}
              <span className={side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
                {side.toUpperCase()}
              </span>
              {' '}{quantity}× {option.type.toUpperCase()} @ {fmtProb(option.strike)} · {option.expiry}
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

        {/* Tabs */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 min-h-0">
          {/* ─── PAYOFF TAB ─── */}
          {tab === 'payoff' && (
            <div className="space-y-4">
              {/* Trade direction banner */}
              <div className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
                side === 'buy'
                  ? 'bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-300'
                  : 'bg-red-500/[0.08] border border-red-500/25 text-red-300',
              )}>
                {side === 'buy' ? (
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                )}
                {side === 'buy' ? 'Buying' : 'Selling'} {quantity}× {option.type.toUpperCase()} @ {fmtProb(option.strike)}
                <span className="ml-auto font-mono">
                  {side === 'buy' ? 'Cost' : 'Credit'}: ${(option.premium * quantity * LOT).toFixed(2)}
                </span>
              </div>

              {/* Payoff chart */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
                <PayoffChart
                  option={option}
                  side={side}
                  quantity={quantity}
                  currentProb={market.currentProb}
                  lotSize={LOT}
                />
              </div>

              {/* Greeks grid */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
                  <Activity className="w-3 h-3" />
                  Greeks & Sensitivities
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Delta (Δ)', value: option.delta, fmt: (v: number) => v.toFixed(4), desc: isCall ? 'Price sensitivity to YES%' : 'Price sensitivity to YES%' },
                    { label: 'Gamma (Γ)', value: option.gamma, fmt: (v: number) => v.toFixed(4), desc: 'Delta acceleration' },
                    { label: 'Theta (Θ)', value: option.theta, fmt: (v: number) => v.toFixed(4), desc: 'Daily time decay' },
                    { label: 'Vega (ν)', value: option.vega, fmt: (v: number) => v.toFixed(4), desc: 'Volatility sensitivity' },
                  ].map(g => (
                    <div key={g.label} className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-zinc-500 font-medium">{g.label}</span>
                        <span className={cn(
                          'text-sm font-mono font-bold tabular-nums',
                          g.value > 0 ? 'text-emerald-400' : g.value < 0 ? 'text-red-400' : 'text-zinc-400',
                        )}>
                          {g.fmt(g.value)}
                        </span>
                      </div>
                      <div className="text-[9px] text-zinc-600 mt-0.5">{g.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key levels */}
              <div className="space-y-2">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
                  Key Levels
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2.5">
                    <span className="text-zinc-500">IV</span>
                    <span className="float-right font-mono font-semibold text-zinc-200">
                      {(option.impliedVol * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2.5">
                    <span className="text-zinc-500">HV</span>
                    <span className="float-right font-mono font-semibold text-zinc-200">
                      {(chain.historicalVol * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2.5">
                    <span className="text-zinc-500">IV / HV</span>
                    <span className={cn(
                      'float-right font-mono font-semibold',
                      option.impliedVol > chain.historicalVol ? 'text-amber-400' : 'text-emerald-400',
                    )}>
                      {chain.historicalVol > 0 ? (option.impliedVol / chain.historicalVol).toFixed(2) + '×' : '—'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-zinc-800/40 border border-zinc-700/40 p-2.5">
                    <span className="text-zinc-500">Market</span>
                    <span className="float-right font-mono font-semibold text-zinc-200">
                      {(market.currentProb * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Trade thesis hint */}
              <TradeThesis option={option} side={side} market={market} chain={chain} />
            </div>
          )}

          {/* ─── BACKTEST TAB ─── */}
          {tab === 'backtest' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-violet-500/[0.06] border border-violet-500/20 p-3">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Simulate entering this trade at a past date and see how P&L would have evolved
                  using real historical probability data. Drag the slider to pick your entry date.
                </p>
              </div>
              <BacktestChart
                history={history}
                strike={option.strike}
                type={option.type}
                side={side}
                sigma={option.impliedVol > 0 ? option.impliedVol : chain.impliedVol}
                daysToExpiry={option.daysToExpiry}
                lotSize={LOT}
              />
            </div>
          )}

          {/* ─── PRICE HISTORY TAB ─── */}
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

          {/* ─── CUSTOM CODE TAB ─── */}
          {tab === 'code' && <CodeSandbox data={sandboxData} />}
        </div>

        {/* Footer CTA */}
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

/** Quick thesis based on IV/HV ratio and moneyness */
function TradeThesis({
  option, side, market, chain,
}: {
  option: OptionQuote; side: 'buy' | 'sell'; market: AppMarket; chain: OptionsChainResponse
}) {
  const ivHv = chain.historicalVol > 0 ? option.impliedVol / chain.historicalVol : 1
  const isCall = option.type === 'call'
  const isITM = isCall ? market.currentProb > option.strike : market.currentProb < option.strike
  const moneyness = isITM ? 'ITM' : 'OTM'

  const bullets: string[] = []

  if (side === 'buy') {
    if (isCall) {
      bullets.push(`Bullish: you profit if YES% rises above breakeven before ${option.expiry} expiry.`)
    } else {
      bullets.push(`Bearish: you profit if YES% drops below breakeven before ${option.expiry} expiry.`)
    }
    bullets.push(`This strike is currently ${moneyness} (market at ${(market.currentProb * 100).toFixed(1)}% vs strike ${(option.strike * 100).toFixed(0)}%).`)
    if (ivHv > 1.3) {
      bullets.push(`IV is ${ivHv.toFixed(1)}× HV — options are expensive. Consider if a move is priced in.`)
    } else if (ivHv < 0.8) {
      bullets.push(`IV is ${ivHv.toFixed(1)}× HV — options are cheap relative to realized moves.`)
    }
  } else {
    if (isCall) {
      bullets.push(`Selling exposure: you collect premium but face loss if YES% rises sharply.`)
    } else {
      bullets.push(`Selling exposure: you collect premium but face loss if YES% drops sharply.`)
    }
    if (ivHv > 1.3) {
      bullets.push(`IV > HV (${ivHv.toFixed(1)}×) — selling rich premium could be favorable.`)
    }
  }

  return (
    <div className="rounded-lg bg-violet-500/[0.06] border border-violet-500/20 p-3 space-y-1.5">
      <div className="text-[10px] text-violet-400 uppercase tracking-widest font-medium">Trade thesis</div>
      {bullets.map((b, i) => (
        <p key={i} className="text-[11px] text-zinc-400 leading-relaxed">
          {b}
        </p>
      ))}
    </div>
  )
}
