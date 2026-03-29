# Pythia — Backend Overview & Data Flow

> Options on Prediction Market Probabilities · Polymarket Hackathon

---

## System Architecture

```
Browser (Next.js frontend)
    │
    ▼ HTTP / SSE (same origin)
Next.js Route Handlers          ← what the browser actually talks to
    ├── /api/markets
    ├── /api/markets/[id]
    ├── /api/markets/[id]/chain  ← Redis → Pricing Service → Redis (5s TTL)
    ├── /api/markets/[id]/history
    ├── /api/markets/[id]/prob   ← SSE relay
    ├── /api/price
    ├── /api/boundary
    ├── /api/payoff
    ├── /api/orders              ← paper trade stub
    ├── /api/simulation
    └── /api/simulation/[sim_id]
         │                    │
         ▼                    ▼
Market Data Service       Pricing Service
(Bun, port 3001)          (FastAPI, port 8000)
    │                         │
    │ polls every 1s           │ stateless pure math
    ▼                         │
Polymarket CLOB API           │
    │                         ▼
    ▼                    Logit-Normal Binomial Tree
Redis (Upstash)          Greeks (bump-and-reprice)
    ├── prob:{id}   TTL 5s    Early Exercise Boundary
    ├── vol:{id}    TTL 1h
    ├── chain:{id}  TTL 5s
    └── resolved:{id} TTL 1h
         │
         ▼
Postgres (Neon)
    ├── prob_series       (condition_id, ts, prob)
    ├── markets           (condition_id, question, current_prob, current_vol, ...)
    ├── vol_snapshots     (condition_id, strike, tau_days, call_price, put_price, greeks)
    └── simulation_series (sim_id, tick, ts_actual, prob, option_value, pnl, greeks)
```

**Core invariants:**
- Browser never calls Polymarket APIs directly
- Pricing Service is stateless — pure math, zero DB access
- Simulation replay runs from pre-computed static data — zero network risk during demo

---

## Database Schema

```sql
-- Raw probability time-series
prob_series (
  condition_id  TEXT,
  ts            TIMESTAMPTZ,
  prob          DOUBLE PRECISION  -- CHECK (prob > 0 AND prob < 1)
  PRIMARY KEY (condition_id, ts)
)

-- Market metadata + current state
markets (
  condition_id      TEXT PRIMARY KEY,
  question          TEXT,
  category          TEXT,
  resolution_ts     TIMESTAMPTZ,
  resolved          BOOLEAN DEFAULT FALSE,
  resolution_value  DOUBLE PRECISION,    -- 0 or 1
  current_prob      DOUBLE PRECISION,
  current_vol       DOUBLE PRECISION,
  vol_source        TEXT,
  updated_at        TIMESTAMPTZ
)

-- Greeks snapshots per strike×expiry (written by /chain calls)
vol_snapshots (
  condition_id  TEXT,
  computed_at   TIMESTAMPTZ,
  strike        DOUBLE PRECISION,
  tau_days      INTEGER,
  call_price    DOUBLE PRECISION,
  put_price     DOUBLE PRECISION,
  delta, theta, vega, gamma  DOUBLE PRECISION
  PRIMARY KEY (condition_id, computed_at, strike, tau_days)
)

-- Pre-computed simulation replay data (seeded by scripts/precompute_sim.py)
simulation_series (
  sim_id        TEXT,
  tick          INTEGER,
  ts_actual     TIMESTAMPTZ,
  prob          DOUBLE PRECISION,
  option_value  DOUBLE PRECISION,
  pnl           DOUBLE PRECISION,
  pnl_pct       DOUBLE PRECISION,
  delta, theta, vega  DOUBLE PRECISION,
  event_label   TEXT
  PRIMARY KEY (sim_id, tick)
)
```

---

## Complete API Reference

### Market Data Service (Bun `:3001`) — internal only, never called by browser

| Method | Path | Description | Returns |
|--------|------|-------------|---------|
| GET | `/health` | Health check | `{status, service}` |
| GET | `/markets?q=&limit=` | Search markets (DB → Polymarket Gamma fallback) | `{markets[]}` |
| GET | `/markets/:id` | Market detail + current prob/vol from Redis | `Market + prob + vol` |
| GET | `/markets/:id/prob` | **SSE stream** of live p(t), 1s tick | `data: {prob, ts, resolved}` |
| GET | `/markets/:id/history?days=` | Historical prob series (max 2000 rows, default 30d) | `{condition_id, history[]}` |
| GET | `/markets/:id/vol` | Vol estimate (Redis → compute from history) | `{sigma, source}` |
| GET | `/simulation` | List all sim_ids with tick count | `{simulations[]}` |
| GET | `/simulation/:sim_id` | Full simulation replay series | `{sim_id, series[]}` |

