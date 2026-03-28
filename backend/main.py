"""
Pythia Pricing Service — FastAPI
Stateless pure-math service: no DB access, no external calls.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
import time
from typing import Literal

from pricer import (
    american_option_binomial,
    greeks,
    early_exercise_boundary,
    vanilla_call_price,
    vanilla_put_price,
    binary_call_price,
    binary_put_price,
    compute_chain,
    payoff_curve,
    implied_distribution,
    available_strikes,
    safe_prob,
    clamp_sigma,
    STRIKE_GRID,
    EXPIRY_GRID,
)

app = FastAPI(
    title="Pythia Pricing Service",
    description="American options on logit-normal bounded underlying",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tightened in prod via env
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────────────────────────

class PriceRequest(BaseModel):
    p0:       float = Field(..., gt=0, lt=1, description="Current probability")
    strike:   float = Field(..., gt=0, lt=1, description="Strike probability")
    tau_days: int   = Field(..., gt=0, le=365, description="Days to expiry")
    sigma:    float = Field(..., gt=0, description="Annualised logit-space vol")
    kind:     Literal["call", "put"] = "call"
    n_steps:  int   = Field(100, ge=10, le=500)

    @field_validator("sigma")
    @classmethod
    def clamp_vol(cls, v: float) -> float:
        return clamp_sigma(v)


class PriceResponse(BaseModel):
    price: float
    delta: float
    theta: float
    vega:  float
    gamma: float
    tau_days: int
    kind:  str


class ChainRequest(BaseModel):
    p0:      float = Field(..., gt=0, lt=1)
    sigma:   float = Field(..., gt=0)
    strikes: list[float] | None = None   # None → use available_strikes
    taus:    list[int]   | None = None   # None → use EXPIRY_GRID
    n_steps: int = Field(50, ge=10, le=200)

    @field_validator("sigma")
    @classmethod
    def clamp_vol(cls, v: float) -> float:
        return clamp_sigma(v)


class BoundaryRequest(BaseModel):
    K:        float = Field(..., gt=0, lt=1)
    sigma:    float = Field(..., gt=0)
    tau_days: int   = Field(..., gt=0, le=365)
    kind:     Literal["call", "put"] = "call"
    n_steps:  int   = Field(100, ge=10, le=500)
    steps:    int   = Field(50, ge=10, le=200)

    @field_validator("sigma")
    @classmethod
    def clamp_vol(cls, v: float) -> float:
        return clamp_sigma(v)


class PayoffLeg(BaseModel):
    kind:    Literal["call", "put"]
    strike:  float = Field(..., gt=0, lt=1)
    premium: float = Field(..., ge=0)
    size:    float = Field(1.0)


class PayoffRequest(BaseModel):
    legs:  list[PayoffLeg]
    steps: int = Field(100, ge=20, le=500)


class DistributionRequest(BaseModel):
    p0:       float = Field(..., gt=0, lt=1)
    sigma:    float = Field(..., gt=0)
    tau_days: int   = Field(..., gt=0, le=365)
    steps:    int   = Field(200, ge=50, le=1000)

    @field_validator("sigma")
    @classmethod
    def clamp_vol(cls, v: float) -> float:
        return clamp_sigma(v)


class StrikesRequest(BaseModel):
    p0:       float = Field(..., gt=0, lt=1)
    sigma:    float = Field(..., gt=0)
    tau_days: int   = Field(..., gt=0, le=365)
    n_std:    float = Field(2.5, gt=0, le=5.0)

    @field_validator("sigma")
    @classmethod
    def clamp_vol(cls, v: float) -> float:
        return clamp_sigma(v)


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "pricing"}


@app.post("/price", response_model=PriceResponse)
def price_contract(req: PriceRequest):
    """Price a single American option contract + compute Greeks."""
    t0  = time.perf_counter()
    tau = req.tau_days / 252.0

    g = greeks(req.p0, req.strike, req.sigma, tau, req.n_steps, req.kind)
    g["tau_days"] = req.tau_days
    g["kind"]     = req.kind
    g["_ms"]      = round((time.perf_counter() - t0) * 1000, 2)
    return g


@app.post("/chain")
def price_chain(req: ChainRequest):
    """
    Compute the full options chain across strikes × expiries.
    Returns list of contract rows ready for the OptionsChain component.
    """
    t0 = time.perf_counter()

    taus    = req.taus    or EXPIRY_GRID
    strikes = req.strikes or available_strikes(req.p0, req.sigma, taus[-1])

    chain = compute_chain(req.p0, req.sigma, strikes, taus, req.n_steps)
    return {
        "chain":           chain,
        "available_strikes": strikes,
        "_ms": round((time.perf_counter() - t0) * 1000, 2),
    }


@app.post("/boundary")
def exercise_boundary(req: BoundaryRequest):
    """
    Compute the early exercise boundary curve.
    Used in Pro View to render p* vs time-to-expiry.
    """
    t0  = time.perf_counter()
    tau = req.tau_days / 252.0

    boundary = early_exercise_boundary(
        req.K, req.sigma, tau, req.kind, req.n_steps, req.steps
    )
    return {
        "boundary": boundary,
        "kind":     req.kind,
        "K":        req.K,
        "_ms": round((time.perf_counter() - t0) * 1000, 2),
    }


@app.post("/payoff")
def payoff_at_expiry(req: PayoffRequest):
    """Compute P&L curve at expiry for a (potentially multi-leg) position."""
    legs = [leg.model_dump() for leg in req.legs]
    return payoff_curve(legs, req.steps)


@app.post("/distribution")
def prob_distribution(req: DistributionRequest):
    """
    Return the logit-normal terminal probability distribution.
    Used to render the implied distribution curve above the chain.
    """
    tau = req.tau_days / 252.0
    return implied_distribution(req.p0, req.sigma, tau, req.steps)


@app.post("/strikes")
def strikes_available(req: StrikesRequest):
    """Return dynamically available strikes for a market."""
    strikes = available_strikes(req.p0, req.sigma, req.tau_days, req.n_std)
    return {"strikes": strikes}


@app.post("/vanilla")
def vanilla_prices(req: PriceRequest):
    """European vanilla call/put prices for reference (quadrature method)."""
    tau = req.tau_days / 252.0
    if req.kind == "call":
        price = vanilla_call_price(req.p0, req.strike, req.sigma, tau)
    else:
        price = vanilla_put_price(req.p0, req.strike, req.sigma, tau)
    return {"price": round(price, 6), "kind": req.kind, "method": "quadrature"}


@app.post("/binary")
def binary_prices(req: PriceRequest):
    """Digital (binary) option prices — P(p_T > K) for call, P(p_T < K) for put."""
    tau = req.tau_days / 252.0
    if req.kind == "call":
        price = binary_call_price(req.p0, req.strike, req.sigma, tau)
    else:
        price = binary_put_price(req.p0, req.strike, req.sigma, tau)
    return {"price": round(price, 6), "kind": req.kind}
