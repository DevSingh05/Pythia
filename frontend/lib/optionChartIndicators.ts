/**
 * Indicators for option premium (or any numeric) time series.
 * Add new functions here and register in `optionIndicatorRegistry` for UI + CodeSandbox `kit`.
 */

export type NullableNum = number | null

/** Simple moving average; first period-1 entries are null. */
export function sma(values: number[], period: number): NullableNum[] {
  if (period < 1) throw new RangeError('sma period >= 1')
  const out: NullableNum[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null)
      continue
    }
    let s = 0
    for (let j = 0; j < period; j++) s += values[i - j]
    out.push(s / period)
  }
  return out
}

/** Exponential moving average; seeds with SMA when first full window fills. */
export function ema(values: number[], period: number): NullableNum[] {
  if (period < 1) throw new RangeError('ema period >= 1')
  const k = 2 / (period + 1)
  const out: NullableNum[] = []
  let emaVal: number | null = null

  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (!Number.isFinite(v)) {
      out.push(null)
      continue
    }
    if (i < period - 1) {
      out.push(null)
      continue
    }
    if (emaVal == null) {
      let s = 0
      for (let j = 0; j < period; j++) s += values[i - j]
      emaVal = s / period
      out.push(emaVal)
      continue
    }
    emaVal = v * k + emaVal * (1 - k)
    out.push(emaVal)
  }
  return out
}

/** Wilder's RSI (14 default) on closes; leading values null until warmup. */
export function rsi(values: number[], period = 14): NullableNum[] {
  if (period < 2) throw new RangeError('rsi period >= 2')
  const out: NullableNum[] = Array(values.length).fill(null)
  if (values.length < period + 1) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1]
    if (ch >= 0) gain += ch
    else loss -= ch
  }
  let avgGain = gain / period
  let avgLoss = loss / period

  const rs = () => (avgLoss === 0 ? 100 : avgGain / avgLoss)
  const rsiAt = () => 100 - 100 / (1 + rs())

  out[period] = rsiAt()

  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1]
    const g = ch > 0 ? ch : 0
    const l = ch < 0 ? -ch : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = rsiAt()
  }
  return out
}

export type IndicatorId = 'sma' | 'ema' | 'rsi'

export interface IndicatorSpec {
  id: IndicatorId
  label: string
  defaultPeriod: number
  /** Whether values are on 0–100 scale (second Y axis). */
  scalePercent?: boolean
}

export const optionIndicatorRegistry: IndicatorSpec[] = [
  { id: 'sma', label: 'SMA', defaultPeriod: 12 },
  { id: 'ema', label: 'EMA', defaultPeriod: 12 },
  { id: 'rsi', label: 'RSI', defaultPeriod: 14, scalePercent: true },
]

export function computeIndicator(
  id: IndicatorId,
  premiums: number[],
  period: number,
): NullableNum[] {
  switch (id) {
    case 'sma':
      return sma(premiums, period)
    case 'ema':
      return ema(premiums, period)
    case 'rsi':
      return rsi(premiums, period)
    default:
      return premiums.map(() => null)
  }
}

/** Passed into CodeSandbox as `kit` — keep in sync with exports above. */
export const optionIndicatorKit = {
  sma,
  ema,
  rsi,
  computeIndicator,
  registry: optionIndicatorRegistry,
}

export type OptionIndicatorKit = typeof optionIndicatorKit
