# Pythia

**Options trading on prediction markets.** Pythia layers American-style options on top of Polymarket's binary prediction markets, letting you trade volatility and directional moves on probabilities — not just the underlying yes/no outcome.

---

## What It Does

Every Polymarket market has a YES token whose price represents the crowd's probability estimate (e.g., "Will Trump win?" = 62%). That price moves over time. Pythia lets you trade *options* on that price:

- **Call** — profits if probability rises above your strike before expiry
- **Put** — profits if probability falls below your strike before expiry
- **Early exercise** — American-style, so you can exit whenever it's optimal

The platform is currently **paper trading only** — no real money, full analytics.

---

## Architecture Overview

```mermaid
graph TD
    FE["**Next.js 16 Frontend**\nPort 3000\nUI · API routes · Auth"]

    PRICING["**FastAPI Pricing Service**\nPort 8000 · Python 3.12\nBinomial tree · Greeks"]

    MDS["**Bun Market Data Service**\nPort 3001\nPolymarket polling · SSE streams"]

    SUPA["**Supabase**\nAuth + RLS\nPaper trading orders"]

    NEON["**Neon PostgreSQL**\nMarket metadata\nProbability history"]

    REDIS["**Upstash Redis**\nVolatility cache\n1-hour TTL"]

    POLY["**Polymarket**\nGamma API · CLOB API\nLive probability prices"]

    FE -->|"POST /price\nPOST /chain"| PRICING
    FE -->|"GET /markets\nGET /vol\nSSE /prob"| MDS
    FE -->|"Auth tokens\nOrder CRUD"| SUPA

    MDS -->|"Stores ticks"| NEON
    MDS -->|"Caches vol"| REDIS
    MDS -->|"Polls prices"| POLY

    PRICING -->|"Fetches live prob\n(fallback)"| MDS
```

Three independent backend services:

| Service | Runtime | Port | Responsibility |
|---------|---------|------|----------------|
| Frontend | Next.js 16 | 3000 | UI, API routes, auth |
| Pricing | FastAPI (Python 3.12) | 8000 | Options math, Greeks |
| Market Data | Bun.js | 3001 | Polymarket polling, vol estimation |

---

## The Math

### Why Logit-Normal?

Standard Black-Scholes assumes price can go to infinity. Probabilities are bounded in (0, 1), so that breaks. Pythia models the **log-odds** instead:

```
L = log(p / (1 - p))     # logit transform
L_T ~ N(L_0, σ² · τ)     # driftless Brownian motion in logit space
p_T = sigmoid(L_T)        # always bounded in (0, 1)
```

This gives a **logit-normal terminal distribution** — naturally respects the probability boundary, no clipping required.

### Pricing Engine

Options are priced via **American binomial tree** (backward induction with early exercise check at each node):

```python
# Simplified pseudocode
for t in reversed(range(steps)):
    for node in tree[t]:
        hold_value = discount * (q * V_up + (1-q) * V_down)
        exercise_value = max(p - K, 0)  # call intrinsic
        V[node] = max(hold_value, exercise_value)
```

European prices are also computed via **adaptive Gauss-Legendre quadrature** against the logit-normal density, used as a reference benchmark.

### Greeks

All Greeks use **bump-and-reprice** (central differences):

| Greek | Bump | Interpretation |
|-------|------|----------------|
| Delta | ±1pp probability | ¢ change per 1pp move in prob |
| Theta | −1 day | ¢ lost per day of time decay |
| Vega | ±1% volatility | ¢ change per 1pp vol change |
| Gamma | ±1pp probability (×2) | Convexity, Delta's rate of change |

**Gamma normalization:** Scaled to probability space (not logit-space). This prevents the artificial negative-gamma artifacts deep ITM options produce in logit-space differentiation.

### Volatility Estimation

Implied vol is estimated from historical probability data in the Neon DB:

1. Fetch 30 days of probability ticks
2. Compute log-odds returns: `r_t = logit(p_t) - logit(p_{t-1})`
3. Annualize: `σ = std(r_t) × sqrt(365 / Δt_days)`
4. Cache result in Redis with 1-hour TTL

