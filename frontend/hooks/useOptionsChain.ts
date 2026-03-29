'use client'

import { useEffect, useState } from 'react'
import { fetchOptionsChain, OptionsChainResponse } from '@/lib/api'
import { buildOptionsChain, EXPIRY_OPTIONS } from '@/lib/pricing'

interface UseOptionsChainState {
  data: OptionsChainResponse | null
  loading: boolean
  error: string | null
}

export function useOptionsChain(
  marketId: string,
  currentProb: number,
  impliedVol: number,
  _clobTokenId?: string,
  expiry: string = '7D'
) {
  const [state, setState] = useState<UseOptionsChainState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!marketId) return
    setState(s => ({ ...s, loading: true, error: null }))

    let cancelled = false

    async function load() {
      const legacy: Record<string, string> = { '1W': '7D', '2W': '14D', '1M': '30D' }
      const label = legacy[expiry] ?? expiry
      const expiryOpt = EXPIRY_OPTIONS.find(e => e.label === label) ?? EXPIRY_OPTIONS[1]

      /** Build chain client-side using the supplied sigma */
      function buildLocal(sigma: number): OptionsChainResponse {
        const chain = buildOptionsChain(currentProb, sigma, expiryOpt)
        return {
          marketId,
          currentProb,
          impliedVol: sigma,
          historicalVol: sigma,
          expiries: EXPIRY_OPTIONS.map(e => e.label),
          calls: chain.calls.map(c => ({ ...c, impliedVol: sigma, type: 'call' as const, expiry: expiryOpt.label })),
          puts:  chain.puts.map(p => ({ ...p, impliedVol: sigma, type: 'put'  as const, expiry: expiryOpt.label })),
          updatedAt: new Date().toISOString(),
        }
      }

      const dedup = <T extends { strike: number; type: string }>(opts: T[]): T[] => {
        const seen = new Set<string>()
        return opts.filter(o => {
          const k = `${o.type}-${o.strike}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
      }

      const sanitise = (data: OptionsChainResponse): OptionsChainResponse => ({
        ...data,
        calls: dedup(data.calls) as typeof data.calls,
        puts:  dedup(data.puts)  as typeof data.puts,
      })

      try {
        const data = await fetchOptionsChain(marketId, expiry, currentProb)
        if (!cancelled) setState({ data: sanitise(data), loading: false, error: null })
      } catch {
        // Chain endpoint unavailable — build locally from the supplied implied vol
        if (!cancelled) setState({ data: sanitise(buildLocal(impliedVol)), loading: false, error: null })
      }
    }

    load().catch(() => {
      if (!cancelled) setState({ data: null, loading: false, error: 'Failed to build options chain' })
    })

    return () => { cancelled = true }
  }, [marketId, currentProb, impliedVol, expiry])

  return state
}
