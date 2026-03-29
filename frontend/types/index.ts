export type MarketCategory = 'crypto' | 'economics' | 'sports' | 'science' | 'geo'

export interface ProbPoint {
  t: number // unix ms
  p: number // 0-1
}

export interface Market {
  id: string
  title: string
  shortTitle: string
  category: MarketCategory
  currentProb: number
  change24h: number     // pp change
  volume24h: number     // in USDC
  openInterest: number
  volatility: number    // annualized logit-space vol
  daysToResolution: number
  resolutionDate: string
  probHistory: ProbPoint[]
  description: string
  tags: string[]
}

export type OptionType = 'call' | 'put'
export type TradeSide = 'buy' | 'sell'
export type ViewMode = 'simple' | 'pro'

export interface OptionContract {
  strike: number        // 0-1 probability
  type: OptionType
  expiry: string
  daysToExpiry: number
  premium: number       // USDC per contract (e.g. 0.08 = $0.08)
  premiumChange: number
  premiumChangePct: number
  delta: number
  gamma: number
  theta: number         // per day
  vega: number
  breakeven: number     // 0-1 probability
  breakevenDelta: number // pp from current
  isITM: boolean
  openInterest: number
}

export interface OptionsChainData {
  calls: OptionContract[]
  puts: OptionContract[]
  expiries: string[]
  strikes: number[]
}
