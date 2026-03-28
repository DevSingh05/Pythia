export interface Market {
  condition_id: string;
  question: string;
  category: string | null;
  resolution_ts: string | null;
  resolved: boolean;
  resolution_value: number | null;
  current_prob: number | null;
  current_vol: number | null;
  vol_source: string | null;
  updated_at: string;
}

export interface ProbSnapshot {
  condition_id: string;
  prob: number;
  ts: string;
  stale: boolean;
}

export interface VolEstimate {
  condition_id: string;
  sigma: number;
  source: VolSource;
  computed_at: string;
}

export type VolSource =
  | "estimated"
  | "flat_market"
  | "cross_market_fallback"
  | "insufficient_data"
  | "vol_floored"
  | "vol_capped";

export interface OrderBook {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
}

export interface ResolutionEvent {
  condition_id: string;
  value: 0 | 1;
  ts: string;
}
