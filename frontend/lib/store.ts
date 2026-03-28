/**
 * Zustand global state.
 *
 * marketStore:     live market state, position, Greeks
 * simulationStore: replay mode state
 */

import { create } from "zustand";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Position {
  kind:      "call" | "put";
  strike:    number;
  tau_days:  number;
  premium:   number;
  entryProb: number;
}

export interface Greeks {
  price: number;
  delta: number;
  theta: number;
  vega:  number;
  gamma: number;
}

export interface Contract {
  strike:    number;
  tau_days:  number;
  call_price: number;
  put_price:  number;
  delta:      number;
  theta:      number;
  vega:       number;
  gamma:      number;
  put_delta:  number;
}

export interface BoundaryPoint {
  tau_days: number;
  p_star:   number;
}

export interface PayoffCurve {
  probs:   number[];
  payoffs: number[];
}

export interface SimTick {
  tick:         number;
  ts_actual:    string;
  prob:         number;
  option_value: number;
  pnl:          number;
  pnl_pct:      number;
  delta:        number | null;
  theta:        number | null;
  vega:         number | null;
  event_label:  string | null;
}

// ── Market store ───────────────────────────────────────────────────────────────

interface MarketState {
  conditionId: string;
  question:    string;
  currentProb: number;
  vol:         number;
  volSource:   string;
  mode:        "simple" | "pro";
  position:    Position | null;
  greeks:      Greeks | null;
  exerciseBoundary: BoundaryPoint[];
  payoffCurve: PayoffCurve | null;
  chain:       Contract[];
  isStale:     boolean;  // prob data stale (>5s old)
  isResolved:  boolean;

  // Actions
  setConditionId: (id: string) => void;
  setQuestion:    (q: string)  => void;
  setCurrentProb: (p: number)  => void;
  setVol:         (sigma: number, source: string) => void;
  setMode:        (mode: "simple" | "pro") => void;
  setPosition:    (pos: Position | null)   => void;
  setGreeks:      (g: Greeks | null)       => void;
  setExerciseBoundary: (b: BoundaryPoint[]) => void;
  setPayoffCurve: (c: PayoffCurve | null)  => void;
  setChain:       (c: Contract[])          => void;
  setStale:       (s: boolean)             => void;
  setResolved:    (r: boolean)             => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  conditionId:      "",
  question:         "",
  currentProb:      0.5,
  vol:              0.3,
  volSource:        "estimated",
  mode:             "simple",
  position:         null,
  greeks:           null,
  exerciseBoundary: [],
  payoffCurve:      null,
  chain:            [],
  isStale:          false,
  isResolved:       false,

  setConditionId:       (id)     => set({ conditionId: id }),
  setQuestion:          (q)      => set({ question: q }),
  setCurrentProb:       (p)      => set({ currentProb: p, isStale: false }),
  setVol:               (s, src) => set({ vol: s, volSource: src }),
  setMode:              (mode)   => set({ mode }),
  setPosition:          (pos)    => set({ position: pos }),
  setGreeks:            (g)      => set({ greeks: g }),
  setExerciseBoundary:  (b)      => set({ exerciseBoundary: b }),
  setPayoffCurve:       (c)      => set({ payoffCurve: c }),
  setChain:             (c)      => set({ chain: c }),
  setStale:             (s)      => set({ isStale: s }),
  setResolved:          (r)      => set({ isResolved: r }),
}));

// ── Simulation store ───────────────────────────────────────────────────────────

interface SimulationState {
  simId:       string;
  playing:     boolean;
  speed:       number;   // days per second
  currentTick: number;
  series:      SimTick[];

  setSimId:       (id: string)    => void;
  setSeries:      (s: SimTick[])  => void;
  setPlaying:     (p: boolean)    => void;
  setSpeed:       (s: number)     => void;
  setCurrentTick: (t: number)     => void;
  advance:        ()              => void;
  reset:          ()              => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  simId:       "",
  playing:     false,
  speed:       1,
  currentTick: 0,
  series:      [],

  setSimId:   (id) => set({ simId: id }),
  setSeries:  (s)  => set({ series: s, currentTick: 0 }),
  setPlaying: (p)  => set({ playing: p }),
  setSpeed:   (s)  => set({ speed: s }),
  setCurrentTick: (t) => set({ currentTick: t }),

  advance: () => {
    const { currentTick, series, playing } = get();
    if (!playing) return;
    if (currentTick < series.length - 1) {
      set({ currentTick: currentTick + 1 });
    } else {
      set({ playing: false });
    }
  },

  reset: () => set({ currentTick: 0, playing: false }),
}));
