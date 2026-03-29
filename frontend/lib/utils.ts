import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtProb(p: number, decimals = 0): string {
  return (p * 100).toFixed(decimals) + '%'
}

export function fmtPremium(p: number): string {
  if (!Number.isFinite(p) || p < 0) return '$0.000'
  // Sub-$0.01: extra decimals so deep OTM does not look "free" ($0.000)
  if (p < 0.01) {
    if (p > 0 && p < 0.0001) return '<$0.0001'
    const decimals = p < 0.001 ? 5 : 4
    return `$${p.toFixed(decimals)}`
  }
  return `$${p.toFixed(3)}`
}

export function fmtUSDC(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export function fmtPP(pp: number, showSign = true): string {
  const sign = showSign && pp > 0 ? '+' : ''
  return `${sign}${(pp * 100).toFixed(1)}pp`
}

export function fmtPct(p: number, showSign = true): string {
  const sign = showSign && p > 0 ? '+' : ''
  return `${sign}${(p * 100).toFixed(1)}%`
}

export function fmtGreek(n: number, decimals = 3): string {
  return n.toFixed(decimals)
}
