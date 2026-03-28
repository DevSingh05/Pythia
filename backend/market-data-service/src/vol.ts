/**
 * Volatility estimation pipeline.
 *
 * Inputs:  historical p(t) series
 * Output:  annualised logit-space volatility σ + source label
 *
 * Full edge case handling per ARCHITECTURE.md §3.2:
 *   - < 2 clean diffs      → cross-market median or floor
 *   - < 10 clean diffs     → cross-market median, label "cross_market_fallback"
 *   - std(diffs) == 0      → flat market, label "flat_market"
 *   - outlier resistance   → winsorise at [1st, 99th] percentile
 *   - hard floor           → max(σ_ann, 0.05)
 *   - hard cap             → min(σ_ann, 5.00)
 */

import type { VolSource } from "./types.js";

const SIGMA_FLOOR = 0.05;
const SIGMA_CAP   = 5.00;

function logit(p: number): number {
  const clamped = Math.max(1e-6, Math.min(1 - 1e-6, p));
  return Math.log(clamped / (1 - clamped));
}

function percentile(sorted: number[], pct: number): number {
  const idx = (pct / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function winsorise(diffs: number[], lo_pct: number = 1, hi_pct: number = 99): number[] {
  const sorted = [...diffs].sort((a, b) => a - b);
  const lo = percentile(sorted, lo_pct);
  const hi = percentile(sorted, hi_pct);
  return diffs.map((d) => Math.max(lo, Math.min(hi, d)));
}

export interface VolResult {
  sigma:  number;
  source: VolSource;
}

/**
 * Estimate annualised logit-space volatility from daily p(t) series.
 *
 * @param probs     array of daily probabilities, chronological order
 * @param fallback  cross-market median sigma (used when data insufficient)
 */
export function estimateVol(probs: number[], fallback: number = 0.30): VolResult {
  if (probs.length < 2) {
    return { sigma: Math.max(fallback, SIGMA_FLOOR), source: "insufficient_data" };
  }

  // Clamp all values, compute logit differences
  const clamped = probs.map((p) => Math.max(1e-6, Math.min(1 - 1e-6, p)));
  const logits  = clamped.map(logit);
  const rawDiffs: number[] = [];

  for (let i = 0; i < logits.length - 1; i++) {
    const d = logits[i + 1] - logits[i];
    if (isFinite(d)) rawDiffs.push(d);
  }

  if (rawDiffs.length < 2) {
    const sigma = Math.max(fallback, SIGMA_FLOOR);
    return { sigma: Math.min(sigma, SIGMA_CAP), source: "insufficient_data" };
  }

  if (rawDiffs.length < 10) {
    const sigma = Math.max(fallback, SIGMA_FLOOR);
    return { sigma: Math.min(sigma, SIGMA_CAP), source: "cross_market_fallback" };
  }

  const std_raw = stddev(rawDiffs);
  if (std_raw === 0) {
    return { sigma: SIGMA_FLOOR, source: "flat_market" };
  }

  // Winsorise then recompute
  const winsorised = winsorise(rawDiffs);
  const sigma_daily = stddev(winsorised);
  let sigma_ann     = sigma_daily * Math.sqrt(252);

  let source: VolSource = "estimated";

  if (sigma_ann <= SIGMA_FLOOR) {
    sigma_ann = SIGMA_FLOOR;
    source    = "vol_floored";
  } else if (sigma_ann >= SIGMA_CAP) {
    sigma_ann = SIGMA_CAP;
    source    = "vol_capped";
  }

  return { sigma: sigma_ann, source };
}

/**
 * Compute cross-market median sigma from a collection of market vol estimates.
 * Used as the fallback when individual market data is insufficient.
 */
export function crossMarketMedian(sigmas: number[]): number {
  if (sigmas.length === 0) return 0.30;
  const sorted = [...sigmas].filter((s) => isFinite(s) && s > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0.30;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