---

## Project Structure

```
Pythia/
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  # Home — market grid
│   │   ├── market/[id]/page.tsx      # Market detail + options chain
│   │   ├── portfolio/page.tsx        # Paper trading dashboard
│   │   └── api/
│   │       ├── markets/              # Market search + metadata
│   │       ├── price/                # Single contract pricing
│   │       ├── orders/               # Paper trade CRUD
│   │       └── events/               # Multi-outcome event grouping
│   ├── components/
│   │   ├── OptionsChain.tsx          # Strike × expiry matrix
│   │   ├── OptionRow.tsx             # Single contract row
│   │   ├── TradePanel.tsx            # Buy/sell panel
│   │   ├── GreeksPanel.tsx           # Greeks display
│   │   ├── PayoffChart.tsx           # Multi-leg payoff diagram
│   │   ├── ProbChart.tsx             # Probability history chart
│   │   ├── PortfolioSummary.tsx      # Account stats
│   │   ├── OrderHistory.tsx          # Trade history table
│   │   ├── PnlChart.tsx              # Equity curve
│   │   ├── PnlBreakdown.tsx          # Realized vs unrealized P&L
│   │   ├── ScenarioAnalysis.tsx      # What-if analysis
│   │   ├── PortfolioBacktest.tsx     # Historical replay
│   │   ├── EVCalculator.tsx          # Expected value / Kelly sizing
│   │   ├── IVHVChart.tsx             # Implied vs historical vol
│   │   ├── ProbSphere.tsx            # 3D probability visualization
│   │   └── ...
│   ├── hooks/
│   │   ├── usePaperTrades.ts         # Paper trading state
│   │   └── useDemoMode.ts            # Demo mode state
│   ├── lib/
│   │   ├── paperTrade.ts             # Position derivation logic
│   │   ├── demoSimulation.ts         # Demo scenario data
│   │   └── ...
│   └── types/                        # Shared TypeScript interfaces
│
├── backend/
│   ├── main.py                       # FastAPI app + route handlers
│   ├── pricer.py                     # Binomial tree + Greeks math
│   ├── requirements.txt
│   └── market-data-service/
│       ├── src/
│       │   ├── index.ts              # Bun HTTP server
│       │   ├── db.ts                 # Neon Postgres client
│       │   ├── polymarket.ts         # Gamma + CLOB API clients
│       │   ├── poller.ts             # Background polling loop
│       │   ├── vol.ts                # Volatility estimation
│       │   ├── redis.ts              # Upstash cache
│       │   └── auth.ts               # API key auth
│       └── package.json
│
├── backend/scripts/
│   └── schema.sql                    # Database schema
│
├── docker-compose.yml
├── .env.example
└── dev.ps1                           # Windows dev startup script
```

---

## Features

### Market Browser

- Browse all active Polymarket markets
- Filter by category: Politics, Crypto, Economics, Sports, Science, Geopolitics
- Search by keyword
- Multi-outcome events grouped into a single card (e.g., election candidates)
- Live probability prices refreshed every 30 seconds

### Options Chain

- Full strike × expiry matrix for any market
- Strikes: 39 levels from 3% to 97%, centered around current probability
- Expiries: 3D, 7D, 14D, 30D
- Each cell shows call price and put price
- Hover any cell to see Delta, Theta, Vega, Gamma inline
- Implied probability distribution curve overlaid at top of chain
- Color coding: green for calls, red for puts, highlighted ATM row

### Trading

- Click any cell to open the trade panel
- Choose side (buy/sell), quantity, and limit price
- See pre-trade Greeks and cost basis before submitting
- Orders stored in Supabase, synced across devices
- Full order history with fill prices and timestamps

### Portfolio Dashboard

- Real-time positions with current mark-to-market value
- Per-position P&L (unrealized + realized)
- Aggregate equity curve chart
- Scenario analysis: drag a slider to simulate probability moves
- Backtesting: replay your portfolio at any historical point in time
- Kelly criterion calculator for position sizing

