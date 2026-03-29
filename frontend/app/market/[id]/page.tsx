'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import ProbChart from '@/components/ProbChart'
import OptionsChain, { OptionsChainSkeleton } from '@/components/OptionsChain'
import TradePanel from '@/components/TradePanel'
import GreeksPanel from '@/components/GreeksPanel'
import { useMarket } from '@/hooks/useMarkets'
import { useOptionsChain } from '@/hooks/useOptionsChain'
import { cn, fmtUSDC, fmtProb } from '@/lib/utils'
import { OptionQuote } from '@/lib/api'
import { useDemoMode } from '@/hooks/useDemoMode'
import {
  ArrowLeft, Clock, BarChart2, AlertCircle, ExternalLink,
  TrendingUp, TrendingDown, ChevronRight
} from 'lucide-react'
import Link from 'next/link'

function useSiblingMarkets(eventSlug: string | undefined) {
  const [siblings, setSiblings] = useState<any[]>([])
  useEffect(() => {
    if (!eventSlug) return
    fetch(`/api/events?slug=${encodeURIComponent(eventSlug)}`)
      .then(r => r.json())
      .then(data => setSiblings(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [eventSlug])
  return siblings
}

function shortLabel(question: string, groupItemTitle?: string): string {
  if (groupItemTitle) return groupItemTitle
  const colonIdx = question.lastIndexOf(': ')
  if (colonIdx !== -1) return question.slice(colonIdx + 2).slice(0, 18)
  const willMatch = question.match(/^Will (.+?) (?:win|be|get|receive)/i)
  if (willMatch) return willMatch[1].slice(0, 18)
  return question.length > 18 ? question.slice(0, 18) + '...' : question
}

/** Parse clobTokenIds from a sibling market object */
function parseClobTokenId(sib: any): string {
  try {
    const raw = typeof sib.clobTokenIds === 'string'
      ? JSON.parse(sib.clobTokenIds)
      : sib.clobTokenIds
    return raw?.[0] ?? ''
  } catch { return '' }
}

function parsePrice(outcomePrices: any): number {
  try {
    const arr = typeof outcomePrices === 'string' ? JSON.parse(outcomePrices) : outcomePrices
    return parseFloat(arr?.[0] ?? '0.5') || 0.5
  } catch { return 0.5 }
}

export default function MarketPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params.id as string

  const [selectedOption, setSelectedOption] = useState<OptionQuote | null>(null)
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy')
  const [selectedExpiry, setSelectedExpiry] = useState('1W')

  const demo = useDemoMode()


  const { market, loading: mktLoading, error: mktError } = useMarket(id)
  const polySlug = searchParams.get('ps') ?? market?.slug ?? id
  const siblings = useSiblingMarkets(polySlug)

  const {
    data: chain,
    loading: chainLoading,
    error: chainError,
  } = useOptionsChain(
    id,
    market?.currentProb ?? 0.5,
    (market as any)?.volatility ?? 1.5,
    market?.clobTokenId,
    selectedExpiry,
  )

  // Build outcome info for multi-line chart
  const chartOutcomes = useMemo(() => {
    if (siblings.length <= 1) return undefined
    return siblings
      .filter((s: any) => !s.closed)
      .sort((a: any, b: any) => parsePrice(b.outcomePrices) - parsePrice(a.outcomePrices))
      .slice(0, 6)
      .map((sib: any) => ({
        label: shortLabel(sib.question ?? '', sib.groupItemTitle),
        tokenId: parseClobTokenId(sib),
        prob: parsePrice(sib.outcomePrices),
        marketId: sib.id ?? sib.conditionId ?? sib.condition_id,
      }))
      .filter(o => o.tokenId) // only include outcomes with valid token IDs
  }, [siblings])

  const changePositive = (market?.change24h ?? 0) >= 0

  // Find event-level metadata
  const eventTitle = siblings.length > 1
    ? (siblings[0] as any)?.events?.[0]?.title
      ?? market?.eventTitle
      ?? polySlug.replace(/-\d+$/, '').replace(/-/g, ' ')
    : null
  const totalVolume = siblings.length > 1
    ? siblings.reduce((s: number, m: any) => s + (parseFloat(m.volume24hr ?? m.volume ?? '0') || 0), 0)
    : 0

  if (mktError) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-red-400">{mktError}</p>
          <Link href="/" className="text-blue-400 text-sm hover:underline">Back to markets</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Markets
          </button>
          {market && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-700" />
              <span className="text-zinc-400 truncate max-w-xs text-xs">{market.title}</span>
            </>
          )}
        </div>

        {/* Market header */}
        {mktLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-3 w-24 bg-zinc-800 rounded" />
            <div className="h-6 w-3/4 bg-zinc-800 rounded" />
            <div className="h-3 w-1/2 bg-zinc-800 rounded" />
          </div>
        ) : market && (
          <div className="space-y-3">
            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {market.tags.slice(0, 4).map(tag => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-zinc-400">
                  {tag}
                </span>
              ))}
            </div>

            {/* Title + prob badge */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {eventTitle && (
                  <p className="text-xs text-zinc-500 mb-1 capitalize">{eventTitle}</p>
                )}
                <h1 className="text-lg font-semibold text-zinc-100 leading-snug max-w-3xl">
                  {market.outcomeLabel ?? market.title}
                </h1>
              </div>
              <div className="flex items-baseline gap-2 shrink-0">
                <span className="text-3xl font-bold font-mono text-zinc-100 tabular-nums">
                  {fmtProb(market.currentProb, 1)}
                </span>
                <div className={cn(
                  'flex items-center gap-0.5 text-sm font-mono',
                  changePositive ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {changePositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {changePositive ? '+' : ''}{(market.change24h * 100).toFixed(1)}pp
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Resolves {market.resolutionDate} · {market.daysToResolution}d left
              </span>
              <span className="flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5" />
                Vol 24h: {fmtUSDC(totalVolume || market.volume24h)}
              </span>
              <span>Liquidity: {fmtUSDC(market.liquidity)}</span>
              <a
                href={`https://polymarket.com/event/${polySlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-400/70 hover:text-blue-400 transition-colors"
              >
                Polymarket <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Sibling market tabs */}
        {siblings.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium mr-1 shrink-0">Outcomes:</span>
            {[...siblings]
              .sort((a: any, b: any) => parsePrice(b.outcomePrices) - parsePrice(a.outcomePrices))
              .slice(0, 12)
              .map((sib: any) => {
              const sibId = sib.id ?? sib.conditionId ?? sib.condition_id
              const isActive = sibId === id
              const label = shortLabel(sib.question ?? '', sib.groupItemTitle)
              const sibProb = parsePrice(sib.outcomePrices)
              return (
                <Link
                  key={sibId}
                  href={`/market/${sibId}?ps=${encodeURIComponent(polySlug)}`}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border shrink-0',
                    isActive
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                      : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                  )}
                >
                  <span>{label}</span>
                  <span className={cn(
                    'font-mono tabular-nums text-[10px]',
                    isActive ? 'text-blue-400' : 'text-zinc-500'
                  )}>
                    {(sibProb * 100).toFixed(0)}%
                  </span>
                </Link>
              )
            })}
          </div>
        )}

        {/* Probability chart — full width above the two-column layout */}
        {mktLoading ? (
          <div className="h-72 bg-zinc-900/50 rounded-xl border border-zinc-800 animate-pulse" />
        ) : market && (
          <div className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-4">
            <ProbChart
              tokenId={market.clobTokenId}
              currentProb={market.currentProb}
              outcomes={chartOutcomes}
              activeMarketId={id}
            />
          </div>
        )}

        {/* Main two-column layout: chain + trade panel */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

          {/* Left column: options chain */}
          <div className="space-y-5">
            {chainError && (
              <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-4 text-sm text-red-400 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>Could not load options chain: {chainError}</div>
              </div>
            )}

            {chainLoading || !chain ? (
              <OptionsChainSkeleton />
            ) : (
              <OptionsChain
                chain={chain}
                onSelectOption={opt => {
                  setSelectedOption(opt)
                  setTradeSide('buy')
                  demo.startDemo(opt)
                }}
                onExpiryChange={setSelectedExpiry}
                selectedOption={selectedOption}
                showGreeks={true}
                isDemoMode={demo.isActive}
                demoHighlightStrike={demo.step.option?.strike}
                demoPhase={demo.step.phase}
              />
            )}
          </div>

          {/* Right column: trade panel + Greeks */}
          <div className="lg:sticky lg:top-16 lg:self-start space-y-4">
            {market && (
              <TradePanel
                market={market}
                option={selectedOption}
                side={tradeSide}
                onSideChange={setTradeSide}
                demoMode={demo}
              />
            )}
            {selectedOption && market && (
              <GreeksPanel
                option={selectedOption}
                currentProb={market.currentProb}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
