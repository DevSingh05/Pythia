'use client'

import { useState, useEffect } from 'react'
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

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3 md:gap-5">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className={cn(
              'md:hidden p-2 -ml-2 rounded-md border border-border bg-surface text-zinc-200',
              'hover:bg-card hover:border-zinc-600 transition-colors',
            )}
          >
            <Menu className="w-4 h-4" />
          </button>

          <Link href="/" className="flex items-center gap-2.5 shrink-0" onClick={closeMobile}>
            <span className="font-semibold text-sm text-zinc-100 tracking-tight">Pythia</span>
            <span className="text-[10px] text-muted font-medium px-1.5 py-0.5 rounded bg-surface border border-border">
              BETA
            </span>
          </Link>

          {onSearch !== undefined && (
            <div className="flex-1 min-w-0 max-w-sm relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search markets..."
                value={searchQuery}
                onChange={e => onSearch(e.target.value)}
                className={cn(
                  'w-full bg-surface border border-border rounded-md pl-9 pr-3 py-1.5',
                  'text-sm placeholder:text-muted text-zinc-200',
                  'focus:outline-none focus:border-zinc-600 focus:bg-card',
                  'transition-colors duration-150',
                )}
              />
            </div>
          )}
          {onSearch === undefined && <div className="flex-1 min-w-0 hidden sm:block" />}
          {onSearch !== undefined && (
            <div className="flex-1 min-w-0 sm:hidden" />
          )}

          <nav className="hidden md:flex items-center gap-0.5 shrink-0">
            <Link
              href="/"
              className="px-3 py-1.5 text-sm text-muted hover:text-zinc-200 rounded-md transition-colors"
            >
              Markets
            </Link>
            {user && (
              <Link
                href="/portfolio"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-zinc-200 rounded-md transition-colors"
              >
                <Briefcase className="w-3.5 h-3.5" />
                Portfolio
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {!loading && !user && (
              <button
                type="button"
                onClick={() => setShowAuth(true)}
                className={cn(
                  'px-2.5 sm:px-3 py-1.5 rounded-md border border-border text-sm text-zinc-300',
                  'bg-surface hover:bg-card hover:border-zinc-600 transition-colors',
                )}
              >
                <span className="hidden sm:inline">Log in / Sign up</span>
                <span className="sm:hidden">Log in</span>
              </button>
            )}

            {!loading && user && (
              <div className="flex items-center gap-2">
                <span className="hidden sm:block text-xs text-muted max-w-[160px] truncate">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  title="Sign out"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-sm text-zinc-300',
                    'bg-surface hover:bg-card hover:border-zinc-600 transition-colors',
                  )}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </div>
            )}

            {loading && (
              <div className="h-8 w-28 rounded-md bg-surface border border-border animate-pulse" />
            )}
          </div>
        </div>

        {onSearch !== undefined && (
          <div className="sm:hidden px-4 pb-3 border-t border-border/60 bg-bg/95">
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search markets..."
                value={searchQuery}
                onChange={e => onSearch(e.target.value)}
                className={cn(
                  'w-full bg-surface border border-border rounded-md pl-9 pr-3 py-2',
                  'text-sm placeholder:text-muted text-zinc-200',
                  'focus:outline-none focus:border-zinc-600 focus:bg-card',
                )}
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
            className="absolute top-0 right-0 h-full w-[min(100%,280px)] shadow-2xl bg-card border-l border-border flex flex-col"
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-border">
              <span className="text-sm font-medium text-zinc-200">Menu</span>
              <button
                type="button"
                aria-label="Close"
                onClick={closeMobile}
                className="p-2 rounded-md border border-border text-muted hover:text-zinc-200 hover:bg-surface"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex flex-col p-3 gap-1">
              <Link
                href="/"
                onClick={closeMobile}
                className="px-4 py-3 text-sm text-zinc-200 rounded-lg hover:bg-surface border border-transparent hover:border-border transition-colors"
              >
                Markets
              </Link>
              {user && (
                <Link
                  href="/portfolio"
                  onClick={closeMobile}
                  className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-200 rounded-lg hover:bg-surface border border-transparent hover:border-border transition-colors"
                >
                  <Briefcase className="w-4 h-4 text-muted" />
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
                  className="mt-2 mx-1 px-4 py-3 text-sm text-left rounded-lg border border-border bg-surface text-zinc-200 hover:bg-card"
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
