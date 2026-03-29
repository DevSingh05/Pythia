'use client'

import { useState } from 'react'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { OptionQuote, AppMarket, placeOrder } from '@/lib/api'
import PayoffChart, { computePayoffMetrics, fmtCents } from './PayoffChart'
import { Minus, Plus, AlertCircle, LogIn, FlaskConical, TrendingUp, TrendingDown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import AuthModal from './AuthModal'
import { usePaperTrades } from '@/hooks/usePaperTrades'
import { generateOrderId } from '@/lib/paperTrade'

interface TradePanelProps {
  market: AppMarket
  option: OptionQuote | null
  side: 'buy' | 'sell'
  onSideChange: (s: 'buy' | 'sell') => void
  className?: string
}

export default function TradePanel({ market, option, side, onSideChange, className }: TradePanelProps) {
  const { user, getToken } = useAuth()
  const { addOrder } = usePaperTrades()
  const [showAuth, setShowAuth] = useState(false)
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
  /** Backend may round to 0; chain can show 0.00¢ while model still has tiny value — block truly zero quotes. */
  const noExecutablePremium =
    !Number.isFinite(option.premium) || option.premium <= 0

  const handleSubmit = async () => {
    if (noExecutablePremium) {
      setOrderError('No quoted premium for this strike — not executable (deep OTM or stale quote).')
      return
    }
    setLoading(true)
    setOrderError(null)
    try {
      const token = getToken()
      await placeOrder(
        {
          marketId: market.id,
          strike: option.strike,
          type: option.type,
          expiry: option.expiry,
          side,
          quantity,
          limitPrice: option.premium,
          walletAddress: '',
        },
        token ?? '',
      )

      const paperResult = addOrder({
        id: generateOrderId(),
        timestamp: Date.now(),
        marketId: market.id,
        marketTitle: market.title,
        currentProbAtFill: market.currentProb,
        strike: option.strike,
        type: option.type,
        expiry: option.expiry,
        daysToExpiry: market.daysToResolution,
        side,
        quantity,
        premium: option.premium,
        totalCost: option.premium * quantity,
        impliedVol: option.impliedVol,
        status: 'filled',
      })
      if (!paperResult.success) {
        setOrderError(paperResult.error ?? 'Paper balance insufficient')
        return
      }

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
    <>
    <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden', className)}>
      {/* Paper-trading notice */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-[10px] font-medium">
        <FlaskConical className="w-3 h-3 shrink-0" />
        Paper Trading — orders are simulated and tracked in your account
      </div>

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
        {/* 3-metric bar — max loss / breakeven / max profit */}
        {(() => {
          const { maxPnl, minPnl, breakevenProb, beAnalytic } = computePayoffMetrics(option, side, quantity)
          return (
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-lg bg-red-500/[0.07] border border-red-500/20 p-2.5 text-center">
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-medium">Max Loss</div>
                <div className="text-sm font-mono font-bold text-red-400">{fmtCents(minPnl)}</div>
              </div>
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 p-2.5 text-center">
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-medium">Breakeven</div>
                <div className="text-sm font-mono font-bold text-amber-400">
                  {beAnalytic != null ? `${(breakevenProb * 100).toFixed(1)}%` : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-500/[0.07] border border-emerald-500/20 p-2.5 text-center">
                <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 font-medium">Max Profit</div>
                <div className="text-sm font-mono font-bold text-emerald-400">{fmtCents(maxPnl)}</div>
              </div>
            </div>
          )
        })()}

        {/* Payoff chart */}
        <PayoffChart
          option={option}
          side={side}
          quantity={quantity}
          currentProb={market.currentProb}
        />

        {/* Premium per contract */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Premium / contract</span>
          <span className="text-sm font-mono font-semibold text-zinc-100">{fmtPremium(option.premium)}</span>
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

        {noExecutablePremium && (
          <div className="flex gap-2 text-xs text-amber-400/90 bg-amber-500/8 border border-amber-500/25 rounded-lg p-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Premium is zero or missing — you cannot buy this for free; pick a strike with a positive quote or refresh.
            </span>
          </div>
        )}

        {/* Submit — gated on auth */}
        {user ? (
          <button
            onClick={handleSubmit}
            disabled={loading || noExecutablePremium}
            className={cn(
              'w-full py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-colors',
              side === 'buy'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white',
              (loading || noExecutablePremium) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {loading ? 'Processing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity > 1 ? `${quantity}×` : ''} ${option.type.toUpperCase()}`}
          </button>
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors bg-accent hover:bg-accent/90 text-white flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            Log in to place orders
          </button>
        )}

        <p className="text-[10px] text-zinc-600 text-center">
          American exercise · Cash settled · Logit-normal tree
        </p>
      </div>
    </div>

    {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