### Analytics (per market)

- Probability history chart (30 days)
- Implied vs. historical volatility chart
- Early exercise boundary visualization
- Terminal probability distribution
- Multi-leg payoff diagram (combine calls, puts, spreads)

---

## API Reference

### Pricing Service (`:8000`)

All endpoints accept and return JSON.

#### `POST /price`

Price a single option contract.

```json
{
  "prob": 0.62,
  "strike": 0.70,
  "vol": 0.85,
  "tau": 0.0822,
  "type": "call"
}
```

Response:

```json
{
  "price": 0.0341,
  "delta": 0.31,
  "theta": -0.0018,
  "vega": 0.0092,
  "gamma": 0.0043,
  "intrinsic": 0.0,
  "time_value": 0.0341
}
```

#### `POST /chain`

Full options chain for all strikes and expiries.

```json
{
  "prob": 0.62,
  "vol": 0.85,
  "strikes": [0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  "expiries_days": [3, 7, 14, 30]
}
```

#### `POST /boundary`

Early exercise boundary curve for American options.

```json
{ "vol": 0.85, "tau_days": 30, "type": "call" }
```

#### `POST /payoff`

Multi-leg P&L at expiry across a range of terminal probabilities.

```json
{
  "legs": [
    { "type": "call", "strike": 0.6, "side": "buy", "qty": 1, "premium": 0.04 },
    { "type": "call", "strike": 0.8, "side": "sell", "qty": 1, "premium": 0.01 }
  ]
}
```

#### `POST /distribution`

Terminal probability density (logit-normal).

```json
{ "prob": 0.62, "vol": 0.85, "tau_days": 14 }
```

#### `GET /health`

Service liveness check.

---

### Market Data Service (`:3001`)

#### `GET /markets?q=<query>`

Search markets. Returns array of market objects with current probability, volume, implied vol.

#### `GET /markets/:id`

Fetch single market by `condition_id` or slug.

#### `GET /markets/:id/history`

Historical probability ticks. Returns `[{ ts, prob }]` array.

#### `GET /markets/:id/vol`

Cached implied volatility estimate.

#### `GET /markets/:id/prob`

**Server-Sent Events** stream. Emits live probability updates every second:

```
event: price
data: {"prob": 0.624, "ts": "2026-03-29T14:22:01Z"}
```

---

### Frontend API Routes (`:3000/api/`)

These are Next.js server-side proxies — the browser never talks to backends directly.

| Route | Method | Description |
|-------|--------|-------------|
| `/api/markets` | GET | Search markets |
| `/api/markets/:id` | GET | Fetch single market |
| `/api/markets/:id/chain` | POST | Fetch priced options chain |
| `/api/markets/:id/history` | GET | Historical probs |
| `/api/markets/:id/vol` | GET | Implied vol |
| `/api/price` | POST | Price single contract |
| `/api/orders` | GET/POST/DELETE | Paper trade CRUD (auth required) |
| `/api/events` | GET | Multi-outcome event groupings |

---

## Database Schema

```sql
-- Market metadata, synced from Polymarket
CREATE TABLE markets (
  condition_id    TEXT PRIMARY KEY,
  question        TEXT NOT NULL,
  category        TEXT,
  slug            TEXT,
  volume24h       NUMERIC,
  liquidity       NUMERIC,
  clob_token_id   TEXT,
  tags            JSON,
  active          BOOLEAN,
  closed          BOOLEAN,
  resolution_ts   TIMESTAMP,
  current_prob    NUMERIC,
  current_vol     NUMERIC,
  vol_source      TEXT,
  updated_at      TIMESTAMP
);

-- Historical probability snapshots
CREATE TABLE prob_series (
  condition_id  TEXT NOT NULL,
  ts            TIMESTAMP NOT NULL,
  prob          NUMERIC NOT NULL,
  PRIMARY KEY (condition_id, ts)
);

-- Paper trading orders (Supabase, RLS enforced)
CREATE TABLE orders (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL,
  market_id   TEXT NOT NULL,
  strike      NUMERIC NOT NULL,
  type        TEXT,           -- 'call' | 'put'
  expiry      TEXT,           -- '7D' or 'YYYY-MM-DD'
  side        TEXT,           -- 'buy' | 'sell'
  quantity    INTEGER,
  premium     NUMERIC,
  status      TEXT,           -- 'filled'
  metadata    JSON,
  created_at  TIMESTAMP
);
```

