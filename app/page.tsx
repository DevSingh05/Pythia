'use client'

import { useState } from 'react'
import Navbar from '@/components/Navbar'
import MarketCard, { MarketCardSkeleton } from '@/components/MarketCard'
import { useMarkets } from '@/hooks/useMarkets'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'politics', label: 'Politics' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'economics', label: 'Economics' },
  { id: 'sports', label: 'Sports' },
  { id: 'science', label: 'Science' },
  { id: 'geo', label: 'Geopolitics' },
]

export default function HomePage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  const { markets, loading, error } = useMarkets({
    limit: 20,
    tag: category || undefined,
    q: query || undefined,
  })

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
            Trade probability, not outcomes.
          </h1>
          <p className="text-muted-fg text-sm max-w-lg leading-relaxed">
            Pythia layers options on Polymarket YES% probabilities.
            Buy calls when you expect a probability to rise, puts when you expect it to fall.
            Priced with a Logit-Normal model for bounded underlyings.
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
            : markets.map(market => <MarketCard key={market.id} market={market} />)
          }
        </div>

        {!loading && !error && markets.length === 0 && (
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
              { step: '01', title: 'Pick a market', desc: 'Any active Polymarket contract. The YES% is your underlying.' },
              { step: '02', title: 'Choose direction', desc: 'Call if you expect YES% to rise. Put if you expect it to fall.' },
              { step: '03', title: 'Set your strike', desc: 'Pick a probability target — 30%, 50%, 70%. Breakeven shown live.' },
              { step: '04', title: 'View P&L', desc: 'Payoff curve updates in real time. Max win and loss clearly shown.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-card border border-border rounded-lg p-4 space-y-1.5">
                <div className="text-xs text-muted tabular-nums">{step}</div>
                <div className="text-sm font-medium text-zinc-200">{title}</div>
                <div className="text-xs text-muted leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Model callout */}
        <div className="rounded-lg bg-card border border-border p-5 space-y-3">
          <h3 className="text-sm font-medium text-zinc-200">Logit-Normal Pricing</h3>
          <p className="text-xs text-muted leading-relaxed max-w-2xl">
            Black-Scholes assumes unbounded lognormal prices and can't price bounded probabilities.
            Pythia models{' '}
            <span className="font-mono text-zinc-300">logit(p) = ln(p / 1−p)</span>, which is
            unbounded and follows Brownian motion — enabling closed-form pricing with proper Greeks.
          </p>
          <div className="font-mono text-xs text-muted bg-surface rounded-md p-3 space-y-1 border border-border">
            <div><span className="text-zinc-400">L₀</span> = logit(p₀) = ln(p₀ / (1 − p₀))</div>
            <div><span className="text-zinc-400">L_T</span> ~ N(L₀, σ²τ)  where τ = time to expiry</div>
            <div><span className="text-zinc-400">p_T</span> = sigmoid(L_T) = 1 / (1 + e^(−L_T))</div>
            <div><span className="text-zinc-400">C</span>   = Φ((L₀ − logit(K)) / (σ√τ))</div>
          </div>
        </div>
      </div>

      <footer className="border-t border-border mt-12 py-6 text-center text-xs text-muted">
        Pythia · Options on prediction market probabilities
      </footer>
    </div>
  )
}
