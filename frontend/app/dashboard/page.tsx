'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/hooks/useAuth'
import { BarChart2, TrendingUp, TrendingDown, Clock, ArrowRight } from 'lucide-react'

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Redirect unauthenticated visitors back to home
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  // Show nothing while resolving auth or redirecting
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
        {/* Page header */}
        <div>
          <p className="text-xs text-muted uppercase tracking-widest mb-1">My Account</p>
          <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-muted mt-1">{user.email}</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Open Positions', value: '—', icon: BarChart2, color: 'text-accent' },
            { label: 'Unrealized P&L', value: '—', icon: TrendingUp, color: 'text-green' },
            { label: 'Realized P&L', value: '—', icon: TrendingDown, color: 'text-muted' },
            { label: 'Total Orders', value: '0', icon: Clock, color: 'text-muted' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{label}</span>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="text-xl font-mono font-medium text-zinc-200">{value}</div>
            </div>
          ))}
        </div>

        {/* Open positions */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-200">Open Positions</h2>
          </div>
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-muted">No open positions yet.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              Browse markets <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Order history */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-medium text-zinc-200">Order History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Market', 'Type', 'Strike', 'Side', 'Qty', 'Premium', 'Total', 'Status', 'Date'].map(col => (
                    <th key={col} className="text-left text-muted font-medium px-4 py-2.5 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted">
                    No orders placed yet.{' '}
                    <Link href="/" className="text-accent hover:underline">
                      Start trading →
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
