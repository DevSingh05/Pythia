# Pythia
**The options layer prediction markets were always missing.**

Options on Polymarket YES% probabilities. Trade the movement, not the outcome.

---

## What Is This

Every Polymarket contract has a YES% price — a number that moves between 0% and 100% as the crowd updates its belief. Right now traders can only bet on where it ends up.

Pythia lets you buy a CALL at a 50% strike when a market is at 40%. If the probability climbs above 50%, you're in the money. You never need to wait for the event to resolve. You're trading probability momentum.

---

## How It Works

### The Underlying
The YES% probability on any live Polymarket contract. It trades continuously, reacts to news, and has real volatility — exactly what options need.

### Contract Style
**American** — exercise any time before your expiry date. If the probability spikes on a news event, you capture the gain immediately. You are not forced to hold through a reversal.

### Expiry
Pythia options expire on a fixed date **before** the underlying Polymarket market resolves. You cash-settle at whatever the probability is on your expiry date. You never need to know or care how the event actually resolves.

**Auto-settlement:** If the underlying market resolves early (probability snaps to 0% or 100%), all open Pythia contracts on that market settle immediately at the resolution value.

### Pricing Model
Probability lives in [0, 1]. Black-Scholes assumes unbounded prices — it cannot be applied directly.

Instead we model the **logit transform** of probability:

```
L = logit(p) = ln(p / (1-p))     — unbounded, can follow Brownian motion
L_T ~ N(L₀, σ²τ)                 — driftless Brownian motion in logit space
p_T = sigmoid(L_T)                — invert back to probability
```

American options are priced via a **binomial tree** on this logit-normal model with backward induction. Greeks are computed by bump-and-reprice.

### Strike Grid
Strikes are discrete: 10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%.

Available strikes are dynamic per market — only strikes within 2.5 standard deviations (in logit space) of the current probability are shown. Contracts outside this window have no tradeable spread.

---

## Views

### Simple View
Built for everyone. Big probability gauge. CALL / PUT buttons. Strike selector (snaps to nearest grid point). One payoff card: "You win $X if YES% hits Y%."

### Pro View
Built for traders. Full options chain across strikes and expiries. Live Greeks (Δ, Θ, ν, Γ) with visual bars. Implied probability distribution curve. Early exercise boundary — shows exactly when to pull the trigger on your American option.

---

## Demo Simulation

The demo includes a historical replay mode: a real Polymarket market played back at accelerated speed showing a contract's full P&L evolution from entry to expiry. Theta decay is visible in real-time. News event spikes are annotated. The replay runs from pre-computed static data — no network dependency during the demo.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router (Vercel) |
| Pricing | Python / FastAPI (Fly.io) — scipy binomial tree |
| Market Data | Node / Bun (Fly.io) — Polymarket CLOB + Gamma API |
| Cache | Upstash Redis |
| Database | Neon (serverless Postgres) |

All market data flows server-side. The browser never calls Polymarket APIs directly .

---

## Key Files

- [ARCHITECTURE.md](ARCHITECTURE.md) — full infrastructure plan, pricing math, stress tests, ADRs, simulation design

---

## Hackathon

**Track:** Risk & Visualization
**Event:** Polymarket Hackathon
**Project:** Pythia — options on prediction market probabilities
