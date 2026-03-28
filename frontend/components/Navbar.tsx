'use client'

import Link from 'next/link'

import { Search, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavbarProps {
  searchQuery?: string
  onSearch?: (q: string) => void
}

export default function Navbar({ searchQuery = '', onSearch }: NavbarProps) {
  return (
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
        <div className="flex-1 max-w-sm relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={e => onSearch?.(e.target.value)}
            className={cn(
              'w-full bg-surface border border-border rounded-md pl-9 pr-3 py-1.5',
              'text-sm placeholder:text-muted text-zinc-200',
              'focus:outline-none focus:border-zinc-600 focus:bg-card',
              'transition-colors duration-150'
            )}
          />
        </div>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-0.5">
          {[
            { href: '/', label: 'Markets' },
            { href: '/portfolio', label: 'Portfolio' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 text-sm text-muted hover:text-zinc-200 rounded-md transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border hover:border-zinc-600 bg-surface hover:bg-card text-sm text-zinc-300 transition-colors">
            <Wallet className="w-3.5 h-3.5 text-muted" />
            <span className="hidden sm:block">Connect wallet</span>
          </button>
        </div>
      </div>
    </header>
  )
}
