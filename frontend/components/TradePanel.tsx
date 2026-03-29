'use client'

import { useState, useEffect } from 'react'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { OptionQuote, AppMarket, OptionsChainResponse, placeOrder } from '@/lib/api'
import type { ProbChartOutcomeInfo } from '@/components/ProbChart'
import PreTradeAnalysis from '@/components/PreTradeAnalysis'
import PayoffChart, { fmtCents } from './PayoffChart'
import {
  Minus, Plus, AlertCircle, LogIn, FlaskConical, TrendingUp, TrendingDown, Loader2,
  ChevronRight, LineChart,
} from 'lucide-react'
import { StarButton } from './ui/star-button'
import { useAuth } from '@/hooks/useAuth'
import AuthModal from './AuthModal'
import { usePaperTrades } from '@/hooks/usePaperTrades'
import { generateOrderId } from '@/lib/paperTrade'
import DemoOrderBook from './demo/DemoOrderBook'
import DemoPremiumTicker from './demo/DemoPremiumTicker'
import type { UseDemoModeReturn } from '@/hooks/useDemoMode'
import type { DemoPnlScenario } from '@/lib/demoSimulation'

interface TradePanelProps {
  market: AppMarket
  option: OptionQuote | null
  side: 'buy' | 'sell'
  onSideChange: (s: 'buy' | 'sell') => void
  className?: string
  /** Live chain (IV/HV + consistency with pricer); required for Analyze. */
  chain?: OptionsChainResponse | null
  /** Multi-outcome YES lines for analysis chart; optional. */
  probChartOutcomes?: ProbChartOutcomeInfo[]
  demoMode?: UseDemoModeReturn
  /** Clears selection + resets demo (e.g. parent calls demo.reset + setSelectedOption(null)) */
  onDemoTryAnother?: () => void
}

