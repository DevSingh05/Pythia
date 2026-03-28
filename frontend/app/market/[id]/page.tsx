'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import ProbabilityGauge from '@/components/ProbabilityGauge'
import ProbChart from '@/components/ProbChart'
import OptionsChain, { OptionsChainSkeleton } from '@/components/OptionsChain'
import TradePanel from '@/components/TradePanel'
import GreeksPanel from '@/components/GreeksPanel'
import { useMarket, usePriceHistory } from '@/hooks/useMarkets'
import { useOptionsChain } from '@/hooks/useOptionsChain'
import { cn, fmtUSDC, fmtProb } from '@/lib/utils'
import { OptionQuote } from '@/lib/api'
import { ArrowLeft, ToggleLeft, ToggleRight, Clock, BarChart2, AlertCircle, ExternalLink } from 'lucide-react'
import Link from 'next/link'

type ViewMode = 'simple' | 'pro'
type TradeSide = 'buy' | 'sell'

export default function MarketPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [mode, setMode] = useState<ViewMode>('simple')
  const [selectedOption, setSelectedOption] = useState<OptionQuote | null>(null)
  const [tradeSide, setTradeSide] = useState<TradeSide>('buy')
  const [historyInterval, setHistoryInterval] = useState<'1h' | '6h' | '1d' | '7d' | '30d'>('7d')

  const { market, loading: mktLoading, error: mktError } = useMarket(id)
  const { history, loading: histLoading } = usePriceHistory(id, historyInterval)
  const {
    data: chain,
    loading: chainLoading,
    error: chainError,
  } = useOptionsChain(
    id,
    market?.currentProb ?? 0.5,
    (market as any)?.volatility ?? 1.5,
  )

  if (mktError) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red mx-auto" />
          <p className="text-red">{mktError}</p>
          <Link href="/" className="text-accent text-sm hover:underline">← Back to markets</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-muted hover:text-slate-200 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Markets
          </button>
          <span className="text-border">/</span>
          {market && (
            <span className="text-sm text-muted-fg truncate max-w-xs">{market.title}</span>
          )}
        </div>

        {/* Market header */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: market info */}
          <div className="flex-1 space-y-4">
            {mktLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 w-32 bg-border rounded" />
                <div className="h-7 w-full bg-border rounded" />
                <div className="h-5 w-3/4 bg-border rounded" />
              </div>
            ) : market && (
              <>
                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {market.tags.map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-card border border-border text-muted-fg">
                      {tag}
                    </span>
                  ))}
                </div>

                <h1 className="text-xl font-semibold leading-snug">{market.title}</h1>

                {/* Key stats */}
                <div className="flex flex-wrap gap-4 text-xs text-muted">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Resolves {market.resolutionDate} · {market.daysToResolution}d left</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Vol 24h: {fmtUSDC(market.volume24h)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>Liquidity: {fmtUSDC(market.liquidity)}</span>
                  </div>
                  <a
                    href={`https://polymarket.com/event/${market.conditionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-accent hover:underline"
                  >
                    Polymarket <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Prob chart */}
                <ProbChart
                  history={history}
                  currentProb={market.currentProb}
                  loading={histLoading}
                />
              </>
            )}
          </div>

          {/* Right: gauge + mode toggle */}
          <div className="lg:w-72 space-y-4">
            {mktLoading ? (
              <div className="h-64 bg-card rounded-xl border border-border animate-pulse" />
            ) : market && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <ProbabilityGauge
                  probability={market.currentProb}
                  change24h={market.change24h}
                  size="lg"
                  animated
                />

                {/* Mode toggle */}
                <div className="flex items-center justify-center gap-3 pt-2">
                  <span className={cn('text-xs', mode === 'simple' ? 'text-accent' : 'text-muted')}>Simple</span>
                  <button
                    onClick={() => setMode(m => m === 'simple' ? 'pro' : 'simple')}
                    className="text-muted hover:text-accent transition-colors"
                  >
                    {mode === 'simple'
                      ? <ToggleLeft className="w-8 h-8" />
                      : <ToggleRight className="w-8 h-8 text-accent" />
                    }
                  </button>
                  <span className={cn('text-xs', mode === 'pro' ? 'text-accent' : 'text-muted')}>Pro</span>
                </div>

                {mode === 'pro' && (
                  <div className="text-xs text-center text-muted bg-surface rounded-lg py-1.5">
                    Full options chain · Live Greeks · Vol surface
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main content: Options chain + Trade panel */}
        <div className={cn(
          'grid gap-6',
          mode === 'simple' ? 'grid-cols-1 lg:grid-cols-[1fr_360px]' : 'grid-cols-1 lg:grid-cols-[1fr_360px]'
        )}>
          {/* Options chain */}
          <div className="space-y-4">
            {chainError && (
              <div className="bg-red/10 border border-red/20 rounded-xl p-4 text-sm text-red flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  Could not load options chain: {chainError}
                  <div className="text-xs text-muted mt-1">
                    Set NEXT_PUBLIC_API_URL to connect the Pythia pricing backend.
                    Client-side computation requires market data to be available.
                  </div>
                </div>
              </div>
            )}

            {chainLoading || !chain ? (
              <OptionsChainSkeleton />
            ) : (
              <OptionsChain
                chain={chain}
                onSelectOption={opt => setSelectedOption(opt)}
                selectedOption={selectedOption}
                showGreeks={mode === 'pro'}
              />
            )}

            {/* Pro mode extras */}
            {mode === 'pro' && chain && (
              <div className="grid grid-cols-2 gap-4">
                {/* IV vs HV */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Volatility</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted">Implied Vol</span>
                      <span className="font-mono text-accent">{(chain.impliedVol * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-accent/60 rounded-full" style={{ width: `${Math.min(100, chain.impliedVol * 50)}%` }} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Historical Vol</span>
                      <span className="font-mono text-muted-fg">{(chain.historicalVol * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-muted/40 rounded-full" style={{ width: `${Math.min(100, chain.historicalVol * 50)}%` }} />
                    </div>
                    <div className="text-muted/70 pt-1 leading-relaxed">
                      {chain.impliedVol > chain.historicalVol
                        ? 'IV > HV: market pricing in elevated uncertainty. Options relatively expensive.'
                        : 'IV < HV: options may be underpriced relative to realized vol.'
                      }
                    </div>
                  </div>
                </div>

                {/* Model info */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Model Info</h3>
                  <div className="space-y-1.5 text-xs font-mono text-muted">
                    <div>Model: <span className="text-accent">Logit-Normal</span></div>
                    <div>Style: <span className="text-slate-200">European</span></div>
                    <div>Settlement: <span className="text-slate-200">Cash (YES%)</span></div>
                    <div>σ(logit): <span className="text-accent">{chain.impliedVol.toFixed(3)}</span></div>
                    <div className="text-muted/60 leading-relaxed pt-1">
                      dL = σ dW<br />
                      L = ln(p/1-p)<br />
                      C = Φ(d), d = (L₀-logit(K))/(σ√τ)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right panel: Trade + Greeks */}
          <div className="space-y-4">
            {market && (
              <TradePanel
                market={market}
                option={selectedOption}
                side={tradeSide}
                onSideChange={setTradeSide}
              />
            )}

            {mode === 'pro' && selectedOption && (
              <GreeksPanel
                option={selectedOption}
                currentProb={market?.currentProb ?? 0.5}
              />
            )}
          </div>
        </div>

        {/* TradFi translation table (educational) */}
        {mode === 'simple' && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="text-xs text-accent font-mono">HOW IT MAPS TO TRADFI</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-muted pb-2 font-medium pr-6">Concept</th>
                    <th className="text-left text-muted pb-2 font-medium pr-6">Traditional Options</th>
                    <th className="text-left text-muted pb-2 font-medium text-accent">Pythia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {[
                    ['Underlying', '$AAPL stock price', `YES probability (${market ? fmtProb(market.currentProb) : '??'})`],
                    ['Strike', '$180 price target', '50% probability target'],
                    ['Premium', '$ paid for contract', '$ paid for prob option'],
                    ['Expiry', 'Options expiry date', 'Date before market resolves'],
                    ['In The Money', 'Price above strike', 'Probability above strike'],
                    ['Theta', 'Time decay of premium', 'Decay as event nears & gets binary'],
                    ['Vega', 'Sensitivity to vol', 'Sensitivity to news / sentiment vol'],
                  ].map(([concept, tradfi, pythia]) => (
                    <tr key={concept}>
                      <td className="py-2 pr-6 text-muted-fg">{concept}</td>
                      <td className="py-2 pr-6 text-muted font-mono">{tradfi}</td>
                      <td className="py-2 text-accent font-mono">{pythia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