### Pricing Service (FastAPI `:8000`) — internal only

| Method | Path | Description | Input | Returns |
|--------|------|-------------|-------|---------|
| GET | `/health` | Health check | — | `{status}` |
| POST | `/price` | Single American option + Greeks | `{p0, strike, tau_days, sigma, kind, n_steps}` | `{price, delta, theta, vega, gamma}` |
| POST | `/chain` | Full chain (strikes × expiries matrix) | `{p0, sigma}` | `{calls[], puts[], strikes[], expiries[]}` |
| POST | `/boundary` | Early exercise boundary curve | `{K, sigma, tau_days, kind}` | `{boundary[{tau, p_star}]}` |
| POST | `/payoff` | P&L curve for multi-leg position | `{legs[{kind, strike, premium, size}]}` | `{probs[], payoffs[]}` |
| POST | `/distribution` | Terminal logit-normal probability density | `{p0, sigma, tau_days}` | `{probs[], densities[]}` |
| POST | `/strikes` | Available strikes near current p | `{p0}` | `{strikes[]}` |
| POST | `/vanilla` | European vanilla reference prices | `{p0, strike, tau_days, sigma}` | `{call, put}` |
| POST | `/binary` | Digital option prices | `{p0, strike, tau_days, sigma}` | `{call, put}` |

### Next.js Route Handlers (`:3000`) — what the browser calls

| Method | Path | Description | Backed by |
|--------|------|-------------|-----------|
| GET | `/api/markets?q=` | Market search | MDS `/markets` |
| GET | `/api/markets/:id` | Market detail | MDS `/markets/:id` |
| GET | `/api/markets/:id/chain` | Options chain with caching | Redis → Pricing Service → Redis |
| GET | `/api/markets/:id/history` | Prob history | MDS `/markets/:id/history` |
| GET | `/api/markets/:id/prob` | **SSE** live prob stream | MDS SSE relay |
| POST | `/api/price` | Single contract price | Pricing `/price` |
| POST | `/api/boundary` | Exercise boundary | Pricing `/boundary` |
| POST | `/api/payoff` | Payoff curve | Pricing `/payoff` |
| GET | `/api/simulation` | List simulations | MDS `/simulation` |
| GET | `/api/simulation/:sim_id` | Simulation replay | MDS `/simulation/:sim_id` |
| POST | `/api/orders` | Paper trade order | **stub — no real settlement** |

---

## Data Flow Narratives

### 1. Live Probability Update (SSE path)
```
Polymarket CLOB
  → poller.tick() every 1s
  → Redis.set("prob:{id}", {prob, ts}, TTL=5s)
  → MDS setInterval: reads Redis, broadcasts to SSE clients every 1s
  → Next.js /api/markets/:id/prob relays SSE to browser
  → Zustand store.currentProb updates
  → ProbGauge + LiveProbBadge re-render
```

### 2. Options Chain (cache-first)
```
Browser GET /api/markets/:id/chain
  → Redis.get("chain:{id}")
      HIT  → return immediately (X-Cache: HIT)
      MISS → Redis.get("prob:{id}") + Redis.get("vol:{id}")
           → If neither present: fallback GET MDS /markets/:id
           → POST Pricing Service /chain {p0, sigma}
               Pricing computes 9-strike × 4-expiry binomial tree (~150ms, N=50)
           → Redis.set("chain:{id}", result, TTL=5s)
           → Return (X-Cache: MISS)
```

### 3. Volatility Estimation (lazy, 1h TTL)
```
GET /api/markets/:id/vol  (or on first chain request)
  → Redis.get("vol:{id}")
      HIT  → return {sigma, source}
      MISS → MDS reads prob_series (last 30d, Postgres)
           → estimateVol():
               1. clamp probs to [1e-6, 1-1e-6]
               2. compute logit differences
               3. winsorize at [1st, 99th] percentile
               4. sigma_daily = std(diffs, ddof=1)
               5. sigma_ann = sigma_daily × √252
               6. clamp to [0.05, 5.00]
           → Redis.set("vol:{id}", {sigma, source}, TTL=3600s)
```

**Vol source labels propagated to the UI:**

| Source | Meaning |
|--------|---------|
| `estimated` | Normal — computed from 10+ days of data |
| `flat_market` | Market barely moved; vol floored at 0.05 |
| `cross_market_fallback` | < 10 clean logit-diff data points |
| `insufficient_data` | < 2 data points |
| `vol_floored` | σ was below 5% minimum |
| `vol_capped` | σ was above 500% maximum |

