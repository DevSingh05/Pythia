'use client'

import { useEffect, useState, useMemo } from 'react'
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

    if (apiUrl) {
      // Use real backend
      fetchOptionsChain(marketId, expiry)
        .then(data => setState({ data, loading: false, error: null }))
        .catch(e => setState({ data: null, loading: false, error: e.message }))
    } else {
      // Compute locally using logit-normal model (for dev/demo without backend)
      const expiryOpt = EXPIRY_OPTIONS.find(e => e.label === expiry) ?? EXPIRY_OPTIONS[1]
      const sigma = impliedVol || 1.5  // fallback vol if not provided
      const strikes = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80]
      const chain = buildOptionsChain(currentProb, sigma, expiryOpt, strikes)

      const data: OptionsChainResponse = {
        marketId,
        currentProb,
        impliedVol: sigma,
        historicalVol: sigma * 0.9,
        expiries: EXPIRY_OPTIONS.map(e => e.label),
        calls: chain.calls.map(c => ({
          ...c,
          impliedVol: sigma,
          type: 'call' as const,
          expiry,
        })),
        puts: chain.puts.map(p => ({
          ...p,
          impliedVol: sigma,
          type: 'put' as const,
          expiry,
        })),
        updatedAt: new Date().toISOString(),
      }

      setState({ data, loading: false, error: null })
    }
  }, [marketId, currentProb, impliedVol, expiry, apiUrl])

  return state
}
