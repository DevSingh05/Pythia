'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/hooks/useAuth'
import { cn, fmtPremium, fmtProb } from '@/lib/utils'
import { BarChart2, TrendingUp, Clock, ArrowRight, FlaskConical, RefreshCw } from 'lucide-react'

interface Order {
  id: string
  market_id: string
  strike: number
  type: 'call' | 'put'
  expiry: string
  side: 'buy' | 'sell'
  quantity: number
  premium: number | null
  status: string
  created_at: string
}

export default function DashboardPage() {
  const { user, loading, getToken } = useAuth()
  const router = useRouter()

  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  // Stable ref so the effect doesn't re-trigger when getToken identity changes
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const token = await getTokenRef.current()
      if (!token) {
        setOrdersError('Not signed in')
        return
      }
      const res = await fetch('/api/orders', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? String(res.status))
      }
      const data: Order[] = await res.json()
      setOrders(Array.isArray(data) ? data : [])
    } catch (e) {
      setOrdersError((e as Error).message)
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  // Redirect unauthenticated visitors back to home
  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [user, loading, router])

  // Load orders exactly once when user is confirmed
  const didFetch = useRef(false)
  useEffect(() => {
    if (user && !didFetch.current) {
      didFetch.current = true
      fetchOrders()
    }
  }, [user, fetchOrders])

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  // ── derived stats ──────────────────────────────────────────────────────────
  const totalOrders = orders.length
  const totalSpent = orders
    .filter(o => o.side === 'buy' && o.premium != null)
    .reduce((s, o) => s + (o.premium ?? 0) * o.quantity, 0)
  const openPositions = new Set(orders.map(o => `${o.market_id}-${o.type}-${o.strike}`)).size

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-8">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted uppercase tracking-widest mb-1">My Account</p>
            <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
            <p className="text-sm text-muted mt-1">{user.email}</p>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5">
            <FlaskConical className="w-3.5 h-3.5 shrink-0" />
            Paper Trading Mode
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Orders', value: String(totalOrders), icon: Clock, color: 'text-muted' },
            { label: 'Unique Positions', value: String(openPositions), icon: BarChart2, color: 'text-accent' },
            {
              label: 'Total Spent',
              value: totalSpent > 0 ? `$${totalSpent.toFixed(2)}` : '—',
              icon: TrendingUp,
              color: 'text-green',
            },
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

        {/* Order history */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-200">Order History</h2>
            <button
              onClick={() => fetchOrders()}
              disabled={ordersLoading}
              className="text-muted hover:text-zinc-200 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', ordersLoading && 'animate-spin')} />
            </button>
          </div>

          {ordersError && (
            <div className="px-5 py-3 text-xs text-red bg-red-muted border-b border-red/20">
              Failed to load orders: {ordersError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Type', 'Strike', 'Side', 'Qty', 'Premium', 'Total', 'Expiry', 'Status', 'Date'].map(col => (
                    <th key={col} className="text-left text-muted font-medium px-4 py-2.5 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {ordersLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {!ordersLoading && orders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted">
                      No orders placed yet.{' '}
                      <Link href="/" className="text-accent hover:underline">
                        Start trading →
                      </Link>
                    </td>
                  </tr>
                )}
                {!ordersLoading &&
                  orders.map(order => {
                    const premium = order.premium ?? 0
                    const total = premium * order.quantity
                    return (
                      <tr key={order.id} className="hover:bg-surface/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              'font-mono px-1.5 py-0.5 rounded text-[11px]',
                              order.type === 'call'
                                ? 'text-green bg-green-muted'
                                : 'text-red bg-red-muted'
                            )}
                          >
                            {order.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-zinc-300">
                          {fmtProb(order.strike)}
                        </td>
                        <td className={cn(
                          'px-4 py-2.5 capitalize font-medium',
                          order.side === 'buy' ? 'text-green' : 'text-red'
                        )}>
                          {order.side}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-zinc-300">
                          {order.quantity}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-zinc-300">
                          {premium > 0 ? fmtPremium(premium) : '—'}
                        </td>
                        <td className={cn(
                          'px-4 py-2.5 font-mono tabular-nums font-medium',
                          order.side === 'buy' ? 'text-red' : 'text-green'
                        )}>
                          {total > 0 ? `${order.side === 'buy' ? '−' : '+'}${fmtPremium(total)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted">{order.expiry}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-green bg-green-muted px-1.5 py-0.5 rounded text-[11px]">
                            {order.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted whitespace-nowrap">
                          {new Date(order.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
