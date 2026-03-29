'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown } from 'lucide-react'
import Navbar from '@/components/Navbar'
import MarketCard, { MarketCardSkeleton } from '@/components/MarketCard'
import { useMarkets } from '@/hooks/useMarkets'
import { AppMarket } from '@/lib/api'
import { cn, fmtProb, fmtUSDC, fmtPP } from '@/lib/utils'

const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'politics', label: 'Politics' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'economics', label: 'Economics' },
  { id: 'sports', label: 'Sports' },
  { id: 'science', label: 'Science' },
  { id: 'geo', label: 'Geopolitics' },
]

/** Group markets by event slug. Multi-outcome events → one group. */
function groupMarkets(markets: AppMarket[]): AppMarket[][] {
  const seen = new Map<string, AppMarket[]>()
  for (const m of markets) {
    const key = m.slug || m.id
    if (!seen.has(key)) seen.set(key, [])
    seen.get(key)!.push(m)
  }
  return Array.from(seen.values())
}

/** Card for multi-outcome events (FIFA World Cup, Oscars, etc.) */
function EventGroupCard({ markets }: { markets: AppMarket[] }) {
  const eventTitle = markets[0].eventTitle ?? markets[0].slug.replace(/-/g, ' ')
  const sorted = [...markets].sort((a, b) => b.currentProb - a.currentProb)
  const top = sorted.slice(0, 5)
  const totalVol = markets.reduce((s, m) => s + m.volume24h, 0)
  const lead = sorted[0]

  return (
    <Link href={`/market/${lead.id}?ps=${encodeURIComponent(lead.slug)}`}>
      <div className={cn(
        'group flex flex-col gap-3 p-4 rounded-lg cursor-pointer animate-fade-in',
        'bg-card hover:bg-card-hover border border-border hover:border-zinc-600 transition-colors duration-150'
      )}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors leading-snug line-clamp-2 capitalize">
            {eventTitle}
          </p>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-500 shrink-0 font-medium uppercase tracking-wide">
            {markets.length} outcomes
          </span>
        </div>

        {/* Outcome rows */}
        <div className="space-y-1.5">
          {top.map(m => {
            const label = m.outcomeLabel ?? m.title.replace(/^Will\s+/i, '').split(' ')[0]
            const isUp = m.change24h >= 0
            return (
              <div key={m.id} className="flex items-center gap-2">
                <div className="w-24 shrink-0">
                  <span className="text-xs text-zinc-400 truncate block">{label}</span>
                </div>
                <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/70 rounded-full"
                    style={{ width: `${Math.round(m.currentProb * 100)}%` }}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-mono tabular-nums text-zinc-200 w-8 text-right">
                    {fmtProb(m.currentProb)}
                  </span>
                  <span className={cn(
                    'text-[10px] tabular-nums w-10 text-right',
                    isUp ? 'text-emerald-500' : 'text-red-400'
                  )}>
                    {isUp ? '+' : ''}{fmtPP(m.change24h, false)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted pt-0.5 border-t border-zinc-800/60">
          <span>{fmtUSDC(totalVol)} vol</span>
          <span>{lead.daysToResolution}d left</span>
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  const { markets, loading, error } = useMarkets({
    limit: 20,
    tag: category || undefined,
    q: query || undefined,
  })

  const groups = groupMarkets(markets)

  return (
    <div className="min-h-screen bg-bg">
      <Navbar onSearch={setQuery} />

      {/* Hero */}
      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-10 space-y-3">
          <p className="text-xs text-muted font-medium uppercase tracking-widest">
            Options on Prediction Markets
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
            The derivatives layer for prediction markets.
          </h1>
          <p className="text-muted-fg text-sm max-w-xl leading-relaxed">
            Pythia turns every Polymarket probability into a tradeable volatility surface.
            Structured payoffs, real Greeks, and defined risk — across politics, sports, crypto, and economics.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Category filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors shrink-0',
                category === cat.id
                  ? 'bg-accent text-white font-medium'
                  : 'bg-surface border border-border text-muted hover:text-zinc-200 hover:border-zinc-600'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-red-muted border border-red/20 p-3.5 text-sm text-red">
            Failed to load markets — {error}
          </div>
        )}

        {/* Markets grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <MarketCardSkeleton key={i} />)
            : groups.map(group =>
                group.length > 1
                  ? <EventGroupCard key={group[0].slug} markets={group} />
                  : <MarketCard key={group[0].id} market={group[0]} />
              )
          }
        </div>

        {!loading && !error && groups.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted text-sm">No markets found.</p>
            {query && (
              <button onClick={() => setQuery('')} className="text-xs text-accent hover:underline mt-2">
                Clear search
              </button>
            )}
          </div>
        )}

        {/* How it works */}
        <div className="pt-8 border-t border-border">
          <h2 className="text-sm font-medium text-muted uppercase tracking-widest mb-4">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { step: '01', title: 'Pick a market', desc: 'Any active Polymarket contract becomes your underlying. The YES% is a live probability price.' },
              { step: '02', title: 'Choose a strike', desc: 'Pick a probability level — 30%, 50%, 70%. Your option pays off if the market moves through your strike.' },
              { step: '03', title: 'Review the chain', desc: 'See the full options chain across expiries. IV, Greeks, breakeven all computed in real time.' },
              { step: '04', title: 'Trade with structure', desc: 'Defined max loss, live P&L curve. Know your risk before you enter.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-card border border-border rounded-lg p-4 space-y-1.5">
                <div className="text-xs text-muted tabular-nums">{step}</div>
                <div className="text-sm font-medium text-zinc-200">{title}</div>
                <div className="text-xs text-muted leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-border mt-12 py-6 text-center text-xs text-muted">
        Pythia · Options on prediction market probabilities
      </footer>
    </div>
  )
}