export default function TradePanel({
  market,
  option,
  side,
  onSideChange,
  className,
  chain,
  probChartOutcomes,
  demoMode,
  onDemoTryAnother,
}: TradePanelProps) {
  const { user, getToken } = useAuth()
  const { addOrder } = usePaperTrades()
  const [showAuth, setShowAuth] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  useEffect(() => {
    setShowAnalysis(false)
  }, [option?.strike, option?.type, option?.expiry, market.id])

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
  /** Premium/loss display multiplier: 1 lot = 1,000 units at $1 face. */
  const LOT = 1000
  const noExecutablePremium =
    !Number.isFinite(option.premium) || option.premium <= 0

  const demoActive = demoMode?.isActive ?? false
  const demoStep = demoMode?.step
  const demoPhase = demoStep?.phase
  const isDemoFilling = demoMode && demoPhase === 'filling'
  const isDemoProcessing = demoMode && demoPhase === 'processing'
  const isDemoSuccess = demoMode && demoPhase === 'success' && demoStep?.pnlScenario && demoStep.option

  const handleSubmit = async () => {
    if (demoActive) return
    if (noExecutablePremium) {
      setOrderError('No quoted premium for this strike - not executable (deep OTM or stale quote).')
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

  const handleDemoTryAnother = () => {
    onDemoTryAnother?.()
  }

  if (submitted) {
    return (
      <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col items-center justify-center gap-2 min-h-[200px]', className)}>
        <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <p className="text-sm font-medium text-emerald-400">Order submitted</p>
        <p className="text-xs text-zinc-500 text-center">
          {side === 'buy' ? 'Bought' : 'Sold'} {quantity}x {fmtProb(option.strike)} {option.type.toUpperCase()}
        </p>
        <button onClick={() => { setSubmitted(false); setQuantity(1) }} className="text-xs text-blue-400 hover:underline mt-1">
          New order
        </button>
      </div>
    )
  }

  if (isDemoSuccess && demoStep && demoMode) {
    const dOpt = demoStep.option!
    const dq = demoStep.quantity
    const pnl = demoStep.pnlScenario!
    return (
      <>
        <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden', className)}>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/25 text-emerald-400 text-[10px] font-medium">
            <FlaskConical className="w-3 h-3 shrink-0" />
            Demo fill complete - paper only, no order placed
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-xs font-mono font-semibold px-2 py-0.5 rounded',
                dOpt.type === 'call' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
              )}>
                {fmtProb(dOpt.strike)} {dOpt.type.toUpperCase()}
              </span>
              <span className="text-xs text-zinc-500">{dOpt.expiry}</span>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <DemoSuccessBody
              option={dOpt}
              quantity={dq}
              pnl={pnl}
              onTryAnother={handleDemoTryAnother}
            />
          </div>
        </div>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    )
  }

  const demoStepForBook = demoStep && demoStep.option ? demoStep : null

  return (
    <>
    <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden', className)}>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-[10px] font-medium">
        <FlaskConical className="w-3 h-3 shrink-0" />
        Paper Trading - orders are simulated and tracked in your account
      </div>

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
              type="button"
              disabled={demoActive}
              onClick={() => onSideChange(s)}
              className={cn(
                'px-3 py-1.5 font-medium capitalize transition-colors',
                demoActive && 'opacity-50 cursor-not-allowed',
                side === s
                  ? s === 'buy' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                  : s === 'buy'
                    ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                    : 'text-red-400 hover:text-red-300 bg-red-500/[0.08] hover:bg-red-500/15'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {isDemoFilling && demoStepForBook && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,140px)] gap-3 items-start">
            <DemoOrderBook demoStep={demoStepForBook} />
            <DemoPremiumTicker demoStep={demoStepForBook} />
          </div>
        )}

        {isDemoProcessing && demoStepForBook && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(0,140px)] gap-3 items-start opacity-90">
            <DemoOrderBook demoStep={demoStepForBook} />
            <DemoPremiumTicker demoStep={demoStepForBook} />
          </div>
        )}

        <PayoffChart
          option={option}
          side={side}
          quantity={quantity}
          currentProb={market.currentProb}
          lotSize={LOT}
        />

        {!isDemoFilling && !isDemoProcessing && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Premium / lot <span className="text-zinc-600 normal-case">(x1,000 units)</span></span>
            <span className="text-sm font-mono font-semibold text-zinc-100">${(option.premium * LOT).toFixed(2)}</span>
          </div>
        )}

        <div className="flex items-center justify-between bg-zinc-800/40 rounded-lg px-3 py-2.5">
          <span className="text-xs text-zinc-400">Contracts</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={demoActive}
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className={cn(
                'w-6 h-6 rounded-md border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors',
                demoActive && 'opacity-40 cursor-not-allowed'
              )}
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-sm font-mono tabular-nums w-5 text-center text-zinc-100">{quantity}</span>
            <button
              type="button"
              disabled={demoActive}
              onClick={() => setQuantity(q => q + 1)}
              className={cn(
                'w-6 h-6 rounded-md border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors',
                demoActive && 'opacity-40 cursor-not-allowed'
              )}
            >
              <Plus className="w-3 h-3" />
            </button>
            <div className="w-px h-4 bg-zinc-700 mx-1" />
            <span className={cn('text-sm font-mono tabular-nums font-medium', side === 'buy' ? 'text-red-400' : 'text-emerald-400')}>
              {side === 'buy' ? '−' : '+'}${(totalCost * LOT).toFixed(2)}
            </span>
          </div>
        </div>

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
              Premium is zero or missing. Pick a strike with a positive quote or refresh.
            </span>
          </div>
        )}

        {chain ? (
          <button
            type="button"
            disabled={demoActive}
            onClick={() => setShowAnalysis(true)}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors',
              'border border-zinc-600 bg-zinc-800/50 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-500',
              demoActive && 'opacity-50 cursor-not-allowed',
            )}
          >
            <LineChart className="w-4 h-4 text-violet-400 shrink-0" />
            Analyze before trading
            <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
          </button>
        ) : (
          <p className="text-[10px] text-zinc-600 text-center">Analysis unlocks when the options chain finishes loading.</p>
        )}

        {demoMode && !demoActive && (
          <button
            type="button"
            onClick={() => demoMode.startDemo(option)}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors',
              'border border-amber-500/35 bg-amber-500/[0.08] text-amber-200 hover:bg-amber-500/15 hover:border-amber-500/50',
            )}
          >
            Add to paper order book
          </button>
        )}

        {user ? (
          <StarButton
            variant={side === 'buy' ? 'buy' : 'sell'}
            size="lg"
            onClick={handleSubmit}
            disabled={loading || noExecutablePremium || demoActive}
            className={cn(
              'w-full justify-center py-2.5 text-sm font-semibold tracking-wide transition-colors relative',
              side === 'buy'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white',
              (loading || noExecutablePremium || demoActive) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isDemoProcessing ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Processing...
              </span>
            ) : demoActive ? (
              'Demo in progress...'
            ) : loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Processing...
              </span>
            ) : (
              `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity > 1 ? `${quantity}x ` : ''}${option.type.toUpperCase()} - $${(totalCost * LOT).toFixed(2)}`
            )}
          </StarButton>
        ) : (
          <StarButton
            size="lg"
            onClick={() => setShowAuth(true)}
            disabled={demoActive}
            className="w-full justify-center"
          >
            <LogIn className="w-4 h-4" />
            Log in to place orders
          </StarButton>
        )}

        <p className="text-[10px] text-zinc-600 text-center">
          American exercise / Cash settled / Logit-normal tree
        </p>
      </div>
    </div>

    {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    {showAnalysis && chain && (
      <PreTradeAnalysis
        option={option}
        side={side}
        quantity={quantity}
        market={market}
        chain={chain}
        outcomes={probChartOutcomes}
        onClose={() => setShowAnalysis(false)}
        onAddToPaperDemo={
          demoMode && !demoMode.isActive
            ? () => {
                demoMode.startDemo(option)
                setShowAnalysis(false)
              }
            : undefined
        }
      />
    )}
    </>
  )
}

function DemoSuccessBody({
  option,
  quantity,
  pnl,
  onTryAnother,
}: {
  option: OptionQuote
  quantity: number
  pnl: DemoPnlScenario
  onTryAnother: () => void
}) {
  const bullCase = pnl.gain5pp
  const bearCase = pnl.maxLoss
  return (
    <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/[0.06] p-4 space-y-4">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-400">Demo order filled</p>
          <p className="text-xs text-zinc-400 mt-1">
            Bought {quantity}x {option.type.toUpperCase()} @ {fmtPremium(option.premium)} / contract
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-zinc-900/60 border border-emerald-500/20 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Bullish (+5pp)</div>
          <div className="font-mono font-semibold text-emerald-400">
            {fmtCents(bullCase)}
          </div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-red-500/20 p-3">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Bearish (max loss)</div>
          <div className="font-mono font-semibold text-red-400">{fmtCents(bearCase)}</div>
        </div>
      </div>
      <p className="text-[10px] text-zinc-500">
        Breakeven YES {(pnl.breakeven * 100).toFixed(1)}% / Max gain {fmtCents(pnl.maxGain)}
      </p>
      <StarButton type="button" variant="primary" size="md" className="w-full justify-center" onClick={onTryAnother}>
        Try another trade
      </StarButton>
    </div>
  )
}
