'use client'

import { useState } from 'react'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { OptionQuote, AppMarket, placeOrder } from '@/lib/api'
import PayoffChart from './PayoffChart'
import { Minus, Plus, AlertCircle } from 'lucide-react'

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
      <div className={cn('rounded-lg bg-card border border-border p-6 flex flex-col items-center justify-center gap-2 min-h-[180px]', className)}>
        <p className="text-sm text-muted text-center">
          Select a strike from the chain to review your trade.
        </p>
      </div>
    )
  }

  const totalCost = option.premium * quantity
  const isCall = option.type === 'call'

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
        walletAddress: '', // TODO: pass connected wallet address
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
      <div className={cn('rounded-lg bg-card border border-border p-6 flex flex-col items-center justify-center gap-2 min-h-[180px]', className)}>
        <p className="text-sm font-medium text-green">Order submitted</p>
        <p className="text-xs text-muted text-center">
          {side === 'buy' ? 'Bought' : 'Sold'} {quantity}× {fmtProb(option.strike)} {option.type.toUpperCase()}
        </p>
        <button
          onClick={() => { setSubmitted(false); setQuantity(1) }}
          className="text-xs text-accent hover:underline mt-1"
        >
          Place another order
        </button>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg bg-card border border-border overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center px-3 py-2.5 border-b border-border gap-3">
        <div className="flex rounded-md overflow-hidden border border-border text-xs">
          {(['buy', 'sell'] as const).map(s => (
            <button
              key={s}
              onClick={() => onSideChange(s)}
              className={cn(
                'px-3 py-1.5 font-medium capitalize transition-colors',
                side === s
                  ? s === 'buy' ? 'bg-green text-white' : 'bg-red text-white'
                  : 'text-muted hover:text-zinc-200'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className={cn(
            'font-mono px-2 py-0.5 rounded',
            isCall ? 'text-green bg-green-muted' : 'text-red bg-red-muted'
          )}>
            {fmtProb(option.strike)} {option.type.toUpperCase()}
          </span>
          <span>{option.expiry}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Premium', value: fmtPremium(option.premium), mono: true, highlight: false },
            { label: 'Breakeven', value: fmtProb(option.breakeven, 1), mono: true, highlight: true },
          ].map(({ label, value, mono, highlight }) => (
            <div key={label} className="bg-surface rounded-md p-2.5">
              <div className="text-xs text-muted mb-0.5">{label}</div>
              <div className={cn(
                'text-sm font-medium',
                mono && 'font-mono tabular-nums',
                highlight ? 'text-accent' : 'text-zinc-200'
              )}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Quantity */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Quantity</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-sm font-mono tabular-nums w-6 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity(q => q + 1)}
              className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Payoff chart */}
        <PayoffChart
          option={option}
          side={side}
          quantity={quantity}
          currentProb={market.currentProb}
        />

        {/* Order summary */}
        <div className="bg-surface rounded-md p-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-muted">
            <span>Order type</span>
            <span className="text-zinc-300">Market</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Contracts</span>
            <span className="text-zinc-300 font-mono tabular-nums">{quantity}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 mt-1">
            <span className="text-muted">{side === 'buy' ? 'Total cost' : 'Total credit'}</span>
            <span className={cn(
              'font-mono tabular-nums font-medium',
              side === 'buy' ? 'text-red' : 'text-green'
            )}>
              {side === 'buy' ? '−' : '+'}{fmtPremium(totalCost)}
            </span>
          </div>
        </div>

        {/* Errors / warnings */}
        {orderError && (
          <div className="flex gap-2 text-xs text-red bg-red-muted border border-red/20 rounded-md p-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{orderError}</span>
          </div>
        )}
        {side === 'sell' && (
          <div className="flex gap-2 text-xs text-muted border border-border rounded-md p-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Selling creates potentially unlimited loss exposure.</span>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={cn(
            'w-full py-2.5 rounded-md text-sm font-medium transition-colors',
            side === 'buy'
              ? 'bg-green hover:bg-green/90 text-white'
              : 'bg-red hover:bg-red/90 text-white',
            loading && 'opacity-60 cursor-not-allowed'
          )}
        >
          {loading ? 'Processing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity}× ${option.type.toUpperCase()}`}
        </button>

        <p className="text-[10px] text-muted text-center">
          Connect wallet to place real orders · European · Cash settled
        </p>
      </div>
    </div>
  )
}
