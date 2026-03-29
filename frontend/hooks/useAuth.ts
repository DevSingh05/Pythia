'use client'

import { useEffect, useState, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null)
      setUser(s?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }, [])

  /**
   * Returns the current access token from the session.
   * The server decodes but doesn't check expiry, so even a slightly stale
   * token is fine for identifying the user in paper-trading requests.
   */
  const getToken = useCallback(async (): Promise<string | null> => {
    const { data } = await createClient().auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  /** Snapshot of the last-known token — use getToken() for freshness. */
  const accessToken = session?.access_token ?? null

  return { user, session, accessToken, loading, signOut, getToken }
}