### 4. Market Resolution
```
poller.tick() detects prob ≤ 0.001 or ≥ 0.999
  → Redis.set("resolved:{id}", {condition_id, value, ts}, TTL=3600s)
  → resolutionCallback fires
  → broadcastProb(condition_id, value, resolved=true) to all SSE clients
  → Next.js chain route: checks resolved key → returns 410 Gone
  → deregisterMarket(condition_id) — stops polling
```

### 5. Simulation Replay
```
scripts/precompute_sim.py  (run once manually)
  → Downloads historical Polymarket prices via Gamma API
  → Prices options at each historical tick using Pricing Service
  → Inserts rows into simulation_series table

Browser GET /api/simulation/:sim_id
  → MDS reads simulation_series from Postgres (ordered by tick)
  → Returns full P&L replay series with Greeks + event labels
  → Frontend plays back tick-by-tick
```

---

## Architecture Decision Records (ADRs)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Logit-Normal over Black-Scholes | Probability is bounded [0,1]; BS assumes unbounded underlying |
| 2 | American binomial tree (Python) | scipy battle-tested; not rewritable in TS for hackathon |
| 3 | Server-side Polymarket calls only | Avoids CORS, rate-limit exposure, and normalises data before the browser |
| 4 | Neon Postgres over TimescaleDB | Hackathon scope; scales to zero; easy branching for dev/prod |
| 5 | European-style cash settlement only | No AMM or on-chain settlement in scope |
| 6 | Redis as prob/vol/chain buffer | Decouples polling frequency from request frequency |

---

## Failure Modes & Mitigations

| ID | Failure | Mitigation | Status |
|----|---------|------------|--------|
| F1 | Polymarket rate limit (429) | Adaptive polling — back off to 5s on 429, serve cached with staleness badge | **NOT IMPLEMENTED** |
| F2 | Pricing Service down | Return last Redis-cached chain with "Delayed" badge | **PARTIAL** — 502 returned, no badge |
| F3 | p → 0 or 1 | Hard clamp at 0.001/0.999; return `near_resolution` error outside [0.01, 0.99] | **DONE** |
| F4 | sigma = 0 | Floor at 0.05; fall back to cross-market median | **PARTIAL** — floor done, median not wired |
| F5 | Redis down | In-memory LRU fallback (60s) | **PARTIAL** — try/catch only, no LRU |
| F6 | No historical data | Seed script backfill via Gamma API | **DONE** (manual script) |
| F7 | SSE client storm | 2s polling fallback | **NOT IMPLEMENTED** |
| F8 | Quadrature timeout | 200ms timeout, fall back to binary price | **NOT IMPLEMENTED** |

---

## What Is and Isn't Implemented

### Done
- [x] Polymarket CLOB polling at 1s intervals
- [x] Logit-normal binomial tree pricer with American early exercise
- [x] Greeks via bump-and-reprice (Δ, Θ, ν, Γ)
- [x] Early exercise boundary curve
- [x] Full volatility pipeline (logit-diff, winsorize, annualize, all edge cases)
- [x] Redis caching layer (prob 5s, vol 1h, chain 5s)
- [x] SSE live probability streaming
- [x] Market resolution detection and broadcast
- [x] All 4 database tables + schema
- [x] Next.js route handlers proxying to both backend services
- [x] Simulation replay data model
- [x] Docker Compose for local dev
- [x] Fly.io deploy configs for both services

### Gaps / Stubs
- [ ] **`/api/orders`** — returns fake fills; no portfolio state or settlement
- [ ] **Rate limit backoff** — poller has no 429 detection or adaptive interval
- [ ] **Pricing Service timeout** — chain route has no fetch timeout guard
- [ ] **Cross-market vol median** — `estimateVol()` accepts `fallbackSigma` but `refreshVol()` always passes hardcoded `0.30` instead of the median across all registered markets
- [ ] **Redis LRU fallback** — only a try/catch; no in-memory LRU for Redis-down scenario
- [ ] **`simulation_series` not auto-seeded** — `scripts/precompute_sim.py` must be run manually

---

## Environment Variables Required

```
# Market Data Service
DATABASE_URL=           # Neon Postgres connection string
UPSTASH_REDIS_URL=      # Upstash Redis REST URL
UPSTASH_REDIS_TOKEN=    # Upstash Redis REST token
POLY_API_KEY=           # Polymarket L1 API key
POLY_SECRET=            # Base64-encoded secret
POLY_PASSPHRASE=        # API passphrase
PORT=3001

# Pricing Service
PORT=8000

# Next.js Frontend
MARKET_DATA_SERVICE_URL=   # e.g. http://localhost:3001
PRICING_SERVICE_URL=       # e.g. http://localhost:8000
UPSTASH_REDIS_URL=         # same Redis instance
UPSTASH_REDIS_TOKEN=
```
