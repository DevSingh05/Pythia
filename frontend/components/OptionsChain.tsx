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

  const options = type === 'call' ? chain.calls : chain.puts
  const currentProb = chain.currentProb

  const itmOptions = options.filter(o => o.isITM).sort((a, b) =>
    type === 'call' ? b.strike - a.strike : a.strike - b.strike
  )
  const otmOptions = options.filter(o => !o.isITM).sort((a, b) =>
    type === 'call' ? a.strike - b.strike : b.strike - a.strike
  )

  return (
    <div className={cn('rounded-lg bg-card border border-border overflow-hidden', className)}>
      {/* Controls */}
      <div className="px-3 py-2.5 flex items-center gap-3 border-b border-border flex-wrap">
        {/* Buy / Sell */}
        <div className="flex rounded-md overflow-hidden border border-border text-xs">
          {(['buy', 'sell'] as Side[]).map(s => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={cn(
                'px-3 py-1.5 font-medium capitalize transition-colors',
                side === s
                  ? s === 'buy'
                    ? 'bg-green text-white'
                    : 'bg-red text-white'
                  : 'text-muted hover:text-zinc-200'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Call / Put */}
        <div className="flex rounded-md overflow-hidden border border-border text-xs">
          {(['call', 'put'] as ContractType[]).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'px-3 py-1.5 font-medium capitalize transition-colors',
                type === t
                  ? 'bg-surface text-zinc-200 border-zinc-600'
                  : 'text-muted hover:text-zinc-200'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Expiry */}
        <div className="flex gap-1 ml-auto">
          {chain.expiries.map(e => (
            <button
              key={e}
              onClick={() => handleExpiryChange(e)}
              className={cn(
                'px-2 py-1 text-xs rounded font-mono transition-colors',
                expiry === e
                  ? 'bg-surface border border-zinc-600 text-zinc-200'
                  : 'text-muted hover:text-zinc-200'
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* IV / HV info bar */}
      <div className="px-3 py-1.5 bg-surface/50 flex items-center justify-between text-xs text-muted border-b border-border/50">
        <span>IV <span className="text-zinc-300 font-mono tabular-nums">{(chain.impliedVol * 100).toFixed(1)}%</span></span>
        <span className="text-muted/70">
          {type === 'call' ? 'Calls profit above strike' : 'Puts profit below strike'}
        </span>
        <span>HV <span className="text-muted-fg font-mono tabular-nums">{(chain.historicalVol * 100).toFixed(1)}%</span></span>
      </div>

      <OptionChainHeader showGreeks={showGreeks} />

      {/* ITM rows */}
      <div className="divide-y divide-border/20">
        {itmOptions.map(opt => (
          <OptionRow
            key={opt.strike}
            option={opt}
            currentProb={currentProb}
            onSelect={onSelectOption}
            selected={selectedOption?.strike === opt.strike && selectedOption?.type === opt.type}
            showGreeks={showGreeks}
          />
        ))}
      </div>

      {/* ATM separator */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface/30 border-y border-border/50">
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-xs font-mono text-muted px-2 tabular-nums">
          {fmtProb(currentProb, 1)} current
        </span>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      {/* OTM rows */}
      <div className="divide-y divide-border/20">
        {otmOptions.map(opt => (
          <OptionRow
            key={opt.strike}
            option={opt}
            currentProb={currentProb}
            onSelect={onSelectOption}
            selected={selectedOption?.strike === opt.strike && selectedOption?.type === opt.type}
            showGreeks={showGreeks}
          />
        ))}
      </div>
    </div>
  )
}

export function OptionsChainSkeleton() {
  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden animate-pulse">
      <div className="px-3 py-2.5 flex gap-3 border-b border-border">
        <div className="h-7 w-24 bg-border rounded-md" />
        <div className="h-7 w-24 bg-border rounded-md" />
        <div className="ml-auto flex gap-1">
          {[1,2,3,4].map(i => <div key={i} className="h-6 w-10 bg-border rounded" />)}
        </div>
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center px-3 py-3 border-b border-border/30 gap-4">
          <div className="h-4 w-10 bg-border rounded" />
          <div className="h-4 w-16 bg-border rounded" />
          <div className="ml-auto h-4 w-12 bg-border rounded" />
        </div>
      ))}
    </div>
  )
}
