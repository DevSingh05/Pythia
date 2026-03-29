'use client'

import { useState } from 'react'
import { cn, fmtProb } from '@/lib/utils'
import { OptionsChainResponse, OptionQuote } from '@/lib/api'
import OptionRow, { OptionChainHeader } from './OptionRow'

interface OptionsChainProps {
  chain: OptionsChainResponse
  onSelectOption: (opt: OptionQuote) => void
  onExpiryChange?: (expiry: string) => void
  selectedOption: OptionQuote | null
  showGreeks?: boolean
  className?: string
}

type Side = 'buy' | 'sell'
type ContractType = 'call' | 'put'

export default function OptionsChain({
  chain,
  onSelectOption,
  onExpiryChange,
  selectedOption,
  showGreeks = true,
  className,
}: OptionsChainProps) {
  const [side, setSide] = useState<Side>('buy')
  const [type, setType] = useState<ContractType>('call')
  const [expiry, setExpiry] = useState(chain.expiries?.[1] ?? chain.expiries?.[0] ?? '1W')

  function handleExpiryChange(e: string) {
    setExpiry(e)
    onExpiryChange?.(e)
  }

  const currentProb = chain.currentProb

  // Deduplicate by (type, strike)
  const rawOptions = type === 'call' ? chain.calls : chain.puts
  const seen = new Set<string>()
  const options = rawOptions.filter(o => {
    const k = `${o.type}-${o.strike}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  // For calls: ITM strikes below current prob (ascending toward ATM)
  // For puts:  ITM strikes above current prob (descending toward ATM)
  // Robinhood style: OTM at top, ATM divider in middle, ITM at bottom for calls
  // We reverse: show higher strikes first for calls so it reads naturally
  const sortedOptions = [...options].sort((a, b) => b.strike - a.strike)

  // Split around ATM
  const aboveATM = sortedOptions.filter(o => o.strike > currentProb)
  const atATM = sortedOptions.filter(o => Math.abs(o.strike - currentProb) < 0.001)
  const belowATM = sortedOptions.filter(o => o.strike < currentProb)

  // For calls: above ATM = OTM (descending), below ATM = ITM (descending)
  // For puts:  above ATM = ITM (descending), below ATM = OTM (descending)
  const topSection = aboveATM // already sorted high→low
  const bottomSection = belowATM // already sorted high→low

  return (
    <div className={cn('rounded-xl bg-zinc-900/40 border border-zinc-800 overflow-hidden', className)}>
      {/* Controls bar */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800 flex-wrap bg-zinc-900/60">
        {/* Buy / Sell toggle */}
        <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
          {(['buy', 'sell'] as Side[]).map(s => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={cn(
                'px-4 py-1.5 font-semibold capitalize transition-all duration-150',
                side === s
                  ? s === 'buy'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                    : 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                  : 'text-zinc-500 hover:text-zinc-200'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Call / Put toggle */}
        <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
          {(['call', 'put'] as ContractType[]).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'px-4 py-1.5 font-semibold capitalize transition-all duration-150',
                type === t
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-200'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Expiry pills */}
        <div className="flex gap-1 ml-auto">
          {chain.expiries.map(e => (
            <button
              key={e}
              onClick={() => handleExpiryChange(e)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md font-mono font-medium transition-all duration-150',
                expiry === e
                  ? 'bg-zinc-700 border border-zinc-600 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60'
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* IV / HV info bar */}
      <div className="px-4 py-2 flex items-center justify-between text-xs border-b border-zinc-800/60 bg-zinc-900/30">
        <span className="text-zinc-500">
          IV <span className="text-zinc-300 font-mono tabular-nums font-medium">{(chain.impliedVol * 100).toFixed(1)}%</span>
        </span>
        <span className="text-zinc-600 text-[11px]">
          {type === 'call' ? 'Calls profit above strike' : 'Puts profit below strike'}
        </span>
        <span className="text-zinc-500">
          HV <span className="text-zinc-400 font-mono tabular-nums">{(chain.historicalVol * 100).toFixed(1)}%</span>
        </span>
      </div>

      {/* Column headers */}
      <OptionChainHeader showGreeks={showGreeks} />

      {/* Top section (strikes above current prob) */}
      <div>
        {topSection.map((opt, i) => (
          <OptionRow
            key={`${opt.type}-${opt.strike}-top-${i}`}
            option={opt}
            currentProb={currentProb}
            onSelect={onSelectOption}
            selected={selectedOption?.strike === opt.strike && selectedOption?.type === opt.type}
            showGreeks={showGreeks}
          />
        ))}
      </div>

      {/* ═══ ATM DIVIDER — Robinhood-style current price bar ═══ */}
      <div className="relative">
        <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
        <div className="flex items-center justify-center py-1.5 bg-amber-500/[0.06]">
          <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-mono font-semibold text-amber-400 tabular-nums">
              YES probability: {fmtProb(currentProb, 1)}
            </span>
          </div>
        </div>
        <div className="h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
      </div>

      {/* ATM strike(s) if any */}
      {atATM.map((opt, i) => (
        <OptionRow
          key={`${opt.type}-${opt.strike}-atm-${i}`}
          option={opt}
          currentProb={currentProb}
          onSelect={onSelectOption}
          selected={selectedOption?.strike === opt.strike && selectedOption?.type === opt.type}
          showGreeks={showGreeks}
        />
      ))}

      {/* Bottom section (strikes below current prob) */}
      <div>
        {bottomSection.map((opt, i) => (
          <OptionRow
            key={`${opt.type}-${opt.strike}-bot-${i}`}
            option={opt}
            currentProb={currentProb}
            onSelect={onSelectOption}
            selected={selectedOption?.strike === opt.strike && selectedOption?.type === opt.type}
            showGreeks={showGreeks}
          />
        ))}
      </div>

      {/* Footer: contract count */}
      <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-900/40 text-center">
        <span className="text-[10px] text-zinc-600">
          {options.length} contracts · {type === 'call' ? 'Call' : 'Put'}s · {expiry} expiry
        </span>
      </div>
    </div>
  )
}

export function OptionsChainSkeleton() {
  return (
    <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 overflow-hidden animate-pulse">
      <div className="px-4 py-3 flex gap-3 border-b border-zinc-800">
        <div className="h-7 w-24 bg-zinc-800 rounded-lg" />
        <div className="h-7 w-24 bg-zinc-800 rounded-lg" />
        <div className="ml-auto flex gap-1">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-6 w-10 bg-zinc-800 rounded-md" />)}
        </div>
      </div>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex items-center px-4 py-3.5 border-b border-zinc-800/30 gap-6">
          <div className="h-4 w-12 bg-zinc-800 rounded" />
          <div className="h-4 w-16 bg-zinc-800 rounded" />
          <div className="flex-1" />
          <div className="h-4 w-14 bg-zinc-800 rounded" />
        </div>
      ))}
    </div>
  )
}
