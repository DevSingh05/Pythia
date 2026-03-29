import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtProb(p: number, decimals = 0): string {
  return (p * 100).toFixed(decimals) + '%'
}

export function fmtPremium(p: number): string {
  const abs = Math.abs(p)
  if (abs < 0.00005) return '$0.00'
  // Show enough decimals so the value is never rounded to zero
  if (abs < 0.01) return `$${p.toFixed(4)}`
  if (abs < 1) return `$${p.toFixed(3)}`
  return `$${p.toFixed(2)}`
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
