'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { fetchMarket, fetchPriceHistoryFast, type PricePoint, type Position } from '@/lib/api'
import BacktestChart from './BacktestChart'
import type { PaperOrder } from '@/lib/paperTrade'
import { FlaskConical, ChevronDown } from 'lucide-react'

interface PortfolioBacktestProps {
  positions: Position[]
  orders: PaperOrder[]
  className?: string
}

const LOT = 1000

export default function PortfolioBacktest({ positions, orders, className }: PortfolioBacktestProps) {
  const [expanded, setExpanded] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [history, setHistory] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(false)

  // Build selectable options from positions + their matching orders
  const options = useMemo(() => {
    const seen = new Set<string>()
    const opts: {
      key: string
      label: string
      marketId: string
      marketTitle: string
      strike: number
      type: 'call' | 'put'
      side: 'buy' | 'sell'
      daysToExpiry: number
      impliedVol: number
    }[] = []

    for (const pos of positions) {
      const key = `${pos.marketId}|${pos.strike}|${pos.type}`
      if (seen.has(key)) continue
      seen.add(key)

      // Find matching order for IV and DTE
      const matchingOrder = orders.find(
        o => o.marketId === pos.marketId && o.strike === pos.strike && o.type === pos.type
      )

      opts.push({
        key,
        label: `${pos.marketTitle.slice(0, 30)} — ${pos.side === 'long' ? 'BUY' : 'SELL'} ${pos.type.toUpperCase()} @ ${(pos.strike * 100).toFixed(0)}%`,
        marketId: pos.marketId,
        marketTitle: pos.marketTitle,
        strike: pos.strike,
        type: pos.type,
        side: pos.side === 'long' ? 'buy' : 'sell',
        daysToExpiry: matchingOrder?.daysToExpiry ?? 30,
        impliedVol: matchingOrder?.impliedVol ?? 1.5,
      })
    }

    return opts
  }, [positions, orders])

  // Auto-select first option
  useEffect(() => {
    if (options.length > 0 && !selectedKey) {
      setSelectedKey(options[0].key)
    }
  }, [options, selectedKey])

  const selected = options.find(o => o.key === selectedKey)

  // Fetch history when selection changes — need to resolve clobTokenId first
  useEffect(() => {
    if (!selected) return

    let cancelled = false
    setLoading(true)
    setHistory([])

    // Resolve the market to get clobTokenId, then fetch price history
    fetchMarket(selected.marketId)
      .then(market => {
        if (cancelled || !market.clobTokenId) {
          setLoading(false)
          return
        }
        return fetchPriceHistoryFast(market.clobTokenId)
      })
      .then(pts => {
        if (!cancelled && pts) {
          setHistory(pts)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [selected?.marketId])

  if (options.length === 0) return null

  return (
    <div className={cn('bg-card border border-border  overflow-hidden', className)}>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface transition-colors"
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-zinc-100">Backtest Simulator</span>
          <span className="text-[10px] text-zinc-500">
            — See how your trades would have performed historically
          </span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-zinc-500 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Position selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
              Select position to backtest
            </label>
            <select
              value={selectedKey ?? ''}
              onChange={e => setSelectedKey(e.target.value)}
              className="w-full bg-zinc-800/60 border border-zinc-700  px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
            >
              {options.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Backtest chart */}
          {loading ? (
            <div className="h-[300px] flex items-center justify-center">
              <div className="text-sm text-zinc-500 animate-pulse">Loading historical data...</div>
            </div>
          ) : selected && history.length > 0 ? (
            <BacktestChart
              history={history}
              strike={selected.strike}
              type={selected.type}
              side={selected.side}
              sigma={selected.impliedVol}
              daysToExpiry={selected.daysToExpiry}
              lotSize={LOT}
            />
          ) : (
            <div className="h-[200px] flex items-center justify-center">
              <p className="text-sm text-zinc-500">No historical data available for this market.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
