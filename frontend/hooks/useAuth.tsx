'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'

export interface AuthContextValue {
  user: User | null
  session: Session | null
  accessToken: string | null
  loading: boolean
  signOut: () => Promise<void>
  /** In-memory token from the last auth event — does not call Supabase on each read. */
  getToken: () => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Single Supabase auth listener for the whole app.
 * Avoids duplicate getSession / onAuthStateChange per useAuth() caller (rate limits on free tier).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, s: Session | null) => {
      setSession(s)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    await createClient().auth.signOut()
  }, [])

  const getToken = useCallback(() => session?.access_token ?? null, [session])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      accessToken: session?.access_token ?? null,
      loading,
      signOut,
      getToken,
    }),
    [session, loading, signOut, getToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>')
  }
  return ctx
}