Row-level security on `orders` ensures users can only read and write their own records.

---

## Setup

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker + Docker Compose
- A [Supabase](https://supabase.com) project (auth + orders)
- A [Neon](https://neon.tech) database (market data)
- An [Upstash](https://upstash.com) Redis instance (vol cache)

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # server-side only, never exposed to browser

# Neon Postgres
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Upstash Redis
UPSTASH_REDIS_URL=https://xxxx.upstash.io
UPSTASH_REDIS_TOKEN=AX...

# Internal service URLs (set automatically by docker-compose)
PRICING_SERVICE_URL=http://localhost:8000
MARKET_DATA_SERVICE_URL=http://localhost:3001
```

### Database Setup

Run the schema against your Neon database:

```bash
psql $DATABASE_URL -f backend/scripts/schema.sql
```

Then run the same schema (for `orders` table) in your Supabase SQL editor, and enable RLS:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_orders" ON orders
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Local Development (Docker)

```bash
docker-compose up
```

This starts all five services (frontend, pricing, market-data, postgres, redis) and wires them together. Access the app at `http://localhost:3000`.

### Local Development (Without Docker)

Run each service in a separate terminal:

```bash
# Terminal 1 — Pricing service
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Market data service
cd backend/market-data-service
bun install
bun run src/index.ts

# Terminal 3 — Frontend
cd frontend
npm install
npm run dev
```

### Windows

```powershell
./dev.ps1
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | Next.js 16 (App Router) |
| UI | React 18, Tailwind CSS 3.4 |
| Charts | Recharts |
| Animations | Framer Motion |
| 3D | Three.js |
| Icons | Lucide React |
| Validation | Zod |
| Auth | Supabase Auth |
| Pricing backend | FastAPI + NumPy + SciPy |
| Market data backend | Bun.js |
| Primary database | Neon (serverless PostgreSQL) |
| Cache | Upstash Redis |
| Orders database | Supabase PostgreSQL (RLS) |
| Data source | Polymarket Gamma API + CLOB API |
| Deployment | Vercel (frontend) + Fly.io (backends) |

---

## Key Design Decisions

**Logit-normal model over Black-Scholes** — Probabilities live in (0, 1). Modeling log-odds as a Brownian motion is the natural analogue of log-price dynamics, and it guarantees bounded terminal distributions without any artificial clipping.

**American binomial over analytic formulas** — There is no closed-form analytic solution for American options under logit-normal dynamics. The binomial tree is fast enough (milliseconds at 200 steps) and gives exact early-exercise handling.

**Bump-and-reprice Greeks** — Simpler to maintain and numerically stable across all moneyness/expiry combinations. Analytic Greeks would require deriving the logit-normal option sensitivities by hand, with more edge cases.

**Three separate backend services** — The pricing engine is a stateless pure-math service; separating it lets it scale independently and be replaced (e.g., with a Monte Carlo pricer) without touching data infrastructure. The market data service has different uptime requirements (must poll Polymarket continuously) and a different runtime (Bun is faster for I/O-heavy polling than Python).

**Next.js API routes as proxies** — The browser never calls the backends directly. This avoids CORS configuration on Polymarket's APIs and keeps backend URLs out of client bundles.

**Supabase RLS for order isolation** — Row-level security at the database layer means a bug in application code cannot leak one user's orders to another. The policy is enforced by Postgres, not the API.

**Serverless infrastructure** — Neon and Upstash scale to zero, eliminating idle costs for a project at this stage. Neither requires connection pooling configuration for typical load.
