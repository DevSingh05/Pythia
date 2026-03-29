'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Play } from 'lucide-react'
import { optionIndicatorKit } from '@/lib/optionChartIndicators'

export interface CodeSandboxData {
  history: { t: number; p: number }[]
  /** Model premium vs time (same construction as Option history tab). */
  optionPremiumHistory: { t: number; premium: number; prob: number }[]
  currentProb: number
  impliedVol: number
  historicalVol: number
  option: {
    strike: number
    premium: number
    type: 'call' | 'put'
    expiry: string
    delta: number
    gamma: number
    theta: number
    vega: number
  }
  side: 'buy' | 'sell'
  quantity: number
}

const DEFAULT_SCRIPT = `// data.history — underlying YES% [{ t, p }]
// data.optionPremiumHistory — model premium [{ t, premium, prob }]
// kit.sma(arr, n), kit.ema(arr, n), kit.rsi(arr, n), kit.computeIndicator('sma'|'ema'|'rsi', premiums, period)

const prem = data.optionPremiumHistory.map(d => d.premium)
const ma = kit.sma(prem, 12)
const lastMa = ma.filter(x => x != null).pop()
return \`Last SMA(12) of model premium: \${lastMa != null ? '$' + lastMa.toFixed(4) : 'n/a'}\`
`

interface CodeSandboxProps {
  data: CodeSandboxData
  className?: string
}

export default function CodeSandbox({ data, className }: CodeSandboxProps) {
  const [code, setCode] = useState(DEFAULT_SCRIPT)
  const [output, setOutput] = useState<string>('')
  const [ranAt, setRanAt] = useState<number | null>(null)

  const run = useCallback(() => {
    try {
      const fn = new Function('data', 'kit', `"use strict";\n${code}`)
      const result = fn(data, optionIndicatorKit)
      setOutput(result === undefined ? '(no return value)' : String(result))
      setRanAt(Date.now())
    } catch (e) {
      setOutput(`Error: ${(e as Error).message}`)
      setRanAt(Date.now())
    }
  }, [code, data])

  return (
    <div className={cn('flex flex-col gap-3 min-h-0', className)}>
      <p className="text-[10px] text-zinc-500 leading-relaxed">
        Runs only in your browser. Do not paste untrusted code. Use{' '}
        <code className="text-zinc-400">data</code> (history, optionPremiumHistory, option, vols) and{' '}
        <code className="text-zinc-400">kit</code> (sma, ema, rsi, computeIndicator).{' '}
        <code className="text-zinc-400">return</code> a string or value to display. Add new formulas in{' '}
        <code className="text-zinc-400">lib/optionChartIndicators.ts</code> to reuse them here.
      </p>
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        spellCheck={false}
        className={cn(
          'w-full min-h-[140px] rounded-lg border border-zinc-700 bg-zinc-950',
          'px-3 py-2 text-[11px] font-mono text-zinc-200',
          'focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-y',
        )}
      />
      <button
        type="button"
        onClick={run}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium py-2 px-3 w-fit"
      >
        <Play className="w-3.5 h-3.5" />
        Run
      </button>
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 min-h-[72px]">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Output</div>
        <pre className="text-[11px] font-mono text-zinc-200 whitespace-pre-wrap break-words">
          {output || (ranAt == null ? 'Click Run to execute.' : '')}
        </pre>
      </div>
    </div>
  )
}
