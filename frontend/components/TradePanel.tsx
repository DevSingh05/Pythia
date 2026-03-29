'use client'

import { useState } from 'react'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { OptionQuote, AppMarket, placeOrder } from '@/lib/api'
import PayoffChart from './PayoffChart'
import { Minus, Plus, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react'

interface TradePanelProps {
  market: AppMarket
  option: OptionQuote | null
  side: 'buy' | 'sell'
  onSideChange: (s: 'buy' | 'sell') => void
  className?: string
}

export default function TradePanel({ market, option, side, onSideChange, className }: TradePanelProps) {
  const [quantity, setQuantity] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  if (!option) {
    return (
      <div className={cn(
        'rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col items-center justify-center gap-3 min-h-[200px] p-6',
        className
      )}>
        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-zinc-600" />
        </div>
        <p className="text-sm text-zinc-500 text-center leading-relaxed">
          Select a strike from the chain to review your trade.
        </p>
      </div>
    )
  }

  const isCall = option.type === 'call'
  const totalCost = option.premium * quantity

  const handleSubmit = async () => {
    setLoading(true)
    setOrderError(null)
    try {
      await placeOrder({
        marketId: market.id,
        strike: option.strike,
        type: option.type,
        expiry: option.expiry,
        side,
        quantity,
        walletAddress: '',
      })
      setSubmitted(true)
    } catch (e) {
      setOrderError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col items-center justify-center gap-2 min-h-[200px]', className)}>
        <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <p className="text-sm font-medium text-emerald-400">Order submitted</p>
        <p className="text-xs text-zinc-500 text-center">
          {side === 'buy' ? 'Bought' : 'Sold'} {quantity}× {fmtProb(option.strike)} {option.type.toUpperCase()}
        </p>
        <button onClick={() => { setSubmitted(false); setQuantity(1) }} className="text-xs text-blue-400 hover:underline mt-1">
          New order
        </button>
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-xs font-mono font-semibold px-2 py-0.5 rounded',
            isCall ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          )}>
            {fmtProb(option.strike)} {option.type.toUpperCase()}
          </span>
          <span className="text-xs text-zinc-500">{option.expiry}</span>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
          {(['buy', 'sell'] as const).map(s => (
            <button
              key={s}
              onClick={() => onSideChange(s)}
              className={cn(
                'px-3 py-1.5 font-medium capitalize transition-colors',
                side === s
                  ? s === 'buy' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 bg-transparent'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Payoff chart — centerpiece */}
        <PayoffChart
          option={option}
          side={side}
          quantity={quantity}
          currentProb={market.currentProb}
        />

        {/* Premium + breakeven */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Premium / contract</div>
            <div className="text-sm font-mono font-semibold text-zinc-100">{fmtPremium(option.premium)}</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Breakeven YES%</div>
            <div className="text-sm font-mono font-semibold text-blue-400">{fmtProb(option.breakeven, 1)}</div>
          </div>
        </div>

        {/* Quantity + total */}
        <div className="flex items-center justify-between bg-zinc-800/40 rounded-lg px-3 py-2.5">
          <span className="text-xs text-zinc-400">Contracts</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="w-6 h-6 rounded-md border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-sm font-mono tabular-nums w-5 text-center text-zinc-100">{quantity}</span>
            <button
              onClick={() => setQuantity(q => q + 1)}
              className="w-6 h-6 rounded-md border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
            <div className="w-px h-4 bg-zinc-700 mx-1" />
            <span className={cn('text-sm font-mono tabular-nums font-medium', side === 'buy' ? 'text-red-400' : 'text-emerald-400')}>
              {side === 'buy' ? '−' : '+'}{fmtPremium(totalCost)}
            </span>
          </div>
        </div>

        {/* Errors */}
        {orderError && (
          <div className="flex gap-2 text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{orderError}</span>
          </div>
        )}

        {side === 'sell' && (
          <div className="flex gap-2 text-xs text-zinc-500 border border-zinc-800 rounded-lg p-2.5">
            <TrendingDown className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span>Selling creates loss exposure if the market moves against you.</span>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={cn(
            'w-full py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-colors',
            side === 'buy'
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-red-600 hover:bg-red-500 text-white',
            loading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {loading ? 'Processing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity > 1 ? `${quantity}×` : ''} ${option.type.toUpperCase()}`}
        </button>

        <p className="text-[10px] text-zinc-600 text-center">
          American style · Cash settled in YES% · Connect wallet to trade
        </p>
      </div>
    </div>
  )
}
