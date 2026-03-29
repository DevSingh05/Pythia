'use client'

import { useEffect, useState } from 'react'
import { fetchOptionsChain, fetchPriceHistory, OptionsChainResponse } from '@/lib/api'
import { buildOptionsChain, computeHistoricalVol, EXPIRY_OPTIONS } from '@/lib/pricing'

interface UseOptionsChainState {
  data: OptionsChainResponse | null
  loading: boolean
  error: string | null
}

/**
 * Fetches the options chain from the Pythia pricing backend.
 * Falls back to client-side computation (logit-normal, dynamic strikes) if unavailable.
 *
 * Quant notes:
 *  - Strikes are selected dynamically via availableStrikes() — logit-space distance
 *    from current prob, so low/high prob markets get appropriate strike grids
 *  - IV defaults to 1.5 logit-space annual vol (≈ moderate uncertainty);
 *    if price history is available, we compute HV and use it as the IV estimate
 *  - Greeks use exact logit-jacobian for Δ, bump-and-reprice for Γ
 */
export function useOptionsChain(
  marketId: string,
  currentProb: number,
  impliedVol: number,
  clobTokenId?: string,
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

    async function compute() {
      // Estimate vol from price history if we have a token ID
      let sigma = impliedVol || 1.5
      if (clobTokenId) {
        try {
          const hist = await fetchPriceHistory(clobTokenId, '30d')
          if (hist && hist.length >= 10) {
            const hv = computeHistoricalVol(hist)
            if (!isNaN(hv) && hv > 0) {
              sigma = Math.min(5.0, Math.max(0.2, hv))
            }
          }
        } catch {
          // keep default sigma
        }
      }

      const expiryOpt = EXPIRY_OPTIONS.find(e => e.label === expiry) ?? EXPIRY_OPTIONS[1]
      const chain = buildOptionsChain(currentProb, sigma, expiryOpt)
      return {
        marketId,
        currentProb,
        impliedVol: sigma,
        historicalVol: sigma,
        expiries: EXPIRY_OPTIONS.map(e => e.label),
        calls: chain.calls.map(c => ({ ...c, impliedVol: sigma, type: 'call' as const, expiry: expiryOpt.label })),
        puts: chain.puts.map(p => ({ ...p, impliedVol: sigma, type: 'put' as const, expiry: expiryOpt.label })),
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
      fetchOptionsChain(marketId, expiry)
        .then(data => setState({ data: sanitise(data), loading: false, error: null }))
        .catch(async () => {
          const data = await compute()
          setState({ data: sanitise(data), loading: false, error: null })
        })
    } else {
      compute()
        .then(data => setState({ data: sanitise(data), loading: false, error: null }))
        .catch(() => setState({ data: null, loading: false, error: 'Failed to build options chain' }))
    }
  }, [marketId, currentProb, impliedVol, clobTokenId, expiry, apiUrl])

  return state
}
