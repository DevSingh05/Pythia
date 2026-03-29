'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface AuthModalProps {
  onClose: () => void
}

type Tab = 'login' | 'signup'

export default function AuthModal({ onClose }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  function switchTab(t: Tab) {
    setTab(t)
    setMessage(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const supabase = createClient()

    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose()
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage({ type: 'ok', text: 'Account created! Check your email to confirm, then log in.' })
      }
    } catch (err: unknown) {
      setMessage({ type: 'err', text: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm mx-4 bg-card border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="flex gap-1">
            {(['login', 'signup'] as const).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={cn(
                  'px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors',
                  tab === t
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-zinc-200'
                )}
              >
                {t === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-zinc-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className="space-y-2">
            <input
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={cn(
                'w-full bg-surface border border-border rounded-md px-3 py-2 text-sm',
                'text-zinc-200 placeholder:text-muted',
                'focus:outline-none focus:border-zinc-600 transition-colors'
              )}
            />
            <input
              type="password"
              placeholder="Password"
              required
              minLength={6}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={cn(
                'w-full bg-surface border border-border rounded-md px-3 py-2 text-sm',
                'text-zinc-200 placeholder:text-muted',
                'focus:outline-none focus:border-zinc-600 transition-colors'
              )}
            />
          </div>

          {message && (
            <p className={cn(
              'text-xs rounded-md px-3 py-2',
              message.type === 'ok'
                ? 'text-green bg-green/10 border border-green/20'
                : 'text-red bg-red/10 border border-red/20'
            )}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-2.5 rounded-md text-sm font-medium transition-colors',
              'bg-accent hover:bg-accent/90 text-white',
              loading && 'opacity-60 cursor-not-allowed'
            )}
          >
            {loading
              ? 'Please wait…'
              : tab === 'login' ? 'Log in' : 'Create account'
            }
          </button>

          <p className="text-[10px] text-muted text-center">
            {tab === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '}
            <button
              type="button"
              onClick={() => switchTab(tab === 'login' ? 'signup' : 'login')}
              className="text-accent hover:underline"
            >
              {tab === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
