# ProbX — Architecture Plan & Stress Test
> Options on Prediction Market Probabilities · Polymarket Hackathon · Track: Risk & Visualization

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Infrastructure Layers](#2-infrastructure-layers)
3. [Data Pipeline](#3-data-pipeline)
4. [Pricing Engine](#4-pricing-engine)
5. [API Layer](#5-api-layer)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Architecture Decision Records (ADRs)](#7-architecture-decision-records)
8. [Stress Test & Failure Analysis](#8-stress-test--failure-analysis)
9. [Scaling Thresholds](#9-scaling-thresholds)
10. [Hackathon-Scoped MVP vs V2 Delta](#10-hackathon-scoped-mvp-vs-v2-delta)

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                          │
│   Simple View ◄──────────────────────────► Pro View             │
│   (gauge, CALL/PUT, slider)                (chain, Greeks, vol)  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS / WebSocket
┌────────────────────────────▼─────────────────────────────────────┐
│                       Next.js App (Vercel Edge)                  │
│   Route Handlers  ·  Server Components  ·  WebSocket relay       │
└──────┬────────────────────────────────────┬───────────────────────┘
       │ REST                               │ REST / SSE
┌──────▼──────────────┐          ┌──────────▼────────────────────┐
│   Pricing Service   │          │    Market Data Service         │
│   (Python / FastAPI)│          │    (Node / Bun)               │
│                     │          │                               │
│  · Logit-Normal BSM │          │  · Polymarket CLOB API        │
│  · Greeks calc      │          │  · Polymarket Gamma API       │
│  · Gaussian quadr.  │          │  · Vol estimation             │
│  · Position payoff  │          │  · Historical time-series     │
└──────┬──────────────┘          └──────────┬────────────────────┘
       │                                    │
┌──────▼────────────────────────────────────▼────────────────────┐
│                         Redis (Upstash)                         │
│   · Computed Greeks cache (TTL 5s)                             │
│   · Latest probability snapshots                               │
│   · Vol estimates (TTL 1h)                                     │
└──────────────────────────┬─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                      Postgres (Neon / Supabase)                 │
│   · Historical p(t) time-series per market                     │
│   · Pre-computed vol surface snapshots                         │
│   · User positions (V2)                                        │
└────────────────────────────────────────────────────────────────┘
```

**Core invariant:** The browser never calls Polymarket APIs directly. All market data flows through the Market Data Service, which normalizes, caches, and streams it. The Pricing Service is a pure math engine — stateless, no DB access.

---

## 2. Infrastructure Layers

### 2.1 Hosting

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vercel (Next.js 14 App Router) | Edge SSR, instant deploys, WebSocket support via route handlers |
| Pricing Service | Railway or Fly.io (Python/FastAPI) | Scipy/numpy required; can't run in Vercel serverless easily |
| Market Data Service | Vercel Edge Functions or Bun on Fly.io | Lightweight, I/O bound; JS fits the Polymarket JS SDK |
| Cache | Upstash Redis (serverless) | Per-request billing, zero cold start, HTTP-compatible |
| Database | Neon (serverless Postgres) | Branching for dev/prod, scales to zero, pg-compatible |

### 2.2 Communication Protocols

| Path | Protocol | Why |
|---|---|---|
| Browser → Next.js | HTTPS + WebSocket | WS for live prob/Greeks streaming |
| Next.js → Pricing Service | REST (HTTP/2) | Request/response, cache at Next.js layer |
| Next.js → Market Data | REST + SSE | SSE for live market prob push |
| Market Data → Polymarket | REST (polling 1s) | Polymarket CLOB REST; no WS on Gamma API |
| Pricing → Redis | HTTP (Upstash REST) | Serverless-compatible |

### 2.3 Environment Topology

```
dev  →  local Docker Compose (all services + local Redis + local Postgres)
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
  ├── Append to in-memory circular buffer (last 500 ticks)
  ├── Write to Postgres time-series table (async, batched every 5s)
  └── Publish to Redis key: prob:{condition_id} (TTL 5s)
```

### 3.2 Volatility Estimation

```
On startup + every 1 hour per market:
  ├── Pull last 30d of daily p(t) from Postgres
  ├── Compute logit differences: Δl_t = logit(p_{t+1}) - logit(p_t)
  ├── σ_daily = std(Δl_t)
  ├── σ_annualized = σ_daily × √252
  └── Store in Redis: vol:{condition_id} (TTL 1h)

Edge case: if p(t) = 0 or 1.0 → clamp to [0.001, 0.999] before logit
Edge case: fewer than 10 data points → use cross-market average σ
```

### 3.3 Database Schema (Postgres)

```sql
-- Raw probability time-series
CREATE TABLE prob_series (
  condition_id  TEXT NOT NULL,
  ts            TIMESTAMPTZ NOT NULL,
  prob          DOUBLE PRECISION NOT NULL CHECK (prob > 0 AND prob < 1),
  PRIMARY KEY (condition_id, ts)
);
CREATE INDEX idx_prob_series_cond_ts ON prob_series (condition_id, ts DESC);

-- Vol surface snapshots (for the 3D vol surface view)
CREATE TABLE vol_snapshots (
  condition_id  TEXT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  strike        DOUBLE PRECISION NOT NULL,
  tau_days      INTEGER NOT NULL,
  implied_vol   DOUBLE PRECISION,
  binary_price  DOUBLE PRECISION,
  vanilla_price DOUBLE PRECISION,
  delta         DOUBLE PRECISION,
  theta         DOUBLE PRECISION,
  vega          DOUBLE PRECISION,
  PRIMARY KEY (condition_id, computed_at, strike, tau_days)
);

-- Markets metadata cache
CREATE TABLE markets (
  condition_id  TEXT PRIMARY KEY,
  question      TEXT NOT NULL,
  category      TEXT,
  resolution_ts TIMESTAMPTZ,
  current_prob  DOUBLE PRECISION,
  current_vol   DOUBLE PRECISION,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Pricing Engine

### 4.1 Service Interface (FastAPI)

```
POST /price
  Body: { condition_id, p0, strike, tau_days, sigma, option_type }
  Returns: { premium, delta, theta, vega, gamma, d }

POST /payoff_curve
  Body: { legs: [{type, strike, premium, size}], p_range: [0,1], steps: 100 }
  Returns: { probs: [...], payoffs: [...] }

POST /vol_surface
  Body: { condition_id, strikes: [0.3..0.7], taus: [1,3,7,14,30] }
  Returns: 2D grid of { strike, tau, price, delta, theta, vega }

GET /health
```

### 4.2 Core Math (Python)

```python
import numpy as np
from scipy import stats, integrate

def logit(p: float) -> float:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))

def sigmoid(l: float) -> float:
    return 1 / (1 + np.exp(-l))

def binary_call_price(p0: float, K: float, sigma: float, tau: float) -> dict:
    """
    Pays $1 if p_T > K at expiry.
    d = (L0 - logit(K)) / (sigma * sqrt(tau))
    C = Phi(d)
    """
    L0 = logit(p0)
    LK = logit(K)
    sq = sigma * np.sqrt(tau)
    d  = (L0 - LK) / sq

    price = stats.norm.cdf(d)
    delta = stats.norm.pdf(d) / (sq * p0 * (1 - p0))
    theta = -stats.norm.pdf(d) * d / (2 * tau)
    vega  = -stats.norm.pdf(d) * d / sigma

    return {"price": price, "delta": delta, "theta": theta, "vega": vega, "d": d}

def vanilla_call_price(p0: float, K: float, sigma: float, tau: float) -> float:
    """
    Pays max(p_T - K, 0). Numerical integration via Gaussian quadrature.
    """
    L0 = logit(p0)
    var = sigma**2 * tau

    def integrand(l):
        p = sigmoid(l)
        payoff = max(p - K, 0)
        density = stats.norm.pdf(l, loc=L0, scale=np.sqrt(var))
        return payoff * density

    result, _ = integrate.quad(integrand, L0 - 6 * np.sqrt(var), L0 + 6 * np.sqrt(var))
    return result
```

### 4.3 Performance Budget

| Operation | Target Latency | Method |
|---|---|---|
| Binary call price + Greeks | < 1ms | Closed-form |
| Vanilla call price | < 5ms | Gaussian quadrature (32 points) |
| Full options chain (5 strikes × 5 expiries) | < 50ms | Vectorized numpy |
| Vol surface (5×5 grid) | < 100ms | Vectorized + cached σ |
| Payoff curve (100 points, 3 legs) | < 10ms | Pure vectorized |

---

## 5. API Layer

### 5.1 Next.js Route Handlers

```
app/
├── api/
│   ├── markets/
│   │   ├── route.ts              # GET /api/markets — search live markets
│   │   └── [id]/
│   │       ├── route.ts          # GET /api/markets/:id — market detail + current prob
│   │       ├── prob/route.ts     # GET /api/markets/:id/prob — SSE stream of live p(t)
│   │       └── history/route.ts  # GET /api/markets/:id/history — historical series
│   ├── price/route.ts            # POST /api/price — proxy to Pricing Service
│   ├── chain/route.ts            # POST /api/chain — full options chain for a market
│   └── payoff/route.ts           # POST /api/payoff — payoff curve data
```

### 5.2 Caching Strategy

```
Request flow for GET /api/markets/:id/chain:

1. Check Redis: chain:{id}:{strikes}:{taus} → HIT → return (TTL 5s)
2. MISS → call Pricing Service with current p0 + vol from Redis
3. Store result in Redis (TTL 5s)
4. Return to client

Invalidation: prob update from Market Data Service publishes to Redis channel
→ Next.js revalidation tag invalidated → next chain request recomputes
```

### 5.3 Rate Limiting

- Market Data polling: 1 call/sec to Polymarket per market (stay under their limits)
- Client → API: 60 req/min per IP (Upstash rate limit middleware)
- Pricing Service: internal only, no public exposure

---

## 6. Frontend Architecture

### 6.1 Component Tree

```
app/
├── page.tsx                    # Market search + landing
├── market/[id]/
│   ├── page.tsx               # Market detail shell
│   ├── layout.tsx             # Shared sidebar, mode toggle
│   └── components/
│       ├── ProbGauge.tsx      # Animated SVG arc gauge
│       ├── ModeToggle.tsx     # Simple ↔ Pro switch
│       ├── simple/
│       │   ├── DirectionPicker.tsx   # CALL / PUT buttons
│       │   ├── StrikeSlider.tsx      # Draggable prob slider
│       │   └── PayoffCard.tsx        # "You win $X if YES% hits Y%"
│       └── pro/
│           ├── OptionsChain.tsx      # Strike × expiry grid
│           ├── GreeksPanel.tsx       # Δ Θ ν Γ live panel
│           ├── PayoffCurve.tsx       # Recharts hockey-stick
│           ├── VolSurface.tsx        # Three.js 3D surface (V2)
│           └── StrategyBuilder.tsx   # Multi-leg (V2)
└── components/
    ├── MarketSearch.tsx
    └── LiveProbBadge.tsx
```

### 6.2 State Management

```
Zustand store (client-side):
  marketStore: {
    conditionId: string
    currentProb: number          ← updated by SSE
    vol: number
    mode: "simple" | "pro"
    position: {
      type: "call" | "put"
      strike: number
      tau: number
      premium: number
    }
    greeks: { delta, theta, vega, gamma }
    payoffCurve: { probs[], payoffs[] }
  }

Server state (React Query / SWR):
  - Market metadata (5min cache)
  - Options chain (5s stale-while-revalidate)
  - Historical series (10min cache)

SSE connection:
  - useMarketStream(conditionId) hook
  - Reconnects with exponential backoff
  - Updates zustand currentProb → triggers Greeks recompute
```

### 6.3 Key Interactions

```
User drags StrikeSlider:
  → debounce 50ms
  → POST /api/price (strike, current p0, sigma, tau)
  → update greeks + payoffCurve in store
  → PayoffCurve + GreeksPanel re-render

SSE prob update arrives:
  → update currentProb in store
  → if position open: recompute position PnL (client-side, pure math)
  → ProbGauge animates
  → LiveProbBadge updates
```

---

## 7. Architecture Decision Records (ADRs)

### ADR-001: Logit-Normal over Black-Scholes
**Decision:** Model L = logit(p) as driftless Brownian motion, not p directly.
**Alternatives considered:** (1) Black-Scholes on p directly, (2) Beta distribution model, (3) Jump diffusion.
**Rationale:** p ∈ [0,1] violates BS lognormal assumption. Logit maps to ℝ, is empirically normal for political markets, and yields closed-form binary pricing. Beta model lacks closed-form Greeks. Jump diffusion adds parameters we can't estimate from thin data.
**Trade-off accepted:** Driftless assumption ignores real-world drift. Appropriate for short-tau options where drift is second-order.

### ADR-002: Python Pricing Service, Not TypeScript
**Decision:** Standalone FastAPI service for all pricing math.
**Alternatives:** (1) Pure TypeScript math in Next.js edge functions, (2) WebAssembly-compiled Python.
**Rationale:** Scipy's `integrate.quad` and `stats.norm` are battle-tested. Rewriting Gaussian quadrature in TS is error-prone. Edge functions have no scipy. WASM adds build complexity without benefit at hackathon scale.
**Trade-off accepted:** Extra network hop (~2ms). Acceptable given pricing is cached.

### ADR-003: Server-Side Polymarket API Calls Only
**Decision:** No client-side calls to Polymarket APIs.
**Rationale:** CORS restrictions, API key protection, normalization in one place, rate limit control.
**Trade-off accepted:** Additional server load. Mitigated by Redis caching.

### ADR-004: Serverless Postgres (Neon) over self-hosted
**Decision:** Neon for time-series + metadata.
**Alternatives:** TimescaleDB, InfluxDB, DynamoDB.
**Rationale:** Hackathon scope — TimescaleDB is overkill for ~10 markets × 30 days of ticks. Neon gives Postgres semantics with zero ops. Scales to zero overnight.
**Trade-off accepted:** Connection pooling overhead in serverless. Mitigated by PgBouncer (built into Neon).

### ADR-005: European-style cash settlement only (no AMM)
**Decision:** No on-chain settlement, no AMM liquidity provision for V1.
**Rationale:** Hackathon deliverable is a pricing and visualization tool, not a DEX. Building a bonding curve or AMM would consume 80% of engineering time for 0% of UX benefit at demo time.
**Trade-off accepted:** Not tradeable on-chain. This is an analytics/pricing layer, not an exchange. Clearly communicated in UI.

---

## 8. Stress Test & Failure Analysis

### 8.1 Load Profile Assumptions

| Scenario | Concurrent Users | Markets Watched | Requests/sec |
|---|---|---|---|
| Hackathon demo | 5–10 | 2–3 | ~20 |
| Viral post (V1) | 200 | 10 | ~400 |
| Production steady | 1,000 | 50 | ~2,000 |

### 8.2 Identified Failure Modes

#### F1: Polymarket API Rate Limit Hit
**Trigger:** Polling 10+ markets at 1s interval approaches undocumented rate limit.
**Symptom:** 429 responses → stale prob data → Greeks computed on stale p0.
**Mitigation:**
- Adaptive polling: slow to 5s if 429, recover to 1s
- Serve last cached prob with staleness indicator in UI
- Single poller per market (not per user connection)
- Queue-based fan-out: 1 Polymarket call → Redis pub → N SSE clients

#### F2: Pricing Service Unavailable
**Trigger:** Fly.io cold start, OOM kill, deploy rollover.
**Symptom:** Chain and Greeks requests fail, UI shows stale data.
**Mitigation:**
- Next.js catches pricing service errors → returns last Redis-cached chain result
- UI degrades gracefully: shows cached Greeks with "⚠ Delayed" badge
- Two Fly.io replicas in prod; health check every 10s

#### F3: logit(p) → ±∞ at p = 0 or 1
**Trigger:** Market probability snaps to 0% or 100% (resolution approaching).
**Symptom:** NaN Greeks, infinite d, broken payoff curve.
**Mitigation:**
- Hard clamp at ingestion: `p = clip(p, 0.001, 0.999)`
- Display warning: "Market near resolution — Greeks unreliable"
- Theta warning: "Extreme time decay — expiry imminent"
- Pricing service returns `{ error: "near_resolution" }` for p outside [0.01, 0.99]

#### F4: σ = 0 (flat market, no vol history)
**Trigger:** New market with < 10 data points or a market stuck at fixed probability.
**Symptom:** d → ±∞, degenerate pricing.
**Mitigation:**
- Minimum σ floor: `max(σ_estimated, 0.05)` (5% annualized)
- Fall back to cross-market median σ if < 10 observations
- UI label: "Vol estimated from similar markets"

#### F5: Redis Unavailable
**Trigger:** Upstash outage or network partition.
**Symptom:** All caching breaks → direct DB + pricing service calls on every request.
**Mitigation:**
- In-memory LRU fallback in Market Data Service (last 60s of prob data)
- Pricing Service falls through to compute on every request (acceptable at low load)
- Alert on Redis miss rate > 50%

#### F6: Historical Data Missing (cold start)
**Trigger:** New deployment, no historical prob data in Postgres.
**Symptom:** Vol estimation fails → pricing degrades to floor σ.
**Mitigation:**
- Seed script: backfill last 30 days via Polymarket Gamma API on first deploy
- Document minimum viable dataset: 10+ days per market for reliable σ

#### F7: WebSocket / SSE Client Storms
**Trigger:** Many clients connect simultaneously (demo moment, tweet goes viral).
**Symptom:** Vercel function instance limits hit, SSE connections drop.
**Mitigation:**
- SSE polling interval: 2s client-side (not true push) if WS unavailable
- Vercel streaming limit: ~100 concurrent SSE streams per function — acceptable at hackathon scale
- V2: move to dedicated WebSocket server on Fly.io

#### F8: Gaussian Quadrature Timeout
**Trigger:** Extreme parameter values (very low σ, very small τ) cause slow convergence.
**Symptom:** Vanilla call pricing takes > 100ms.
**Mitigation:**
- Timeout per pricing request: 200ms; fall back to binary price approximation
- Narrow integration bounds: `[L0 ± 6σ√τ]` (captures 99.9999% of probability mass)
- Cache results aggressively (5s TTL matches price update frequency)

### 8.3 Stress Test Matrix

| Test | Input | Expected | Failure Mode |
|---|---|---|---|
| p0 = 0.001 | logit(-6.9) | Clamp → 0.001, vol floor | F3 |
| p0 = 0.999 | logit(6.9) | Clamp → 0.999, warn UI | F3 |
| σ = 0 | flat market | Use σ floor = 0.05 | F4 |
| τ = 0.001 (6 min to expiry) | Theta → ∞ | Warn "near expiry" | F3 |
| K = p0 (ATM) | d = 0 | Price = 0.5 (binary), stable | Nominal |
| K = 0.3, p0 = 0.7 | Deep ITM | d >> 0, price → 1 | Boundary |
| K = 0.7, p0 = 0.3 | Deep OTM | d << 0, price → 0 | Boundary |
| 50 concurrent chain requests | Load test | < 100ms P99 | F2, F1 |
| Polymarket returns 503 | Outage | Serve cached, show badge | F1 |
| 3-leg strategy, all ITM | Payoff surface | No NaN, monotone | Nominal |

---

## 9. Scaling Thresholds

```
CURRENT (Hackathon)          NEXT (V1 Launch)             FUTURE (V2)
─────────────────────        ────────────────────          ──────────────────
Vercel Hobby               → Vercel Pro (team)           → Vercel Enterprise
1× Fly.io pricing (512MB)  → 2× Fly.io (1GB each)       → Autoscale + GPU for vol surface
Neon free tier             → Neon Pro (autoscale)        → Timescale for tick data
Upstash free               → Upstash Pay-as-you-go       → Upstash enterprise
Polling 1s/market          → WebSocket (if API supports) → Event-driven (webhook)
No auth                    → Clerk auth                  → Portfolio tracking
No positions               → Paper trading               → On-chain settlement
```

**Cost at hackathon scale:** ~$0/month (all free tiers)
**Cost at 1,000 DAU:** ~$50/month (Neon Pro + Upstash + Fly.io × 2)

---

## 10. Hackathon-Scoped MVP vs V2 Delta

### MVP Scope (Hackathon Deliverable)

| Feature | In MVP | Notes |
|---|---|---|
| Live prob gauge for any Polymarket market | YES | SSE from Market Data Service |
| CALL/PUT selection + strike slider | YES | Simple View |
| Binary call price + premium display | YES | Closed-form |
| Vanilla call price | YES | Quadrature |
| Live Greeks (Δ, Θ, ν) | YES | Cached 5s |
| Hockey-stick payoff curve | YES | Client-side calc |
| Options chain (5 strikes × 3 expiries) | YES | Pro View |
| Historical vol estimation | YES | From Polymarket Gamma API |
| Simple View / Pro View toggle | YES | Zustand mode |
| Vol surface (3D) | NO | V2 — Three.js |
| Strategy builder (multi-leg) | NO | V2 |
| Cross-market correlations | NO | V2 |
| On-chain settlement | NO | Out of scope |
| User accounts / portfolio | NO | V2 |

### Critical Path (Build Order)

```
Day 1:
  [x] Polymarket CLOB + Gamma API integration (Market Data Service)
  [x] Historical p(t) backfill → Postgres
  [x] Vol estimation pipeline
  [x] Core pricing math (Python) — binary + vanilla + Greeks

Day 2:
  [x] FastAPI pricing endpoints
  [x] Next.js route handlers + Redis caching
  [x] SSE prob streaming to browser

Day 3:
  [x] Simple View UI (gauge, CALL/PUT, slider, payoff card)
  [x] Pro View UI (options chain, Greeks panel, payoff curve)
  [x] Error states + clamp warnings

Day 4:
  [x] End-to-end integration test
  [x] Boundary condition stress tests (p→0, p→1, σ→0, τ→0)
  [x] Polish + demo prep
```

---

## Appendix: Key Formulas Reference

```
Logit:       L(p)    = ln(p / (1-p))
Sigmoid:     σ(L)    = 1 / (1 + e^-L)
L_T dist:    L_T     ~ N(L₀, σ²τ)

Binary call: C_bin   = Φ(d)            where d = (L₀ - logit(K)) / (σ√τ)
Binary put:  P_bin   = 1 - Φ(d)        = Φ(-d)

Vanilla call: C_van  = ∫ max(σ(l)-K, 0) · φ(l; L₀, σ²τ) dl

Delta:       Δ       = φ(d) / (σ√τ · p₀(1-p₀))
Theta:       Θ       = -φ(d)·d / (2τ)             [per day: divide by 365]
Vega:        ν       = -φ(d)·d / σ

Vol est:     σ_d     = std(logit(p_{t+1}) - logit(p_t))
             σ_ann   = σ_d × √252

P&L (long call, at expiry):  max(p_T - K, 0) - premium_paid
P&L (long put, at expiry):   max(K - p_T, 0) - premium_paid
```

---

*ProbX — The derivatives layer prediction markets were always missing.*
