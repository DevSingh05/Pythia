'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, LogOut, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import AuthModal from './AuthModal'
import { StarButton } from './ui/star-button'

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
      // Clean the query param from the URL without a full navigation
      const url = new URL(window.location.href)
      url.searchParams.delete('auth')
      router.replace(url.pathname + (url.search || ''), { scroll: false })
    }
  }, [searchParams, loading, user, router])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-13 flex items-center gap-5">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="font-semibold text-sm text-zinc-100 tracking-tight">Pythia</span>
            <span className="text-[10px] text-muted font-medium px-1.5 py-0.5 rounded bg-surface border border-border">
              BETA
            </span>
          </Link>

          {/* Search */}
          {onSearch !== undefined && (
            <div className="flex-1 max-w-sm relative">
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
                  'transition-colors duration-150'
                )}
              />
            </div>
          )}
          {onSearch === undefined && <div className="flex-1" />}

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-0.5">
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

          {/* Auth controls */}
          <div className="ml-auto flex items-center gap-2">
            {!loading && !user && (
              <StarButton size="sm" onClick={() => setShowAuth(true)}>
                Log in / Sign up
              </StarButton>
            )}

            {!loading && user && (
              <div className="flex items-center gap-2">
                <span className="hidden sm:block text-xs text-muted max-w-[160px] truncate">
                  {user.email}
                </span>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-sm text-zinc-300',
                    'bg-surface hover:bg-card hover:border-zinc-600 transition-colors'
                  )}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:block">Sign out</span>
                </button>
              </div>
            )}

            {/* Skeleton to prevent layout shift while loading */}
            {loading && (
              <div className="h-8 w-28 rounded-md bg-surface border border-border animate-pulse" />
            )}
          </div>
        </div>
      </header>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
