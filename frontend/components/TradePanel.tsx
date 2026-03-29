'use client'

import { useState } from 'react'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { OptionQuote, AppMarket, placeOrder } from '@/lib/api'
import PayoffChart from './PayoffChart'
import { Minus, Plus, AlertCircle, LogIn, FlaskConical, TrendingUp, TrendingDown, Loader2, CheckCircle2, RotateCcw } from 'lucide-react'
import { StarButton } from './ui/star-button'
import { useAuth } from '@/hooks/useAuth'
import AuthModal from './AuthModal'
import { usePaperTrades } from '@/hooks/usePaperTrades'
import { generateOrderId } from '@/lib/paperTrade'
import DemoOrderBook from './demo/DemoOrderBook'
import DemoPremiumTicker from './demo/DemoPremiumTicker'
import type { UseDemoModeReturn } from '@/hooks/useDemoMode'

interface TradePanelProps {
  market: AppMarket
  option: OptionQuote | null
  side: 'buy' | 'sell'
  onSideChange: (s: 'buy' | 'sell') => void
  className?: string
  demoMode?: UseDemoModeReturn
}

export default function TradePanel({ market, option, side, onSideChange, className, demoMode }: TradePanelProps) {
  const { user, getToken } = useAuth()
  const { addOrder } = usePaperTrades()
  const [showAuth, setShowAuth] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  const demoStep = demoMode?.step
  const demoPhase = demoStep?.phase ?? 'idle'
  const isDemoActive = demoMode?.isActive ?? false

  // ── Demo: success screen ──────────────────────────────────────────────────
  if (isDemoActive && demoPhase === 'success' && demoStep?.pnlScenario && demoStep.option) {
    const { pnlScenario, option: demoOpt, quantity: demoQty } = demoStep
    return (
      <div className={cn(
        'rounded-xl border border-emerald-500/30 bg-zinc-900/40 p-5 flex flex-col gap-4',
        className
      )}>
        {/* Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-400">Order Filled</p>
            <p className="text-[11px] text-zinc-500 font-mono">
              {demoQty}× {fmtProb(demoOpt.strike)} {demoOpt.type.toUpperCase()} · {demoOpt.expiry}
            </p>
          </div>
        </div>

        {/* Key P&L stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 p-3 space-y-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">+5pp move (est.)</p>
            <p className={cn('text-base font-mono font-bold', pnlScenario.gain5pp >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {pnlScenario.gain5pp >= 0 ? '+' : ''}{fmtPremium(pnlScenario.gain5pp)}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-1">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Max gain</p>
            <p className="text-base font-mono font-bold text-emerald-400">
              +{fmtPremium(pnlScenario.maxGain)}
            </p>
          </div>
        </div>

        {/* Max loss / breakeven */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <span className="text-zinc-500">Max loss</span>
            <span className="font-mono text-red-400">{fmtPremium(pnlScenario.maxLoss)}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <span className="text-zinc-500">Breakeven</span>
            <span className="font-mono text-blue-400">{fmtProb(pnlScenario.breakeven, 1)}</span>
          </div>
        </div>

        {/* Reset */}
        <button
          onClick={() => demoMode?.reset()}
          className="flex items-center justify-center gap-2 w-full text-xs text-zinc-400 hover:text-zinc-200 py-2 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Try another trade
        </button>
      </div>
    )
  }

  // ── No option selected ────────────────────────────────────────────────────
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
      const token = await getToken()
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

  // ── Normal (and demo filling/processing) panel ────────────────────────────
  const isProcessing = isDemoActive && demoPhase === 'processing'
  const isFilling = isDemoActive && demoPhase === 'filling'

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
        {/* Payoff chart — centerpiece */}
        <PayoffChart
          option={option}
          side={side}
          quantity={quantity}
          currentProb={market.currentProb}
        />

        {/* Demo filling: replace static boxes with live order book + premium ticker */}
        {isFilling && demoStep ? (
          <div className="grid grid-cols-2 gap-2 items-start">
            <DemoPremiumTicker demoStep={demoStep} />
            <DemoOrderBook demoStep={demoStep} />
          </div>
        ) : (
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
        )}

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
        {user ? (
          <StarButton
            variant={side === 'buy' ? 'buy' : 'sell'}
            size="lg"
            onClick={handleSubmit}
            disabled={loading || isProcessing}
            className="w-full justify-center"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing…
              </>
            ) : loading ? 'Processing…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity > 1 ? `${quantity}×` : ''} ${option.type.toUpperCase()}`}
          </StarButton>
        ) : (
          <StarButton
            size="lg"
            onClick={() => setShowAuth(true)}
            className="w-full justify-center"
          >
            <LogIn className="w-4 h-4" />
            Log in to place orders
          </StarButton>
        )}

        <p className="text-[10px] text-zinc-600 text-center">
          European · Cash settled · Logit-Normal pricing
        </p>
      </div>
    </div>

    {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
