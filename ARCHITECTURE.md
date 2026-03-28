# ProbX — Architecture Plan & Stress Test
> Options on Prediction Market Probabilities · Polymarket Hackathon · Track: Risk & Visualization

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Infrastructure Layers](#2-infrastructure-layers)
3. [Data Pipeline](#3-data-pipeline)
4. [Pricing Engine](#4-pricing-engine)
5. [Options Contract Design](#5-options-contract-design)
6. [API Layer](#6-api-layer)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Options Chain Visualization](#8-options-chain-visualization)
9. [Demo Simulation Mode](#9-demo-simulation-mode)
10. [Architecture Decision Records (ADRs)](#10-architecture-decision-records)
11. [Stress Test & Failure Analysis](#11-stress-test--failure-analysis)
12. [Scaling Thresholds](#12-scaling-thresholds)
13. [Hackathon MVP vs V2 Delta](#13-hackathon-mvp-vs-v2-delta)

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                          │
│   Simple View ◄──────────────────────────► Pro View             │
│   (gauge, CALL/PUT, slider)                (chain, Greeks, vol)  │
│                        ▲                                         │
│                  Simulation Mode                                  │
│                  (historical replay)                              │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS / SSE
┌────────────────────────────▼─────────────────────────────────────┐
│                       Next.js App (Vercel Edge)                  │
│   Route Handlers  ·  Server Components  ·  SSE relay             │
└──────┬────────────────────────────────────┬───────────────────────┘
       │ REST                               │ REST / SSE
┌──────▼──────────────┐          ┌──────────▼────────────────────┐
│   Pricing Service   │          │    Market Data Service         │
│   (Python / FastAPI)│          │    (Node / Bun)               │
│                     │          │                               │
│  · American binomial│          │  · Polymarket CLOB API        │
│  · Logit-Normal tree│          │  · Polymarket Gamma API       │
│  · Greeks (bump)    │          │  · Vol estimation pipeline    │
│  · Exercise boundary│          │  · Historical time-series     │
│  · Payoff curves    │          │  · Simulation data store      │
└──────┬──────────────┘          └──────────┬────────────────────┘
       │                                    │
┌──────▼────────────────────────────────────▼────────────────────┐
│                         Redis (Upstash)                         │
│   · Computed chain cache (TTL 5s)                              │
│   · Latest probability snapshots                               │
│   · Vol estimates (TTL 1h)                                     │
│   · Early exercise boundary cache (TTL 30s)                    │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                      Postgres (Neon)                            │
│   · Historical p(t) time-series per market                     │
│   · Pre-computed simulation P&L series (static JSON)           │
│   · Vol snapshots                                              │
│   · Markets metadata                                           │
└────────────────────────────────────────────────────────────────┘
```

**Core invariants:**
- Browser never calls Polymarket APIs directly
- Pricing Service is stateless — pure math, no DB access
- Simulation replay runs from pre-computed static data — zero network risk during demo
- Market resolution (0% or 100%) triggers immediate auto-settlement of all open contracts on that market

---

## 2. Infrastructure Layers

### 2.1 Hosting

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vercel (Next.js 14 App Router) | Edge SSR, instant deploys, SSE support |
| Pricing Service | Fly.io (Python/FastAPI) | Scipy/numpy required; can't run in Vercel serverless |
| Market Data Service | Bun on Fly.io | Lightweight, I/O bound |
| Cache | Upstash Redis | Per-request billing, zero cold start, HTTP-compatible |
| Database | Neon (serverless Postgres) | Branching for dev/prod, scales to zero |

### 2.2 Communication Protocols

| Path | Protocol | Why |
|---|---|---|
| Browser → Next.js | HTTPS + SSE | SSE for live prob/chain streaming |
| Next.js → Pricing Service | REST (HTTP/2) | Request/response, cached at Next.js layer |
| Next.js → Market Data | REST + SSE | SSE for live market prob push |
| Market Data → Polymarket | REST (polling 1s) | Polymarket CLOB REST |
| Pricing → Redis | HTTP (Upstash REST) | Serverless-compatible |

### 2.3 Environment Topology

```
dev     → Docker Compose (all services + local Redis + local Postgres)
staging → Fly.io (pricing) + Vercel preview + Neon dev branch
prod    → Fly.io (pricing, 2 replicas) + Vercel prod + Neon prod + Upstash prod
```

---

## 3. Data Pipeline

### 3.1 Probability Ingestion

```
Polymarket CLOB API
  └── GET /markets/{condition_id}/orderbook  (polling, 1s interval)
        │
        ▼
  Market Data Service
  ├── Extract mid-price from best bid/ask → p(t)
  ├── Clamp to [0.001, 0.999] immediately on ingestion
  ├── Append to in-memory circular buffer (last 500 ticks)
  ├── Write to Postgres prob_series table (async, batched every 5s)
  ├── Publish to Redis key: prob:{condition_id} (TTL 5s)
  └── Check: if p == 0 or p == 1 → market resolved → trigger auto-settlement
```

### 3.2 Volatility Estimation (Full Edge Case Pipeline)

```
On startup + every 1 hour per market:
  ├── Pull last 30d of daily p(t) from Postgres
  ├── Clamp all values to [0.001, 0.999]
  ├── Compute logit differences: Δl_t = logit(p_{t+1}) - logit(p_t)
  ├── Filter out any inf / nan from diffs
  ├── Check count of clean diffs:
  │     < 2  → use cross-market median σ or floor (0.05)
  │     < 10 → use cross-market median σ, label "cross_market_fallback"
  ├── Check std(diffs) == 0 → flat market → use floor, label "flat_market"
  ├── Winsorize diffs at [1st, 99th] percentile (outlier resistance)
  ├── σ_daily = std(winsorized_diffs, ddof=1)
  ├── σ_ann = σ_daily × √252
  ├── Clamp: σ_ann = max(σ_ann, 0.05)   ← floor: 5% minimum
  │          σ_ann = min(σ_ann, 5.00)   ← cap: 500% maximum
  └── Store in Redis: vol:{condition_id} with source_label (TTL 1h)

Vol source labels (propagated to UI):
  "estimated"             → no badge (normal)
  "flat_market"           → "Vol estimated — market flat"
  "cross_market_fallback" → "Vol from similar markets"
  "insufficient_data"     → "Vol estimated — limited history"
  "vol_floored"           → "Vol at minimum"
  "vol_capped"            → "Vol at maximum"
```

### 3.3 Database Schema

```sql
-- Raw probability time-series
CREATE TABLE prob_series (
  condition_id  TEXT NOT NULL,
  ts            TIMESTAMPTZ NOT NULL,
  prob          DOUBLE PRECISION NOT NULL CHECK (prob > 0 AND prob < 1),
  PRIMARY KEY (condition_id, ts)
);
CREATE INDEX idx_prob_series_cond_ts ON prob_series (condition_id, ts DESC);

-- Markets metadata
CREATE TABLE markets (
  condition_id  TEXT PRIMARY KEY,
  question      TEXT NOT NULL,
  category      TEXT,
  resolution_ts TIMESTAMPTZ,
  resolved      BOOLEAN DEFAULT FALSE,
  resolution_value DOUBLE PRECISION,   -- 0 or 1 when resolved
  current_prob  DOUBLE PRECISION,
  current_vol   DOUBLE PRECISION,
  vol_source    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-computed simulation series (one row per tick of replay)
CREATE TABLE simulation_series (
  sim_id        TEXT NOT NULL,           -- e.g. "eth4k_march_call"
  tick          INTEGER NOT NULL,        -- 0..N (one per day)
  ts_actual     TIMESTAMPTZ NOT NULL,    -- real historical date
  prob          DOUBLE PRECISION NOT NULL,
  option_value  DOUBLE PRECISION NOT NULL,
  pnl           DOUBLE PRECISION NOT NULL,
  pnl_pct       DOUBLE PRECISION NOT NULL,
  delta         DOUBLE PRECISION,
  theta         DOUBLE PRECISION,
  vega          DOUBLE PRECISION,
  event_label   TEXT,                    -- "Fed decision", "Debate #1", etc.
  PRIMARY KEY (sim_id, tick)
);

-- Vol snapshots for chain
CREATE TABLE vol_snapshots (
  condition_id  TEXT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  strike        DOUBLE PRECISION NOT NULL,
  tau_days      INTEGER NOT NULL,
  call_price    DOUBLE PRECISION,
  put_price     DOUBLE PRECISION,
  delta         DOUBLE PRECISION,
  theta         DOUBLE PRECISION,
  vega          DOUBLE PRECISION,
  gamma         DOUBLE PRECISION,
  PRIMARY KEY (condition_id, computed_at, strike, tau_days)
);
```

---

## 4. Pricing Engine

### 4.1 Contract Style: American

All ProbX contracts are **American style** — exercise any time before expiry.

**Why not European:**
- Prediction market probabilities can spike violently on news events and then reverse
- A trader holding a winning position should be able to capture the gain immediately
- If the underlying Polymarket market resolves early (p snaps to 0 or 1), American exercise prevents forced holding through a bad outcome
- In the absence of a liquid secondary market, "sell to close" = "exercise at model price" — American is the honest design

**Auto-settlement rule:** If the underlying Polymarket market resolves (p → 0 or 1) before a ProbX option's expiry, all open contracts on that market settle immediately at the resolution value.

### 4.2 Core Math

```python
import numpy as np
from scipy import stats

SIGMA_FLOOR = 0.05
SIGMA_CAP   = 5.0
PROB_CLAMP  = (1e-6, 1 - 1e-6)

def safe_prob(p): return float(np.clip(p, *PROB_CLAMP))
def logit(p):     p = safe_prob(p); return np.log(p / (1 - p))
def sigmoid(l):   return 1.0 / (1 + np.exp(-l))
```

### 4.3 American Binomial Tree (Logit-Normal)

```python
def american_option_binomial(p0, K, sigma, tau, N=100, kind="call"):
    """
    American option on logit-normal underlying.
    Backward induction: at each node take max(hold, exercise).

    p0    — current probability
    K     — strike probability
    sigma — annualized logit volatility
    tau   — time to expiry in years (e.g. 30/252)
    N     — tree steps (100 → ~1.5ms, accurate to 0.08%)
    kind  — "call" or "put"
    """
    dt      = tau / N
    sigma_t = sigma * np.sqrt(dt)

    # Driftless: q = 0.5 exactly (symmetric random walk in logit space)
    q  = 0.5
    L0 = logit(p0)

    # Terminal nodes
    j   = np.arange(N + 1)
    L_T = L0 + (2 * j - N) * sigma_t
    p_T = sigmoid(L_T)

    V = np.maximum(p_T - K, 0) if kind == "call" else np.maximum(K - p_T, 0)

    # Backward induction
    for i in range(N - 1, -1, -1):
        continuation = q * V[1:i+2] + (1 - q) * V[0:i+1]
        j_i  = np.arange(i + 1)
        p_i  = sigmoid(L0 + (2 * j_i - i) * sigma_t)
        exercise = np.maximum(p_i - K, 0) if kind == "call" else np.maximum(K - p_i, 0)
        V = np.maximum(continuation, exercise)

    return float(V[0])
```

### 4.4 Greeks (Bump-and-Reprice)

```python
def greeks(p0, K, sigma, tau, N=100, kind="call"):
    def price(p_, s_, t_):
        if t_ <= 0:
            return max(safe_prob(p_) - K, 0) if kind == "call" else max(K - safe_prob(p_), 0)
        return american_option_binomial(p_, K, s_, t_, N, kind)

    base  = price(p0, sigma, tau)
    dp    = 0.01     # 1% prob bump
    ds    = 0.01     # 1% vol bump
    dt    = 1 / 252  # 1 day

    delta = (price(p0 + dp, sigma, tau) - price(p0 - dp, sigma, tau)) / (2 * dp)
    vega  = (price(p0, sigma + ds, tau) - price(p0, sigma - ds, tau)) / (2 * ds)
    theta = (price(p0, sigma, tau - dt) - base) / dt   # $/day, negative
    gamma = (price(p0 + dp, sigma, tau) - 2 * base + price(p0 - dp, sigma, tau)) / dp**2

    return {"price": base, "delta": delta, "theta": theta, "vega": vega, "gamma": gamma}
```

### 4.5 Early Exercise Boundary

```python
def early_exercise_boundary(K, sigma, tau, kind="call", N=100, steps=50):
    """
    Returns the critical probability p* at each time-to-expiry
    above which (call) or below which (put) immediate exercise is optimal.
    Used to render the exercise boundary curve in the Pro View.
    """
    boundary = []
    for t in np.linspace(1/252, tau, steps):
        lo, hi = (K, 0.999) if kind == "call" else (0.001, K)
        for _ in range(30):  # binary search, ~1e-9 precision
            mid      = (lo + hi) / 2
            opt_val  = american_option_binomial(mid, K, sigma, t, N, kind)
            intrinsic = max(mid - K, 0) if kind == "call" else max(K - mid, 0)
            if opt_val <= intrinsic + 1e-8:
                hi = mid
            else:
                lo = mid
        boundary.append({"tau_days": round(t * 252, 1), "p_star": (lo + hi) / 2})
    return boundary
```

### 4.6 Quadrature Fix (Vanilla Price Reference)

The vanilla call uses adaptive Gauss-Kronrod via `scipy.integrate.quad`. Two critical fixes vs naive integration:

```python
def vanilla_call_price(p0, K, sigma, tau):
    L0  = logit(p0)
    LK  = logit(K)
    std = sigma * np.sqrt(tau)

    # Fix 1: bounds always include the kink at logit(K)
    # naive bounds collapse when sigma*sqrt(tau) is tiny
    lo = min(L0 - 6 * std, LK - 1.0)
    hi = max(L0 + 6 * std, LK + 1.0)

    def integrand(l):
        return max(sigmoid(l) - K, 0) * stats.norm.pdf(l, L0, std)

    # Fix 2: tell the integrator exactly where the kink is
    # without this, adaptive quadrature can miss the discontinuous derivative
    result, _ = integrate.quad(integrand, lo, hi, points=[LK])
    return result
```

### 4.7 Discrete Strike Grid

ProbX does not offer arbitrary strike prices. Available contracts are determined dynamically per market:

```python
STRIKE_GRID  = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90]
EXPIRY_GRID  = [7, 14, 21, 30]   # days to expiry

def available_strikes(p0, sigma, tau_days, n_std=2.5):
    """Return only strikes within n_std logit-space std-devs of current prob."""
    L0      = logit(p0)
    sigma_t = sigma * np.sqrt(tau_days / 252)
    L_lo    = L0 - n_std * sigma_t
    L_hi    = L0 + n_std * sigma_t
    valid   = [K for K in STRIKE_GRID if L_lo <= logit(K) <= L_hi]

    # Always guarantee at least one strike (nearest to current prob)
    if not valid:
        valid = [min(STRIKE_GRID, key=lambda K: abs(K - p0))]
    return valid
```

Strikes outside the σ window have near-zero or near-$1 prices with no tradeable spread — surfacing them would confuse traders. The constraint is a product decision, not a limitation.

### 4.8 FastAPI Service Interface

```
POST /price
  Body:    { p0, strike, tau_days, sigma, kind }
  Returns: { price, delta, theta, vega, gamma }

POST /chain
  Body:    { p0, sigma, strikes, taus }
  Returns: [ { strike, tau_days, call_price, put_price, delta, theta, vega, gamma } ]

POST /boundary
  Body:    { p0, K, sigma, tau_days, kind }
  Returns: [ { tau_days, p_star } ]

POST /payoff_curve
  Body:    { legs: [{kind, strike, premium, size}], steps: 100 }
  Returns: { probs: [...], payoffs: [...] }

GET /health
```

### 4.9 Performance Budget

| Operation | N | Target | Method |
|---|---|---|---|
| Single American price | 100 | ~1.5ms | Binomial tree |
| Full Greeks set | 100 | ~6ms | Bump-and-reprice (12 tree evals) |
| Full chain (6 contracts) | 50 | ~20ms | Vectorized per contract |
| Exercise boundary | 500 | ~30ms | Offline, cached 30s |
| Payoff curve (100 pts, 3 legs) | — | ~10ms | Client-side pure math |

---

## 5. Options Contract Design

### 5.1 Contract Specification

| Property | Value |
|---|---|
| Underlying | YES% probability of any live Polymarket market |
| Style | **American** — exercise any time before expiry |
| Settlement | Cash — `max(p_T - K, 0)` for calls, `max(K - p_T, 0)` for puts |
| Strike universe | Discrete grid: 10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90% |
| Available strikes | Dynamic — only strikes within 2.5σ of current p shown |
| Expiry dates | Fixed: 7d, 14d, 21d, 30d from today |
| Expiry condition | Our expiry date OR underlying market resolution — whichever comes first |
| Auto-settlement | If underlying resolves (p→0 or p→1) before our expiry, all open contracts settle immediately |

### 5.2 Contract Lifecycle

```
Timeline:

  ●────────────────────────────────────────────────◆──────────────●
  |                                                |              |
entry                                         our expiry    market resolves
buy CALL @ K=50%                             p_T = 71%      YES (100%) or NO (0%)
pay $0.28                                    ITM → collect
                                             $0.21

Between entry and our expiry:
  → Exercise any time (American) at current intrinsic value
  → Or hold for time value + potential further movement

If market resolves before our expiry:
  → Auto-settle at p = 1.0 (YES) or p = 0.0 (NO) → clamped
  → CALL at K=50%, market resolves YES: collect $0.50 (= 1.0 - 0.50)
  → CALL at K=50%, market resolves NO:  collect $0.00
```

### 5.3 Why American Protects Traders

```
Scenario A — Peak and reversal:
  Entry: p=42%, buy CALL @ K=50%, pay $0.28
  Day 14: p spikes to 71% → exercise → collect $0.21 → net -$0.07 (better than -$0.28)
  Day 30: p reverts to 33% → European holder collects $0.00 → net -$0.28

Scenario B — Platform data anomaly / early resolution:
  p = 91% → unexpected snap to 0%
  American: exercised at 91% → collected $0.41 profit
  European: forced to wait → $0.00 at expiry → loss

→ American style means traders keep their gains. European would punish them for being right.
```

---

## 6. API Layer

### 6.1 Next.js Route Handlers

```
app/api/
├── markets/
│   ├── route.ts                    # GET — search live markets
│   └── [id]/
│       ├── route.ts                # GET — market detail + current prob
│       ├── prob/route.ts           # GET — SSE stream of live p(t)
│       ├── history/route.ts        # GET — historical series
│       └── chain/route.ts          # GET — full options chain (cached)
├── price/route.ts                  # POST — single contract price + Greeks
├── boundary/route.ts               # POST — early exercise boundary curve
├── payoff/route.ts                 # POST — payoff curve data
└── simulation/
    ├── route.ts                    # GET — list available simulations
    └── [sim_id]/route.ts           # GET — full pre-computed simulation series
```

### 6.2 Caching Strategy

```
Chain request (GET /api/markets/:id/chain):
  1. Redis HIT: chain:{id} (TTL 5s) → return immediately
  2. MISS → fetch current p0 + vol from Redis
          → call Pricing Service /chain
          → compute available strikes dynamically
          → store in Redis (TTL 5s)
          → return

Boundary curve (POST /api/boundary):
  1. Redis HIT: boundary:{id}:{K}:{kind} (TTL 30s) → return
  2. MISS → call Pricing Service /boundary (N=500, ~30ms)
          → store (TTL 30s)
```

### 6.3 Rate Limiting

- Polymarket polling: 1 call/sec per market
- Client → API: 60 req/min per IP (Upstash rate limit middleware)
- Pricing Service: internal only, not publicly exposed

---

## 7. Frontend Architecture

### 7.1 Component Tree

```
app/
├── page.tsx                         # Market search + landing
├── simulation/
│   └── [sim_id]/page.tsx            # Simulation replay mode
└── market/[id]/
    ├── page.tsx                     # Market detail shell
    ├── layout.tsx                   # Sidebar, mode toggle
    └── components/
        ├── ProbGauge.tsx            # Animated SVG arc gauge
        ├── ModeToggle.tsx           # Simple ↔ Pro switch
        ├── LiveProbBadge.tsx        # Live p(t) with staleness indicator
        ├── VolBadge.tsx             # σ value + source label
        ├── simple/
        │   ├── DirectionPicker.tsx  # CALL / PUT buttons
        │   ├── StrikeSlider.tsx     # Draggable prob slider (discrete snapping)
        │   ├── ExpiryPicker.tsx     # 7d / 14d / 21d / 30d tabs
        │   └── PayoffCard.tsx       # "You win $X if YES% hits Y%"
        └── pro/
            ├── OptionsChain.tsx     # Full chain table (see Section 8)
            ├── GreeksPanel.tsx      # Δ Θ ν Γ with bars
            ├── PayoffCurve.tsx      # Recharts hockey-stick
            ├── DistributionCurve.tsx# Logit-normal p_T distribution overlay
            ├── ExerciseBoundary.tsx # p* curve over time-to-expiry
            ├── VolSurface.tsx       # 3D surface (V2)
            └── StrategyBuilder.tsx  # Multi-leg (V2)
```

### 7.2 State Management

```
Zustand store:
  marketStore: {
    conditionId: string
    currentProb: number           ← updated by SSE
    vol: number
    volSource: string             ← propagated to VolBadge
    mode: "simple" | "pro"
    position: {
      kind: "call" | "put"
      strike: number
      tau_days: number
      premium: number
      entryProb: number
    }
    greeks: { price, delta, theta, vega, gamma }
    exerciseBoundary: [{ tau_days, p_star }]
    payoffCurve: { probs[], payoffs[] }
    chain: Contract[]
  }

  simulationStore: {
    simId: string
    playing: boolean
    speed: number                  ← days per second (default 1)
    currentTick: number
    series: SimTick[]              ← pre-loaded from API
    currentTick: SimTick
  }

Server state (React Query):
  - Market metadata            (5min cache)
  - Options chain              (5s stale-while-revalidate)
  - Historical series          (10min cache)
  - Simulation series          (static, no revalidation needed)
```

### 7.3 Key Interactions

```
StrikeSlider drag:
  → snaps to nearest available strike (discrete grid)
  → debounce 50ms
  → POST /api/price → update greeks + payoffCurve

SSE prob update:
  → update currentProb in store
  → recompute position PnL client-side
  → ProbGauge animates
  → check auto-settlement condition (p → 0 or 1)

Simulation play:
  → read next tick from pre-loaded series
  → update simulationStore.currentTick
  → all panels read from simulationStore instead of live store
  → interval: 1000ms / speed
  → on event_label tick: pause + show annotation
```

---

## 8. Options Chain Visualization

### 8.1 Layout Principles

The chain is organized around the **current probability as the center spine** — not a fixed strike ladder. ITM/OTM zones radiate left and right from the current p.

```
┌─────────────────────────────────────────────────────────────────┐
│  ETH hits $4k   ·  p = 42% ↑  ·  σ = 61%  ·  14d to expiry   │
├─────────────────────────────────────────────────────────────────┤
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  0%        20%      40% 42%   50%        70%         90% 100%  │
│                         ▲ CURRENT                              │
│  Expected range at expiry (1σ): ████ 28% ──── 58% ████        │
│  Implied distribution: ╭──╮ centered on L0, mapped to [0,1]   │
├──────────┬──────────────────────┬──────────────────────────────┤
│  PUTS    │      STRIKE          │         CALLS                │
│  Δ  Price│  Prob   ITM/OTM      │  Price   Δ    Θ/day   ν     │
├──────────┼──────────────────────┼──────────────────────────────┤
│-.79 $0.58│ ██ 30%  ITM PUT     │ $0.12   .21  -$0.003  +0.08 │
│-.61 $0.38│ ███ 40%  ATM ───────│ $0.38   .39  -$0.005  +0.11 │
│          │  42% ● CURRENT p    │                              │
│-.39 $0.22│ ░░ 50%  OTM PUT    │ $0.47   .50  -$0.006  +0.12 │← ATM call
│-.21 $0.10│ ░░ 60%  OTM PUT    │ $0.58   .61  -$0.005  +0.11 │
└──────────┴──────────────────────┴──────────────────────────────┘
  [ 7d ]  [ 14d ]  [ 21d ]  [ 30d ]   ← expiry tabs
```

### 8.2 Color Language

```
Green fill (intensity = depth ITM) → ITM calls, positive delta
Red fill (intensity = depth ITM)   → ITM puts, negative delta
Blue highlight                     → ATM row (nearest strike to current p)
Gray text, no fill                 → OTM contracts
Orange badge                       → vol warning (floored, capped, flat)
```

### 8.3 Greeks Display

```
Delta:  [████████░░] 0.61    bar 0→1, fills left-to-right
Theta:  -$0.005/day          always negative, shown in red, in dollars per day
Vega:   [░░░████░░░] +0.11   centered bar, fills outward from zero
Gamma:  shown on hover only  (avoids clutter in chain table)
```

### 8.4 Pro View Extras

**Implied distribution curve** — rendered above the chain. Shows `p_T ~ logit-normal(L0, σ²τ)` mapped back through sigmoid. Wide bell = high vol, narrow = conviction, skewed = boundary effect. Unique to ProbX — no other tool shows this.

**Early exercise boundary** — a separate panel below the chain. Shows `p*` vs time remaining. Zone above the line = exercise now. Zone below = hold for time value. Crucial for American options — tells traders exactly when to pull the trigger.

---

## 9. Demo Simulation Mode

### 9.1 Design Principle

The simulation runs entirely from **pre-computed static data**. No Polymarket API calls, no pricing service calls, no network risk during the live demo. Everything is deterministic and rehearsable.

### 9.2 Pre-Demo Preparation

```
1. Pick demo market:
   ✓ Already resolved (complete history available)
   ✓ p started near 40–60% (interesting chain at entry)
   ✓ Significant probability movement during the period
   ✓ Clear event-driven spikes (annotatable moments)
   ✓ Familiar to judges (election, BTC/ETH price, Fed rate)

2. Pull full historical p(t) from Polymarket Gamma API
   → store in simulation_series table

3. Choose demo contract:
   e.g. CALL @ K=50%, entry on Day 0, expiry = Day 30

4. Pre-compute at every tick:
   position_value = american_option_binomial(p_t, K, sigma_t, tau_remaining)
   pnl            = position_value - premium_paid
   greeks         = greeks(p_t, K, sigma_t, tau_remaining)
   → store all in simulation_series

5. Annotate event dates (news, announcements, vol spikes)
   → stored in event_label column
```

### 9.3 Replay Mechanism

```
Pre-loaded series (example: 30 days, 1 tick/day):

tick  date        prob   option_val  pnl      event
0     Mar 1       0.42   $0.28       $0.00    "Entry: CALL @ K=50%, paid $0.28"
7     Mar 8       0.51   $0.41       +$0.13
14    Mar 15      0.38   $0.19       -$0.09
21    Mar 22      0.61   $0.58       +$0.30   "Fed decision: p 42%→61% (+$0.39)"
28    Mar 29      0.71   $0.68       +$0.40
30    Mar 31      0.71   $0.21       +$0.21   "Expiry: ITM, collect $0.21"

Replay speed: 1 day/second → 30 days in 30 seconds
UI controls: ► play  ❚❚ pause  ◄► scrub  2× speed
```

### 9.4 What Animates During Replay

- ProbGauge sweeps to new probability value
- P&L counter ticks up/down (green/red)
- Options chain updates (prices, Greeks, ITM/OTM zones shift)
- Theta decay visible as expiry approaches (even on flat prob days)
- Event annotations pause playback + show callout: "Fed decision: prob jumps to 61%, Vega play worth +$0.39"

### 9.5 The Demo Narrative

```
"Three months ago, we entered a CALL at 50% strike
 on this market. We paid $0.28.

 [press play]

 The probability drifted — Theta bled daily, we were slightly down.
 Then the news event hit. Probability jumped to 61% in one day.
 Our Delta of 0.39 meant we captured 39 cents of every 1% move.
 Position went from -$0.09 to +$0.30 overnight.

 We could have exercised right there — American style.
 Collected $0.11 intrinsic, $0.30 total value.

 Instead we held. By expiry, probability was at 71%.
 We collected $0.21 intrinsic. Net profit on $0.28 invested.

 No Polymarket trader could make this trade before ProbX.
 They could only bet on the outcome. We traded the movement."
```

---

## 10. Architecture Decision Records (ADRs)

### ADR-001: Logit-Normal over Black-Scholes
**Decision:** Model L = logit(p) as driftless Brownian motion.
**Alternatives:** Black-Scholes on p directly, Beta distribution, Jump diffusion.
**Rationale:** p ∈ [0,1] violates BS lognormal assumption. Logit maps to ℝ, is empirically normal for political markets. Beta model lacks closed-form Greeks. Jump diffusion adds unestimable parameters.
**Trade-off:** Driftless assumption ignores real-world drift. Acceptable for short-tau options.

### ADR-002: American Style via Binomial Tree
**Decision:** American exercise, priced via binomial tree on logit-normal.
**Alternatives:** European closed-form (simpler), American finite-difference PDE (more accurate).
**Rationale:** Prediction market probabilities can spike and reverse violently. European style would punish traders for being right on direction but wrong on timing. Binomial tree is industry-standard for American options, well-understood, ~1.5ms at N=100.
**Trade-off:** No closed-form Greeks — bump-and-reprice adds ~6ms. Cached at 5s TTL, fully acceptable.

### ADR-003: Discrete Strike Grid, Dynamic Availability
**Decision:** Fixed 9-strike grid; only strikes within 2.5σ window shown per market.
**Alternatives:** Continuous strike input, fixed 5-strike subset.
**Rationale:** Contracts outside the σ window have no tradeable spread — they're either certain or worthless. Showing them confuses traders. Dynamic availability makes the chain feel purposeful.
**Trade-off:** Some traders may want specific strikes outside the window. V2 can allow custom strikes with a warning.

### ADR-004: Python Pricing Service
**Decision:** Standalone FastAPI service for all pricing math.
**Alternatives:** TypeScript in Next.js edge functions, WASM-compiled Python.
**Rationale:** Scipy binomial tree and integrate.quad are battle-tested. Rewriting in TS is error-prone. Edge functions have no numpy. WASM adds build complexity.
**Trade-off:** Extra network hop (~2ms). Acceptable with Redis caching.

### ADR-005: Server-Side Polymarket API Calls Only
**Decision:** No client-side calls to Polymarket APIs.
**Rationale:** CORS restrictions, API key protection, rate limit control, normalization in one place.
**Trade-off:** Additional server load. Mitigated by Redis caching.

### ADR-006: Simulation from Pre-Computed Static Data
**Decision:** Demo replay reads from pre-computed JSON/DB rows, not live APIs.
**Rationale:** Eliminates all network risk during live demo. Deterministic, rehearsable, annotatable. The live product still uses real APIs — simulation is one specific mode.
**Trade-off:** Simulation requires manual setup per demo market. Worth it for demo reliability.

### ADR-007: Neon Serverless Postgres
**Decision:** Neon for time-series + metadata + simulation data.
**Alternatives:** TimescaleDB, InfluxDB, DynamoDB.
**Rationale:** Hackathon scope — TimescaleDB is overkill. Neon gives Postgres semantics with zero ops, scales to zero, branches for dev/prod.
**Trade-off:** Connection pooling overhead in serverless. Mitigated by Neon's built-in PgBouncer.

---

## 11. Stress Test & Failure Analysis

### 11.1 Load Profile

| Scenario | Concurrent Users | Markets | Req/sec |
|---|---|---|---|
| Hackathon demo | 5–10 | 2–3 | ~20 |
| Viral (V1) | 200 | 10 | ~400 |
| Production | 1,000 | 50 | ~2,000 |

### 11.2 Failure Modes

#### F1: Polymarket API Rate Limit
**Trigger:** Polling 10+ markets at 1s approaches undocumented limit.
**Mitigation:** Adaptive backoff (5s on 429, recover to 1s). Last cached prob served with staleness badge. Single poller per market.

#### F2: Pricing Service Down
**Trigger:** Fly.io cold start, OOM, deploy.
**Mitigation:** Cached chain from Redis returned with "⚠ Delayed" badge. Two replicas in prod.

#### F3: p → 0 or p → 1 (logit blow-up)
**Trigger:** Market near resolution.
**Mitigation:** Hard clamp at ingestion `[0.001, 0.999]`. UI warning: "Market near resolution". Auto-settlement triggered if p reaches 0 or 1.

#### F4: σ = 0 (flat market)
**Trigger:** No historical movement, < 10 observations, all-identical prices.
**Mitigation:** Full vol estimation pipeline (Section 3.2) — winsorization, floor, cross-market fallback, source label in UI.

#### F5: σ blow-up (near-resolution spike)
**Trigger:** p goes 50%→99% in one tick → massive logit diff → σ_ann inflated.
**Mitigation:** Winsorize diffs at [1st, 99th] percentile. Hard cap at σ = 5.0 (500%). Source label "vol_capped" shown.

#### F6: Binomial Tree Slow
**Trigger:** N=100 under concurrent load.
**Mitigation:** N=50 for live chain (0.5ms, 0.3% error). N=100 for single contract. Cached at 5s TTL. Greeks batch-computed once per cache miss.

#### F7: Quadrature Convergence Failure
**Trigger:** σ√τ tiny, kink outside naive bounds.
**Mitigation:** Bounds always include `logit(K) ± 1.0`. `points=[LK]` tells integrator to split at the kink. (Vanilla price is reference only — American binomial is the primary pricer.)

#### F8: Redis Unavailable
**Trigger:** Upstash outage.
**Mitigation:** In-memory LRU fallback (last 60s). Pricing recomputes on every request.

#### F9: Early Resolution Before Our Expiry
**Trigger:** Underlying Polymarket market resolves (p→0 or p→1) while ProbX contracts are open.
**Mitigation:** Market Data Service detects p ∈ {0, 1} → publishes resolution event → all open contracts on that market auto-settle at resolution value → UI shows "Market Resolved — Contract Settled".

### 11.3 Stress Test Matrix

| Test | Input | Expected | Failure Mode |
|---|---|---|---|
| p = 0.001 | Near-zero prob | Clamp, floor σ, warn | F3 |
| p = 0.999 | Near-one prob | Clamp, floor σ, warn, auto-settle check | F3, F9 |
| σ = 0 | Flat market | Cross-market fallback or floor | F4 |
| σ huge (near-resolution spike) | 1 bad tick | Winsorized out, cap applied | F5 |
| τ = 0.001 | 6 min to expiry | Theta → large, warn | F3 |
| K = p0 (ATM) | d = 0 | Stable, price ≈ 0.5 binary | Nominal |
| K = 0.30, p = 0.70 | Deep ITM call | price → intrinsic, exercise optimal | Nominal |
| K = 0.70, p = 0.30 | Deep OTM call | price → 0, boundary far | Nominal |
| Market resolves mid-contract | p snaps to 1.0 | Auto-settle at $0.50 (K=0.50 call) | F9 |
| 50 concurrent chain requests | Load | < 100ms P99 | F2 |
| Polymarket 503 | Outage | Cached data served, badge shown | F1 |

---

## 12. Scaling Thresholds

```
HACKATHON                   V1 LAUNCH                   V2
────────────────────        ────────────────────        ──────────────────
Vercel Hobby            →   Vercel Pro               →  Vercel Enterprise
1× Fly.io (512MB)       →   2× Fly.io (1GB)          →  Autoscale
Neon free               →   Neon Pro (autoscale)      →  Timescale for ticks
Upstash free            →   Upstash PAYG              →  Upstash enterprise
Polling 1s/market       →   WS (if API supports)      →  Event-driven
No auth                 →   Clerk auth                →  Portfolio tracking
Paper contracts only    →   Paper trading             →  On-chain settlement
~$0/month               →   ~$50/month                →  ~$300/month
```

---

## 13. Hackathon MVP vs V2 Delta

### MVP (Hackathon Deliverable)

| Feature | In MVP | Notes |
|---|---|---|
| Live prob gauge (any Polymarket market) | YES | SSE from Market Data Service |
| CALL/PUT + discrete strike selection | YES | Simple View, snaps to grid |
| Expiry tabs (7d, 14d, 21d, 30d) | YES | |
| American binomial pricing | YES | N=100, ~1.5ms |
| Live Greeks (Δ Θ ν Γ) | YES | Cached 5s |
| Hockey-stick payoff curve | YES | Client-side |
| Options chain (3 strikes × 2 expiries) | YES | Pro View |
| ITM/OTM color zones on chain | YES | |
| Implied distribution curve | YES | Above chain, key differentiator |
| Early exercise boundary curve | YES | Pro View |
| Vol estimation + source label | YES | Full edge case pipeline |
| Historical vol from Polymarket Gamma API | YES | |
| Demo simulation replay | YES | Pre-computed, static data |
| Vol surface (3D) | NO | V2 |
| Strategy builder (multi-leg) | NO | V2 |
| Cross-market correlations | NO | V2 |
| On-chain settlement | NO | Out of scope |
| User accounts / portfolio | NO | V2 |

### Critical Path

```
Day 1:
  [ ] Polymarket CLOB + Gamma API integration
  [ ] Historical p(t) backfill → Postgres
  [ ] Vol estimation pipeline (full edge case handling)
  [ ] American binomial pricer + Greeks

Day 2:
  [ ] FastAPI pricing endpoints (price, chain, boundary, payoff)
  [ ] Next.js route handlers + Redis caching
  [ ] SSE prob streaming to browser
  [ ] Simulation data pre-computation for demo market

Day 3:
  [ ] Simple View (gauge, CALL/PUT, discrete slider, payoff card)
  [ ] Pro View (chain with color zones, Greeks panel, payoff curve)
  [ ] Distribution curve + exercise boundary
  [ ] Simulation replay mode

Day 4:
  [ ] End-to-end integration
  [ ] Boundary condition stress tests
  [ ] Simulation rehearsal + event annotations
  [ ] Polish + demo prep
```

---

## Appendix: Key Formulas Reference

```
Logit:          L(p)   = ln(p / (1-p))
Sigmoid:        σ(L)   = 1 / (1 + e^-L)
L_T dist:       L_T    ~ N(L₀, σ²τ)        driftless Brownian motion in logit space

American call:  price via binomial tree, backward induction
                at each node: max(continuation_value, max(p_node - K, 0))

Binary call:    C_bin  = Φ(d)              where d = (L₀ - logit(K)) / (σ√τ)
Binary put:     P_bin  = Φ(-d)

Vanilla call:   C_van  = ∫ max(σ(l)-K, 0) · φ(l; L₀, σ²τ) dl
                       (adaptive quadrature with split at logit(K))

Greeks:         all via bump-and-reprice on American binomial
Delta:          Δ = (V(p0+dp) - V(p0-dp)) / (2·dp)      dp = 0.01
Theta:          Θ = (V(τ-1/252) - V(τ)) / (1/252)        $/day, negative
Vega:           ν = (V(σ+0.01) - V(σ-0.01)) / 0.02
Gamma:          Γ = (V(p0+dp) - 2V(p0) + V(p0-dp)) / dp²

Exercise at t:  CALL: max(p_t - K, 0)   PUT: max(K - p_t, 0)
Auto-settle:    if p → 0: CALL=0, PUT=K   if p → 1: CALL=(1-K), PUT=0

Vol pipeline:   diffs  = logit(p_{t+1}) - logit(p_t)     [filtered, winsorized]
                σ_d    = std(diffs, ddof=1)
                σ_ann  = clip(σ_d × √252, 0.05, 5.00)
```

---

*ProbX — The derivatives layer prediction markets were always missing.*
