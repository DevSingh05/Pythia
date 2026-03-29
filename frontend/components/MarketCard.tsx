'use client'

import Link from 'next/link'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn, fmtProb, fmtUSDC, fmtPP } from '@/lib/utils'
import { AppMarket } from '@/lib/api'

interface MarketCardProps {
  market: AppMarket
}

export default function MarketCard({ market }: MarketCardProps) {
  const pctWidth = Math.round(market.currentProb * 100)
  const isUp = market.change24h >= 0

  return (
    <Link href={`/market/${market.id}?ps=${encodeURIComponent(market.slug)}`}>
      <div className={cn(
        'group flex flex-col gap-3 p-4 rounded-lg',
        'bg-card hover:bg-card-hover border border-border hover:border-zinc-600',
        'transition-colors duration-150 cursor-pointer',
        'animate-fade-in'
      )}>
        {/* Tags */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {market.tags.slice(0, 2).map(tag => (
              <span
                key={tag}
                className="text-[11px] font-medium px-2 py-0.5 rounded bg-surface border border-border text-muted-fg capitalize"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className={cn(
            'flex items-center gap-1 text-xs tabular-nums shrink-0',
            isUp ? 'text-green' : 'text-red'
          )}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {fmtPP(Math.abs(market.change24h), false)}
          </div>
        </div>

        {/* Title */}
        <p className="text-sm text-zinc-200 leading-snug line-clamp-2 group-hover:text-zinc-100 transition-colors min-h-[2.5rem]">
          {market.title}
        </p>

        {/* Probability */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-baseline">
            <span className="text-xl font-semibold tabular-nums text-zinc-100">
              {fmtProb(market.currentProb)}
            </span>
            <span className="text-xs text-muted">YES</span>
          </div>
          <div className="h-1 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full animate-fill"
              style={{ width: `${pctWidth}%` }}
            />
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-muted pt-0.5">
          <span>{fmtUSDC(market.volume24h)} vol</span>
          <span>{market.daysToResolution}d left</span>
        </div>
      </div>
    </Link>
  )
}

export function MarketCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-card border border-border animate-pulse">
      <div className="flex gap-1.5">
        <div className="h-4 w-14 bg-border rounded" />
        <div className="h-4 w-10 bg-border rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="h-4 bg-border rounded w-full" />
        <div className="h-4 bg-border rounded w-4/5" />
      </div>
      <div className="h-6 w-14 bg-border rounded" />
      <div className="h-1 bg-border rounded-full" />
      <div className="flex justify-between pt-0.5">
        <div className="h-3 w-16 bg-border rounded" />
        <div className="h-3 w-10 bg-border rounded" />
      </div>
    </div>
  )
}
