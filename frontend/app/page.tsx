'use client'

import { useState, useEffect, lazy, Suspense } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import MarketCard, { MarketCardSkeleton } from '@/components/MarketCard'
import { useMarkets } from '@/hooks/useMarkets'
import { AppMarket } from '@/lib/api'
import { cn, fmtProb, fmtUSDC, fmtPP } from '@/lib/utils'

const ProbSphere = lazy(() =>
  import('@/components/ui/prob-sphere').then(m => ({ default: m.ProbSphere }))
)
const OracleBackground = lazy(() =>
  import('@/components/ui/oracle-background').then(m => ({ default: m.OracleBackground }))
)

// tag ids match Polymarket tag labels (case-insensitive substring match in proxy)
const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'Politics', label: 'Politics' },
  { id: 'Crypto', label: 'Crypto' },
  { id: 'Economics', label: 'Economics' },
  { id: 'Sports', label: 'Sports' },
  { id: 'Science', label: 'Science' },
  { id: 'Geopolitics', label: 'Geopolitics' },
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
    <Link href={`/market/${lead.id}?ps=${encodeURIComponent(lead.slug)}`} className="h-full">
      <div className={cn(
        'group flex flex-col gap-3 p-4 rounded-lg cursor-pointer animate-fade-in h-full',
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
        <div className="flex items-center justify-between text-xs text-muted pt-0.5 border-t border-zinc-800/60 mt-auto">
          <span>{fmtUSDC(totalVol)} vol</span>
          <span>{lead.daysToResolution}d left</span>
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState('')

  // Debounce search — wait 350ms after user stops typing before fetching
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 350)
    return () => clearTimeout(timer)
  }, [query])

  const { markets, loading, error } = useMarkets({
    tag: category || undefined,
    q: debouncedQuery || undefined,
  })

  const groups = groupMarkets(markets).slice(0, 20)

  function clearSearch() {
    setQuery('')
    setDebouncedQuery('')
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar searchQuery={query} onSearch={setQuery} />

      {/* Hero — full viewport, sphere centered and prominent */}
      <div className="relative overflow-hidden border-b border-border" style={{ height: 'calc(100vh - 52px)' }}>

        {/* Greek letter field — oracle chamber inscriptions */}
        <Suspense fallback={null}>
          <OracleBackground />
        </Suspense>

        {/* Sphere — fills and centers itself via absolute inset */}
        <Suspense fallback={null}>
          <ProbSphere />
        </Suspense>

        {/* Dark corners vignette — keeps orb glow in focus */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ background: 'radial-gradient(ellipse 55% 55% at 50% 46%, transparent 40%, rgba(9,9,11,0.8) 75%, #09090b 100%)' }}
        />

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-10 bg-gradient-to-t from-[#09090b] to-transparent" />

        {/* Oracle title — centered over sphere */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 animate-fade-in-up">
          {/* Eyebrow */}
          <p
            className="text-[10px] tracking-[0.45em] uppercase"
            style={{ color: '#c084fc', opacity: 0.8, fontFamily: 'Inter, sans-serif' }}
          >
            The Oracle of Prediction Markets
          </p>

          {/* Main wordmark */}
          <h1
            className="text-7xl md:text-9xl font-black text-white"
            style={{
              fontFamily: 'Orbitron, system-ui, sans-serif',
              letterSpacing: '0.08em',
              textShadow: '0 0 40px rgba(168,85,247,0.8), 0 0 80px rgba(139,92,246,0.45), 0 0 140px rgba(109,40,217,0.25)',
            }}
          >
            PYTHIA
          </h1>

          {/* Tagline */}
          <p
            className="text-sm tracking-wide text-center max-w-xs leading-relaxed mt-1"
            style={{ color: 'rgba(192,132,252,0.6)', fontFamily: 'Inter, sans-serif' }}
          >
            The future is already priced in.<br />Trade the probability, not the outcome.
          </p>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 animate-pulse-slow">
          <span className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'rgba(192,132,252,0.5)' }}>
            Explore markets
          </span>
          <svg className="w-4 h-4" style={{ color: 'rgba(192,132,252,0.5)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-[220px]">
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
              <button onClick={clearSearch} className="text-xs text-accent hover:underline mt-2">
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
