'use client'

import { useEffect, useState } from 'react'
import { fetchOptionsChain, OptionsChainResponse } from '@/lib/api'
import { buildOptionsChain, EXPIRY_OPTIONS } from '@/lib/pricing'

interface UseOptionsChainState {
  data: OptionsChainResponse | null
  loading: boolean
  error: string | null
}

/**
 * Fetches the options chain from the Pythia pricing backend.
 * Falls back to client-side computation if no backend is configured.
 */
export function useOptionsChain(
  marketId: string,
  currentProb: number,
  impliedVol: number,
  expiry: string = '1W'
) {
  const [state, setState] = useState<UseOptionsChainState>({
    data: null,
    loading: true,
    error: null,
  })

  const apiUrl = process.env.NEXT_PUBLIC_API_URL

  useEffect(() => {
    if (!marketId) return
    setState(s => ({ ...s, loading: true, error: null }))

    const computeLocal = () => {
      const expiryOpt = EXPIRY_OPTIONS.find(e => e.label === expiry) ?? EXPIRY_OPTIONS[1]
      const sigma = impliedVol || 1.5
      const strikes = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80]
      const chain = buildOptionsChain(currentProb, sigma, expiryOpt, strikes)
      return {
        marketId,
        currentProb,
        impliedVol: sigma,
        historicalVol: sigma * 0.9,
        expiries: EXPIRY_OPTIONS.map(e => e.label),
        calls: chain.calls.map(c => ({ ...c, impliedVol: sigma, type: 'call' as const, expiry })),
        puts: chain.puts.map(p => ({ ...p, impliedVol: sigma, type: 'put' as const, expiry })),
        updatedAt: new Date().toISOString(),
      } as OptionsChainResponse
    }

    /** Deduplicate a list of options — keep only the first entry per strike. */
    const dedup = (opts: { strike: number; type: string }[]) => {
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

    if (apiUrl) {
      // Try real backend; silently fall back to client-side if it fails
      fetchOptionsChain(marketId, expiry)
        .then(data => setState({ data: sanitise(data), loading: false, error: null }))
        .catch(() => setState({ data: sanitise(computeLocal()), loading: false, error: null }))
    } else {
      setState({ data: sanitise(computeLocal()), loading: false, error: null })
    }
  }, [marketId, currentProb, impliedVol, expiry, apiUrl])

  return state
}
