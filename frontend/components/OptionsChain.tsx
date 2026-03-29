'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn, fmtProb, fmtPremium } from '@/lib/utils'
import { OptionsChainResponse, OptionQuote } from '@/lib/api'
import OptionRow, { OptionChainHeader } from './OptionRow'
import { liquidityHeat } from '@/lib/demoSimulation'
import { List, Columns } from 'lucide-react'

interface OptionsChainProps {
  chain: OptionsChainResponse
  selectedExpiry: string
  onSelectOption: (opt: OptionQuote) => void
  onAddToPaperDemo?: (opt: OptionQuote) => void
  onExpiryChange?: (expiry: string) => void
  selectedOption: OptionQuote | null
  showGreeks?: boolean
  className?: string
  isDemoMode?: boolean
  demoOption?: OptionQuote | null
  demoPhase?: string
}

type ContractType = 'call' | 'put'
type ChainView = 'list' | 'tformat'

export default function OptionsChain({
  chain,
  selectedExpiry,
  onSelectOption,
  onAddToPaperDemo,
  onExpiryChange,
  selectedOption,
  showGreeks = true,
  className,
  isDemoMode = false,
  demoOption,
  demoPhase,
}: OptionsChainProps) {
  const [type, setType] = useState<ContractType>('call')
  const [view, setView] = useState<ChainView>('tformat')

  useEffect(() => {
    if (isDemoMode && demoOption) setType(demoOption.type)
    else if (!isDemoMode && selectedOption) setType(selectedOption.type)
  }, [isDemoMode, demoOption?.type, demoOption?.strike, selectedOption?.type, selectedOption?.strike])

  const [dataAgeMs, setDataAgeMs] = useState(0)

  useEffect(() => {
    const updatedAt = chain.updatedAt ? new Date(chain.updatedAt).getTime() : Date.now()
    const tick = () => setDataAgeMs(Date.now() - updatedAt)
    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [chain.updatedAt])

  const dataAgeS = Math.floor(dataAgeMs / 1000)
  const isStale = dataAgeS > 10
  const isVeryStale = dataAgeS > 30
  const currentProb = chain.currentProb

  // Deduped options for list view
  const listOptions = useMemo(() => {
    const rawOptions = type === 'call' ? chain.calls : chain.puts
    const seen = new Set<string>()
    return rawOptions.filter(o => {
      const k = `${o.type}-${o.strike}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [chain.calls, chain.puts, type])

  // For T-format: pair calls and puts by strike
  const tFormatRows = useMemo(() => {
    const callMap = new Map<number, OptionQuote>()
    const putMap = new Map<number, OptionQuote>()
    for (const c of chain.calls) callMap.set(c.strike, c)
    for (const p of chain.puts) putMap.set(p.strike, p)
    const strikes = [...new Set([...callMap.keys(), ...putMap.keys()])].sort((a, b) => b - a)
    return strikes.map(k => ({
      strike: k,
      call: callMap.get(k) ?? null,
      put: putMap.get(k) ?? null,
    }))
  }, [chain.calls, chain.puts])

  // Split around ATM for list view
  const sortedOptions = [...listOptions].sort((a, b) => b.strike - a.strike)
  const topSection = sortedOptions.filter(o => o.strike > currentProb)
  const atATM = sortedOptions.filter(o => Math.abs(o.strike - currentProb) < 0.001)
  const bottomSection = sortedOptions.filter(o => o.strike < currentProb)

  // Split around ATM for T-format
  const tAbove = tFormatRows.filter(r => r.strike > currentProb)
  const tAtATM = tFormatRows.filter(r => Math.abs(r.strike - currentProb) < 0.001)
  const tBelow = tFormatRows.filter(r => r.strike < currentProb)

  return (
    <div className={cn('rounded-xl bg-zinc-900/40 border border-zinc-800 overflow-hidden', className)}>
      {/* Controls bar */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800 flex-wrap bg-zinc-900/60">
        {/* Call/Put toggle — only in list view */}
        {view === 'list' && (
          <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
            {(['call', 'put'] as ContractType[]).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'px-4 py-1.5 font-semibold capitalize transition-all duration-150',
                  type === t
                    ? t === 'call'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 text-white'
                    : t === 'call'
                      ? 'text-emerald-400/70 hover:text-emerald-300 bg-transparent'
                      : 'text-red-400/70 hover:text-red-300 bg-transparent'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
          <button
            onClick={() => setView('tformat')}
            title="T-format: Calls & Puts side by side"
            className={cn(
              'px-2 py-1.5 transition-colors',
              view === 'tformat'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setView('list')}
            title="List view: one type at a time"
            className={cn(
              'px-2 py-1.5 border-l border-zinc-700 transition-colors',
              view === 'list'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Expiry pills */}
        <div className="flex gap-1 ml-auto">
          {chain.expiries.map(e => (
            <button
              key={e}
              onClick={() => onExpiryChange?.(e)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md font-mono font-medium transition-all duration-150',
                selectedExpiry === e
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
          {view === 'tformat' ? 'Calls | Strike | Puts' : type === 'call' ? 'Calls profit above strike' : 'Puts profit below strike'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">
            HV <span className="text-zinc-400 font-mono tabular-nums">{(chain.historicalVol * 100).toFixed(1)}%</span>
          </span>
          <span className={cn(
            'font-mono tabular-nums px-1.5 py-0.5 rounded text-[10px]',
            isVeryStale
              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
              : isStale
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          )}>
            {isVeryStale ? 'Stale' : isStale ? `${dataAgeS}s old` : 'Live'}
          </span>
        </div>
      </div>

      {/* ─── T-FORMAT VIEW ─── */}
      {view === 'tformat' && (
        <>
          {/* T-format header */}
          <TFormatHeader />

          {/* Above ATM */}
          {tAbove.map((row, i) => (
            <TFormatRow
              key={`t-${row.strike}-${i}`}
              row={row}
              currentProb={currentProb}
              selectedOption={selectedOption}
              onSelect={onSelectOption}
              isDemoMode={isDemoMode}
              demoOption={demoOption}
            />
          ))}

          {/* ATM divider */}
          <ATMDivider currentProb={currentProb} />

          {/* At ATM */}
          {tAtATM.map((row, i) => (
            <TFormatRow
              key={`t-atm-${row.strike}-${i}`}
              row={row}
              currentProb={currentProb}
              selectedOption={selectedOption}
              onSelect={onSelectOption}
              isDemoMode={isDemoMode}
              demoOption={demoOption}
            />
          ))}

          {/* Below ATM */}
          {tBelow.map((row, i) => (
            <TFormatRow
              key={`t-bot-${row.strike}-${i}`}
              row={row}
              currentProb={currentProb}
              selectedOption={selectedOption}
              onSelect={onSelectOption}
              isDemoMode={isDemoMode}
              demoOption={demoOption}
            />
          ))}
        </>
      )}

      {/* ─── LIST VIEW ─── */}
      {view === 'list' && (
        <>
          <OptionChainHeader showGreeks={showGreeks} />

          {topSection.map((opt, i) => (
            <OptionRow
              key={`${opt.type}-${opt.strike}-top-${i}`}
              option={opt}
              currentProb={currentProb}
              onSelect={onSelectOption}
              onAddToPaperDemo={onAddToPaperDemo}
              selected={selectedOption?.strike === opt.strike && selectedOption?.type === opt.type}
              showGreeks={showGreeks}
              liquidityScore={isDemoMode ? liquidityHeat(opt) : 0}
              isDemoHighlighted={isDemoMode && demoOption != null && demoOption.strike === opt.strike && demoOption.type === opt.type}
              isDemoSelecting={isDemoMode && demoPhase === 'selecting' && demoOption != null && demoOption.strike === opt.strike && demoOption.type === opt.type}
            />
          ))}

          <ATMDivider currentProb={currentProb} />

          {atATM.map((opt, i) => (
            <OptionRow
              key={`${opt.type}-${opt.strike}-atm-${i}`}
              option={opt}
              currentProb={currentProb}
              onSelect={onSelectOption}
              onAddToPaperDemo={onAddToPaperDemo}
              selected={selectedOption?.strike === opt.strike && selectedOption?.type === opt.type}
              showGreeks={showGreeks}
              liquidityScore={isDemoMode ? liquidityHeat(opt) : 0}
              isDemoHighlighted={isDemoMode && demoOption != null && demoOption.strike === opt.strike && demoOption.type === opt.type}
              isDemoSelecting={isDemoMode && demoPhase === 'selecting' && demoOption != null && demoOption.strike === opt.strike && demoOption.type === opt.type}
            />
          ))}

          {bottomSection.map((opt, i) => (
            <OptionRow
              key={`${opt.type}-${opt.strike}-bot-${i}`}
              option={opt}
              currentProb={currentProb}
              onSelect={onSelectOption}
              onAddToPaperDemo={onAddToPaperDemo}
              selected={selectedOption?.strike === opt.strike && selectedOption?.type === opt.type}
              showGreeks={showGreeks}
              liquidityScore={isDemoMode ? liquidityHeat(opt) : 0}
              isDemoHighlighted={isDemoMode && demoOption != null && demoOption.strike === opt.strike && demoOption.type === opt.type}
              isDemoSelecting={isDemoMode && demoPhase === 'selecting' && demoOption != null && demoOption.strike === opt.strike && demoOption.type === opt.type}
            />
          ))}
        </>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-800/60 bg-zinc-900/40 text-center">
        <span className="text-[10px] text-zinc-600">
          {view === 'tformat'
            ? `${tFormatRows.length} strikes / Calls & Puts / ${selectedExpiry} expiry`
            : `${listOptions.length} contracts / ${type === 'call' ? 'Call' : 'Put'}s / ${selectedExpiry} expiry`}
        </span>
      </div>
    </div>
  )
}

/** ATM divider bar */
function ATMDivider({ currentProb }: { currentProb: number }) {
  return (
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
  )
}

/** T-format column header */
function TFormatHeader() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center bg-zinc-900/80 border-b border-zinc-800 sticky top-0 z-10">
      {/* Calls header */}
      <div className="grid grid-cols-[1fr_56px_56px] items-center px-3 py-2">
        <div className="text-[10px] font-medium text-emerald-500/70 uppercase tracking-wider">Premium</div>
        <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider text-center">Delta</div>
        <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider text-center">BE</div>
      </div>

      {/* Strike */}
      <div className="px-3 py-2 border-x border-zinc-800 bg-zinc-800/30 min-w-[72px] text-center">
        <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Strike</div>
      </div>

      {/* Puts header */}
      <div className="grid grid-cols-[56px_56px_1fr] items-center px-3 py-2">
        <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider text-center">BE</div>
        <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider text-center">Delta</div>
        <div className="text-[10px] font-medium text-red-500/70 uppercase tracking-wider text-right">Premium</div>
      </div>
    </div>
  )
}

/** A single row in T-format: call | strike | put */
function TFormatRow({
  row,
  currentProb,
  selectedOption,
  onSelect,
  isDemoMode,
  demoOption,
}: {
  row: { strike: number; call: OptionQuote | null; put: OptionQuote | null }
  currentProb: number
  selectedOption: OptionQuote | null
  onSelect: (opt: OptionQuote) => void
  isDemoMode: boolean
  demoOption?: OptionQuote | null
}) {
  const atm = Math.abs(row.strike - currentProb) < 0.025
  const callIsITM = currentProb > row.strike
  const putIsITM = currentProb < row.strike

  const callSelected = selectedOption?.strike === row.strike && selectedOption?.type === 'call'
  const putSelected = selectedOption?.strike === row.strike && selectedOption?.type === 'put'

  const callHighlight = isDemoMode && demoOption?.strike === row.strike && demoOption?.type === 'call'
  const putHighlight = isDemoMode && demoOption?.strike === row.strike && demoOption?.type === 'put'

  return (
    <div className={cn(
      'grid grid-cols-[1fr_auto_1fr] items-stretch border-b border-zinc-800/40 last:border-0',
      atm && 'bg-amber-500/[0.03]',
    )}>
      {/* ── Call side ── */}
      <button
        type="button"
        onClick={() => row.call && onSelect(row.call)}
        disabled={!row.call}
        className={cn(
          'grid grid-cols-[1fr_56px_56px] items-center px-3 py-2.5 text-left transition-colors',
          row.call
            ? callSelected
              ? 'bg-emerald-500/[0.08] ring-1 ring-inset ring-emerald-500/30'
              : callIsITM
                ? 'bg-emerald-500/[0.03] hover:bg-emerald-500/[0.07]'
                : 'hover:bg-zinc-800/40'
            : 'opacity-30 cursor-default',
          callHighlight && 'ring-1 ring-inset ring-amber-400/50 bg-amber-500/[0.06]',
        )}
      >
        {row.call ? (
          <>
            {/* Premium */}
            <div>
              <span className="text-sm font-mono font-bold tabular-nums text-emerald-400">
                {fmtPremium(row.call.premium)}
              </span>
              <span className={cn(
                'text-[10px] font-mono tabular-nums ml-1.5',
                row.call.premiumChangePct >= 0 ? 'text-emerald-500/50' : 'text-red-500/50',
              )}>
                {row.call.premiumChangePct >= 0 ? '+' : ''}{(row.call.premiumChangePct * 100).toFixed(1)}%
              </span>
            </div>
            {/* Delta */}
            <div className="text-center">
              <span className={cn(
                'text-[11px] font-mono tabular-nums',
                Math.abs(row.call.delta) > 0.4 ? 'text-emerald-400' : Math.abs(row.call.delta) > 0.2 ? 'text-zinc-300' : 'text-zinc-500',
              )}>
                {row.call.delta.toFixed(3)}
              </span>
            </div>
            {/* Breakeven */}
            <div className="text-center">
              <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                {fmtProb(row.call.breakeven, 0)}
              </span>
            </div>
          </>
        ) : (
          <div className="col-span-3 text-center text-zinc-600 text-[10px]">N/A</div>
        )}
      </button>

      {/* ── Strike center ── */}
      <div className={cn(
        'flex flex-col items-center justify-center border-x border-zinc-800 px-3 min-w-[72px]',
        atm ? 'bg-amber-500/[0.08]' : 'bg-zinc-800/20',
      )}>
        <span className={cn(
          'text-sm font-mono tabular-nums font-bold',
          atm ? 'text-amber-400' : (callIsITM || putIsITM) ? 'text-zinc-100' : 'text-zinc-400',
        )}>
          {fmtProb(row.strike)}
        </span>
        <span className={cn(
          'text-[8px] font-medium uppercase tracking-wider',
          atm ? 'text-amber-400/70' : 'text-zinc-600',
        )}>
          {atm ? 'ATM' : callIsITM ? 'C-ITM' : putIsITM ? 'P-ITM' : 'OTM'}
        </span>
      </div>

      {/* ── Put side ── */}
      <button
        type="button"
        onClick={() => row.put && onSelect(row.put)}
        disabled={!row.put}
        className={cn(
          'grid grid-cols-[56px_56px_1fr] items-center px-3 py-2.5 text-left transition-colors',
          row.put
            ? putSelected
              ? 'bg-red-500/[0.08] ring-1 ring-inset ring-red-500/30'
              : putIsITM
                ? 'bg-red-500/[0.03] hover:bg-red-500/[0.07]'
                : 'hover:bg-zinc-800/40'
            : 'opacity-30 cursor-default',
          putHighlight && 'ring-1 ring-inset ring-amber-400/50 bg-amber-500/[0.06]',
        )}
      >
        {row.put ? (
          <>
            {/* Breakeven */}
            <div className="text-center">
              <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                {fmtProb(row.put.breakeven, 0)}
              </span>
            </div>
            {/* Delta */}
            <div className="text-center">
              <span className={cn(
                'text-[11px] font-mono tabular-nums',
                Math.abs(row.put.delta) > 0.4 ? 'text-red-400' : Math.abs(row.put.delta) > 0.2 ? 'text-zinc-300' : 'text-zinc-500',
              )}>
                {row.put.delta.toFixed(3)}
              </span>
            </div>
            {/* Premium */}
            <div className="text-right">
              <span className="text-sm font-mono font-bold tabular-nums text-red-400">
                {fmtPremium(row.put.premium)}
              </span>
              <span className={cn(
                'text-[10px] font-mono tabular-nums ml-1.5',
                row.put.premiumChangePct >= 0 ? 'text-emerald-500/50' : 'text-red-500/50',
              )}>
                {row.put.premiumChangePct >= 0 ? '+' : ''}{(row.put.premiumChangePct * 100).toFixed(1)}%
              </span>
            </div>
          </>
        ) : (
          <div className="col-span-3 text-center text-zinc-600 text-[10px]">N/A</div>
        )}
      </button>
    </div>
  )
}

export function OptionsChainSkeleton() {
  return (
    <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 overflow-hidden animate-pulse">
      <div className="px-4 py-3 flex gap-3 border-b border-zinc-800">
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
