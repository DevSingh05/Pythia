import type { PricePoint } from '@/lib/api'

/**
 * Downsample while keeping **more samples near the end** of the series so recent
 * spikes (common with Polymarket hourly data) are not washed out by uniform
 * bucketing over a long flat period.
 */
export function downsampleProbTimeBiased(pts: PricePoint[], maxPoints: number): PricePoint[] {
  if (pts.length <= maxPoints) return pts
  const sorted = [...pts].sort((a, b) => a.t - b.t)
  if (sorted.length <= maxPoints) return sorted

  const picked = new Set<number>()
  picked.add(0)
  picked.add(sorted.length - 1)

  const inner = maxPoints - 2
  const t0 = sorted[0].t
  const t1 = sorted[sorted.length - 1].t
  const span = t1 - t0 || 1

  for (let k = 1; k <= inner; k++) {
    const u = k / (inner + 1)
    // exponent < 1 biases target time toward the right (recent)
    const biased = Math.pow(u, 0.42)
    const targetT = t0 + biased * span
    let lo = 0
    let hi = sorted.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid].t < targetT) lo = mid + 1
      else hi = mid
    }
    const i = Math.min(sorted.length - 1, Math.max(0, lo))
    picked.add(i)
  }

  return [...picked]
    .sort((a, b) => a - b)
    .map(i => sorted[i])
}
