'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, LogOut, Briefcase } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import AuthModal from './AuthModal'

interface NavbarProps {
  searchQuery?: string
  onSearch?: (q: string) => void
}

export default function Navbar({ searchQuery = '', onSearch }: NavbarProps) {
  const { user, loading, signOut } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()

  // Auto-open auth modal when redirected from a protected route
  useEffect(() => {
    if (searchParams.get('auth') === 'required' && !loading && !user) {
      setShowAuth(true)
      const url = new URL(window.location.href)
      url.searchParams.delete('auth')
      router.replace(url.pathname + (url.search || ''), { scroll: false })
    }
  }, [searchParams, loading, user, router])

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
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">

          {/* Logo — Orbitron wordmark, matches the hero */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
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

          {/* Search */}
          {onSearch !== undefined && (
            <div className="flex-1 max-w-sm relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              />
              <input
                type="text"
                placeholder="Search markets..."
                value={searchQuery}
                onChange={e => onSearch(e.target.value)}
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
          {onSearch === undefined && <div className="flex-1" />}

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1">
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

          {/* Auth controls */}
          <div className="ml-auto flex items-center gap-3">

            {!loading && !user && (
              <button
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
                Log in / Sign up
              </button>
            )}

            {!loading && user && (
              <div className="flex items-center gap-3">
                <span className="hidden sm:block text-xs truncate max-w-[160px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {user.email}
                </span>
                <button
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
                  <span className="hidden sm:block">Sign out</span>
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
      </header>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
