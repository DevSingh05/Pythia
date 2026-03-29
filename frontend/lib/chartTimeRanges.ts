/**
 * Shared time windows for probability / option charts (no sub-daily presets).
 * Intervals shown depend on how much history exists so the UI stays meaningful.
 */

export type ChartIntervalId = '1d' | '7d' | '30d' | 'all'

export const CHART_INTERVAL_ORDER: ChartIntervalId[] = ['1d', '7d', '30d', 'all']

export const CHART_INTERVAL_LABEL: Record<ChartIntervalId, string> = {
  '1d': '1D',
  '7d': '1W',
  '30d': '1M',
  all: 'ALL',
}

const MS_DAY = 86_400_000

export const CHART_INTERVAL_MS: Record<Exclude<ChartIntervalId, 'all'>, number> = {
  '1d': MS_DAY,
  '7d': 7 * MS_DAY,
  '30d': 30 * MS_DAY,
}

export function chartIntervalCutoff(id: ChartIntervalId, now = Date.now()): number | null {
  if (id === 'all') return null
  return now - CHART_INTERVAL_MS[id]
}

export function filterByChartInterval<T extends { t: number }>(
  pts: T[],
  id: ChartIntervalId,
  now = Date.now(),
): T[] {
  const c = chartIntervalCutoff(id, now)
  if (c == null) return pts
  return pts.filter(p => p.t >= c)
}

/** Only offer a preset if the series spans most of that window (avoids empty zooms). */
export function intervalsAvailableForSpan(oldestT: number, newestT: number): ChartIntervalId[] {
  const span = Math.max(0, newestT - oldestT)
  const out: ChartIntervalId[] = ['all']
  if (span >= MS_DAY * 0.6) out.unshift('1d')
  if (span >= 7 * MS_DAY * 0.5) out.unshift('7d')
  if (span >= 30 * MS_DAY * 0.45) out.unshift('30d')
  return [...new Set(out)].sort(
    (a, b) => CHART_INTERVAL_ORDER.indexOf(a) - CHART_INTERVAL_ORDER.indexOf(b),
  )
}

/**
 * Prefer a window where recent moves are visible: short histories stay on ALL;
 * long histories default to 1M or 1W instead of ALL (flatter full-range plot).
 */
export function defaultChartInterval(spanMs: number): ChartIntervalId {
  if (spanMs < 3 * MS_DAY) return 'all'
  if (spanMs < 21 * MS_DAY) return '7d'
  if (spanMs < 120 * MS_DAY) return '30d'
  return '30d'
}
