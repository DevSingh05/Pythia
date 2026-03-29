'use client'

import { useState, useEffect, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, LogOut, Briefcase, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import AuthModal from './AuthModal'

interface NavbarProps {
  searchQuery?: string
  onSearch?: (q: string) => void
}

export default function Navbar({ searchQuery = '', onSearch }: NavbarProps) {
  const { user, loading, signOut } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (searchParams.get('auth') === 'required' && !loading && !user) {
      setShowAuth(true)
      const url = new URL(window.location.href)
      url.searchParams.delete('auth')
      router.replace(url.pathname + (url.search || ''), { scroll: false })
    }
  }, [searchParams, loading, user, router])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  const closeMobile = () => setMobileOpen(false)

  const searchInputProps = {
    type: 'text' as const,
    placeholder: 'Search markets...',
    value: searchQuery,
    onChange: (e: ChangeEvent<HTMLInputElement>) => onSearch?.(e.target.value),
  }

  return (
    <>
      <header
        className="sticky top-0 z-50"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(9,9,11,0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3 md:gap-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className={cn(
              'md:hidden p-2 -ml-2 rounded-md shrink-0',
              'border border-white/[0.08] bg-white/[0.05] text-zinc-200',
              'hover:bg-white/[0.08] hover:border-purple-500/30 transition-colors',
            )}
          >
            <Menu className="w-4 h-4" />
          </button>

          <Link href="/" className="flex items-center gap-3 shrink-0" onClick={closeMobile}>
            <span
              style={{
                fontFamily: 'Orbitron, var(--font-orbitron), system-ui, sans-serif',
                fontWeight: 900,
                letterSpacing: '0.12em',
                fontSize: '1.1rem',
                color: '#fff',
                textShadow: '0 0 18px rgba(168,85,247,0.75), 0 0 40px rgba(139,92,246,0.35)',
              }}
            >
              PYTHIA
            </span>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(192,132,252,0.85)',
                background: 'rgba(168,85,247,0.12)',
                border: '1px solid rgba(168,85,247,0.28)',
                borderRadius: '4px',
                padding: '2px 6px',
              }}
            >
              BETA
            </span>
          </Link>

          {onSearch !== undefined && (
            <div className="flex-1 min-w-0 max-w-sm relative hidden md:block">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              />
              <input
                {...searchInputProps}
                className="w-full text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-all duration-150"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                }}
                onFocus={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'
                }}
                onBlur={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                }}
              />
            </div>
          )}
          {onSearch === undefined && <div className="flex-1 min-w-0 hidden md:block" />}
          {onSearch !== undefined && <div className="flex-1 min-w-0 md:hidden" />}

          <nav className="hidden md:flex items-center gap-1 shrink-0">
            <Link
              href="/"
              className="px-4 py-2 text-sm rounded-lg transition-colors duration-150"
              style={{ color: 'rgba(255,255,255,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'transparent' }}
            >
              Markets
            </Link>
            {user && (
              <Link
                href="/portfolio"
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-colors duration-150"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'transparent' }}
              >
                <Briefcase className="w-3.5 h-3.5" />
                Portfolio
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:gap-3 shrink-0">
            {!loading && !user && (
              <button
                type="button"
                onClick={() => setShowAuth(true)}
                className="text-sm font-medium text-zinc-200 transition-all duration-200 hover:text-white"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.13)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 2px 12px rgba(0,0,0,0.25)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.14)'
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.38)'
                  e.currentTarget.style.boxShadow = '0 1px 0 rgba(255,255,255,0.08) inset, 0 2px 16px rgba(168,85,247,0.18)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)'
                  e.currentTarget.style.boxShadow = '0 1px 0 rgba(255,255,255,0.07) inset, 0 2px 12px rgba(0,0,0,0.25)'
                }}
              >
                <span className="hidden sm:inline">Log in / Sign up</span>
                <span className="sm:hidden">Log in</span>
              </button>
            )}

            {!loading && user && (
              <div className="flex items-center gap-2 md:gap-3">
                <span className="hidden sm:block text-xs truncate max-w-[160px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  title="Sign out"
                  className="flex items-center gap-1.5 text-sm transition-all duration-200"
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    color: 'rgba(255,255,255,0.6)',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.11)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 2px 12px rgba(0,0,0,0.25)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#fff'
                    e.currentTarget.style.background = 'rgba(220,38,38,0.12)'
                    e.currentTarget.style.borderColor = 'rgba(220,38,38,0.28)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.11)'
                  }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </div>
            )}

            {loading && (
              <div
                className="h-9 w-32 rounded-lg animate-pulse"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
            )}
          </div>
        </div>

        {onSearch !== undefined && (
          <div className="md:hidden px-4 pb-3 border-t border-white/[0.06]">
            <div className="relative mt-2">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              />
              <input
                {...searchInputProps}
                className="w-full text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-all duration-150"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  paddingTop: '10px',
                  paddingBottom: '10px',
                }}
                onFocus={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'
                }}
                onBlur={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                }}
              />
            </div>
          </div>
        )}
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeMobile}
          />
          <div
            className="absolute top-0 right-0 h-full w-[min(100%,280px)] shadow-2xl flex flex-col border-l border-white/[0.08]"
            style={{ background: 'rgba(9,9,11,0.98)' }}
          >
            <div
              className="flex items-center justify-between px-4 h-16 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <span className="text-sm font-medium text-zinc-200">Menu</span>
              <button
                type="button"
                aria-label="Close"
                onClick={closeMobile}
                className={cn(
                  'p-2 rounded-md text-muted hover:text-zinc-200 transition-colors',
                  'border border-white/[0.08] bg-white/[0.05] hover:bg-white/[0.08]',
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex flex-col p-3 gap-1">
              <Link
                href="/"
                onClick={closeMobile}
                className="px-4 py-3 text-sm text-zinc-200 rounded-lg hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08] transition-colors"
              >
                Markets
              </Link>
              {user && (
                <Link
                  href="/portfolio"
                  onClick={closeMobile}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-200 rounded-lg hover:bg-white/[0.05] border border-transparent hover:border-white/[0.08] transition-colors"
                >
                  <Briefcase className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.45)' }} />
                  Portfolio
                </Link>
              )}
              {!user && !loading && (
                <button
                  type="button"
                  onClick={() => {
                    closeMobile()
                    setShowAuth(true)
                  }}
                  className="mt-2 mx-1 px-4 py-3 text-sm text-left rounded-lg border border-white/[0.12] bg-white/[0.05] text-zinc-200 hover:bg-white/[0.08]"
                >
                  Log in / Sign up
                </button>
              )}
            </nav>
          </div>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
