'use client'

import { useEffect, useState, useCallback } from 'react'
import { fetchMarkets, fetchMarket, fetchPriceHistory, AppMarket, PricePoint } from '@/lib/api'

interface UseMarketsState {
  markets: AppMarket[]
  loading: boolean
  error: string | null
}

export function useMarkets(params?: { limit?: number; tag?: string; q?: string }) {
  const [state, setState] = useState<UseMarketsState>({
    markets: [],
    loading: true,
    error: null,
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const markets = await fetchMarkets(params)
      setState({ markets, loading: false, error: null })
    } catch (e) {
      setState({ markets: [], loading: false, error: (e as Error).message })
    }
  }, [params?.limit, params?.tag, params?.q])

  useEffect(() => { load() }, [load])

  return { ...state, refetch: load }
}

interface UseMarketState {
  market: AppMarket | null
  loading: boolean
  error: string | null
}

export function useMarket(id: string) {
  const [state, setState] = useState<UseMarketState>({
    market: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!id) return
    setState(s => ({ ...s, loading: true, error: null }))
    fetchMarket(id)
      .then(market => setState({ market, loading: false, error: null }))
      .catch(e => setState({ market: null, loading: false, error: e.message }))
  }, [id])

  return state
}

interface UsePriceHistoryState {
  history: PricePoint[]
  loading: boolean
  error: string | null
}

export function usePriceHistory(
  tokenId: string,          // YES CLOB token_id (market.clobTokenId)
  interval: '1h' | '6h' | '1d' | '7d' | '30d' = '7d',
  marketId?: string,        // integer market ID — only needed for custom backend
) {
  const [state, setState] = useState<UsePriceHistoryState>({
    history: [],
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!tokenId) {
      setState(s => ({ ...s, loading: false }))
      return
    }
    setState(s => ({ ...s, loading: true, error: null }))
    fetchPriceHistory(tokenId, interval, marketId)
      .then(history => setState({ history, loading: false, error: null }))
      .catch(e => setState({ history: [], loading: false, error: e.message }))
  }, [tokenId, interval, marketId])

  return state
}
