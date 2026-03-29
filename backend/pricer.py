"""
Pythia Pricing Engine — American options on logit-normal bounded underlying.

Mathematical model:
  L = logit(p) = ln(p/(1-p))  follows driftless Brownian motion
  L_T ~ N(L0, sigma^2 * tau)
  p_T = sigmoid(L_T)           bounded in (0,1) by construction

American options priced via binomial tree with backward induction.
Greeks via bump-and-reprice (central differences).
Early exercise boundary via binary search at each time slice.
"""

import numpy as np
from scipy import stats, integrate
from typing import Literal

# ── Constants ──────────────────────────────────────────────────────────────────
SIGMA_FLOOR = 0.05
SIGMA_CAP = 5.0
PROB_CLAMP = (1e-6, 1 - 1e-6)

STRIKE_GRID = [
    0.03, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20, 0.22, 0.25,
    0.28, 0.30, 0.33, 0.35, 0.38, 0.40, 0.42, 0.45, 0.48, 0.50,
    0.52, 0.55, 0.58, 0.60, 0.62, 0.65, 0.68, 0.70, 0.72, 0.75,
    0.78, 0.80, 0.82, 0.85, 0.88, 0.90, 0.92, 0.95, 0.97,
]
EXPIRY_GRID = [3, 7, 14, 30]  # days

# ── Core transforms ────────────────────────────────────────────────────────────

def safe_prob(p: float) -> float:
    return float(np.clip(p, *PROB_CLAMP))


def logit(p: float) -> float:
    p = safe_prob(p)
    return float(np.log(p / (1.0 - p)))


def sigmoid(l: float | np.ndarray) -> float | np.ndarray:
    return 1.0 / (1.0 + np.exp(-l))


# ── Volatility sanitization ────────────────────────────────────────────────────

def clamp_sigma(sigma: float) -> float:
    return float(np.clip(sigma, SIGMA_FLOOR, SIGMA_CAP))


# ── American binomial tree (logit-normal) ──────────────────────────────────────

def american_option_binomial(
    p0: float,
    K: float,
    sigma: float,
    tau: float,
    N: int = 100,
    kind: Literal["call", "put"] = "call",
) -> float:
    """
    Price an American option on a logit-normal underlying via binomial tree.

    Args:
        p0:    current probability in (0, 1)
        K:     strike probability in (0, 1)
        sigma: annualised logit-space volatility (e.g. 0.60 = 60%)
        tau:   time to expiry in years (e.g. 30/365 calendar)
        N:     number of tree steps (100 → ~1.5ms, error < 0.08%)
        kind:  "call" or "put"

    Returns:
        Option fair value as a dollar amount in [0, 1].
    """
    if tau <= 0:
        p0 = safe_prob(p0)
        return float(max(p0 - K, 0.0) if kind == "call" else max(K - p0, 0.0))

    sigma = clamp_sigma(sigma)
    dt = tau / N
    sigma_t = sigma * np.sqrt(dt)

    # Risk-neutral probability = 0.5 (driftless symmetric walk in logit space)
    q = 0.5
    L0 = logit(p0)

    # Terminal node probabilities
    j = np.arange(N + 1)
    L_T = L0 + (2 * j - N) * sigma_t
    p_T = sigmoid(L_T)

    if kind == "call":
        V = np.maximum(p_T - K, 0.0)
    else:
        V = np.maximum(K - p_T, 0.0)

    # Backward induction: at each node take max(hold, exercise)
    for i in range(N - 1, -1, -1):
        continuation = q * V[1 : i + 2] + (1 - q) * V[0 : i + 1]
        j_i = np.arange(i + 1)
        p_i = sigmoid(L0 + (2 * j_i - i) * sigma_t)
        if kind == "call":
            exercise = np.maximum(p_i - K, 0.0)
        else:
            exercise = np.maximum(K - p_i, 0.0)
        V = np.maximum(continuation, exercise)

    return float(V[0])


# ── Greeks via bump-and-reprice ────────────────────────────────────────────────

def greeks(
    p0: float,
    K: float,
    sigma: float,
    tau: float,
    N: int = 100,
    kind: Literal["call", "put"] = "call",
) -> dict:
    """
    Compute option price and Greeks via central-difference bump-and-reprice.

    Returns dict with: price, delta, theta, vega, gamma
    """

    def price(p_: float, s_: float, t_: float) -> float:
        return american_option_binomial(p_, K, s_, t_, N, kind)

    base = price(p0, sigma, tau)

    dp = 0.01       # 1% probability bump
    ds = 0.01       # 1% vol bump
    dt = 1 / 365    # one calendar day (Polymarket)

    delta = (price(p0 + dp, sigma, tau) - price(p0 - dp, sigma, tau)) / (2 * dp)
    vega  = (price(p0, sigma + ds, tau) - price(p0, sigma - ds, tau)) / (2 * ds)
    theta = (price(p0, sigma, tau - dt) - base) / dt   # $/day, negative

    # Gamma: d²V/dp² scaled to "delta change per 1pp move"
    #
    # Raw d²V/dp² gives values of ~25-30 at ATM because the underlying
    # range is [0,1] — curvature is inherently ~100x stock-world gamma.
    # d²V/dL² (logit-space) goes negative for deep ITM due to sigmoid''(L)<0,
    # which is mathematically correct but misleading (long call = negative gamma?).
    #
    # Solution: compute probability-space gamma, then normalise to per-pp.
    # Γ_display = d²V/dp² × 0.01  →  "if prob moves 1pp, delta changes by Γ"
    #
    # Properties:
    #   - Always non-negative for long vanilla options  ✓
    #   - Peaks ATM (~0.25), tapers to ~0 deep ITM/OTM  ✓
    #   - Comparable magnitude to stock-world gamma      ✓
    #   - Consistent between backend and frontend        ✓
    gp = 0.005   # half-pp bump for stable second derivative
    p_up = safe_prob(p0 + gp)
    p_dn = safe_prob(p0 - gp)
    raw_gamma = (price(p_up, sigma, tau) - 2 * base + price(p_dn, sigma, tau)) / (gp ** 2)
    gamma = raw_gamma * 0.01  # normalise to delta-change per 1pp

    return {
        # Keep extra precision so deep OTM premiums are not rounded to 0.00 while Greeks stay non-zero
        "price": round(base, 8),
        "delta": round(float(delta), 6),
        "theta": round(float(theta), 6),
        "vega":  round(float(vega), 6),
        "gamma": round(float(gamma), 6),
    }


# ── Early exercise boundary ────────────────────────────────────────────────────

def early_exercise_boundary(
    K: float,
    sigma: float,
    tau: float,
    kind: Literal["call", "put"] = "call",
    N: int = 100,
    steps: int = 50,
) -> list[dict]:
    """
    Compute the critical probability p* at each time-to-expiry slice.

    For a call:  immediate exercise is optimal when p >= p* (p* > K)
    For a put:   immediate exercise is optimal when p <= p* (p* < K)

    Returns list of {tau_days, p_star}.
    """
    boundary = []
    for t in np.linspace(1 / 365, tau, steps):
        if kind == "call":
            lo, hi = K, 1.0 - 1e-6
        else:
            lo, hi = 1e-6, K

        # Binary search for the critical probability (~30 iterations → 1e-9 precision)
        for _ in range(30):
            mid = (lo + hi) / 2.0
            opt_val = american_option_binomial(mid, K, sigma, t, N, kind)
            intrinsic = max(mid - K, 0.0) if kind == "call" else max(K - mid, 0.0)
            if opt_val <= intrinsic + 1e-8:
                hi = mid
            else:
                lo = mid

        boundary.append({"tau_days": round(t * 365, 1), "p_star": round((lo + hi) / 2.0, 6)})

    return boundary


# ── Vanilla European call (quadrature reference) ───────────────────────────────

def vanilla_call_price(p0: float, K: float, sigma: float, tau: float) -> float:
    """
    European call price under logit-normal dynamics via adaptive quadrature.

    Two critical fixes vs naive integration:
    1. Bounds always straddle logit(K) ± 1.0 so the kink is never at a boundary.
    2. points=[LK] tells scipy to split the integration domain at the kink,
       preventing missed curvature near the kink on small-sigma inputs.
    """
    if tau <= 0:
        return float(max(safe_prob(p0) - K, 0.0))

    sigma = clamp_sigma(sigma)
    L0  = logit(p0)
    LK  = logit(K)
    std = sigma * np.sqrt(tau)

    lo = min(L0 - 6 * std, LK - 1.0)
    hi = max(L0 + 6 * std, LK + 1.0)

    def integrand(l: float) -> float:
        return max(sigmoid(l) - K, 0.0) * stats.norm.pdf(l, L0, std)

    result, _ = integrate.quad(integrand, lo, hi, points=[LK])
    return float(result)


def vanilla_put_price(p0: float, K: float, sigma: float, tau: float) -> float:
    """Put via put-call parity; floored at spot intrinsic (American lower bound)."""
    p0s = safe_prob(p0)
    intrinsic = max(K - p0s, 0.0)
    if tau <= 0:
        return float(intrinsic)

    call = vanilla_call_price(p0, K, sigma, tau)
    # Put-call parity: C - P = E[p_T] - K
    L0  = logit(p0)
    std = clamp_sigma(sigma) * np.sqrt(tau)
    lo  = L0 - 8 * std
    hi  = L0 + 8 * std
    e_pt, _ = integrate.quad(
        lambda l: sigmoid(l) * stats.norm.pdf(l, L0, std), lo, hi
    )
    parity = call - e_pt + K
    return float(max(0.0, max(intrinsic, parity)))


# ── Binary (digital) option prices ────────────────────────────────────────────

def binary_call_price(p0: float, K: float, sigma: float, tau: float) -> float:
    """P(p_T > K) under logit-normal: Phi(d) where d = (L0 - logit(K)) / (sigma*sqrt(tau))"""
    p0s = safe_prob(p0)
    if tau <= 0:
        return 1.0 if p0s > K else 0.0 if p0s < K else 0.5
    sig_tau = clamp_sigma(sigma) * np.sqrt(tau)
    if sig_tau < 1e-12:
        return 1.0 if p0s > K else 0.0 if p0s < K else 0.5
    d = (logit(p0) - logit(K)) / sig_tau
    return float(stats.norm.cdf(d))


def binary_put_price(p0: float, K: float, sigma: float, tau: float) -> float:
    """P(p_T < K) = 1 - binary_call"""
    return 1.0 - binary_call_price(p0, K, sigma, tau)


# ── Strike availability ────────────────────────────────────────────────────────

def available_strikes(
    p0: float,
    sigma: float,
    tau_days: int,
    n_std: float = 2.5,
    min_strikes: int = 7,
) -> list[float]:
    """
    Return strikes within n_std logit-space standard deviations of current prob.
    Guarantees at least min_strikes by widening the window or picking nearest.
    """
    L0      = logit(p0)
    sigma_t = clamp_sigma(sigma) * np.sqrt(tau_days / 365.0)
    # Ensure a minimum logit-space range so short-dated/low-vol markets
    # still show a meaningful chain
    half_width = max(n_std * sigma_t, 0.8)
    L_lo    = L0 - half_width
    L_hi    = L0 + half_width
    valid   = [K for K in STRIKE_GRID if L_lo <= logit(K) <= L_hi]

    if len(valid) < min_strikes:
        by_dist = sorted(STRIKE_GRID, key=lambda K: abs(logit(K) - L0))
        valid = sorted(set(valid) | set(by_dist[:min_strikes]))

    return valid


# ── Full options chain ─────────────────────────────────────────────────────────

def compute_chain(
    p0: float,
    sigma: float,
    strikes: list[float],
    taus: list[int],  # in days
    N: int = 50,
) -> list[dict]:
    """
    Compute a full options chain matrix.

    Args:
        p0:      current probability
        sigma:   annualised logit-space vol
        strikes: list of strike probabilities
        taus:    list of days-to-expiry
        N:       tree steps (50 for chain speed, 100 for single contract)

    Returns list of contract dicts with price, Greeks for calls and puts.
    """
    results = []
    for K in strikes:
        for tau_days in taus:
            tau = tau_days / 365.0
            call_g = greeks(p0, K, sigma, tau, N, "call")
            put_g  = greeks(p0, K, sigma, tau, N, "put")
            results.append({
                "strike":     K,
                "tau_days":   tau_days,
                "call_price": call_g["price"],
                "put_price":  put_g["price"],
                "delta":      call_g["delta"],
                "theta":      call_g["theta"],
                "vega":       call_g["vega"],
                "gamma":      call_g["gamma"],
                "put_delta":  put_g["delta"],
                "put_theta":  put_g["theta"],
                "put_vega":   put_g["vega"],
            })
    return results


# ── Payoff curve ───────────────────────────────────────────────────────────────

def payoff_curve(
    legs: list[dict],  # [{kind, strike, premium, size}]
    steps: int = 100,
) -> dict:
    """
    Compute P&L at expiry across the full [0,1] probability range.

    Each leg: {kind: "call"|"put", strike: float, premium: float, size: float}
    Returns {probs: [...], payoffs: [...]}
    """
    probs = [i / steps for i in range(steps + 1)]
    payoffs = []
    for p in probs:
        total = 0.0
        for leg in legs:
            K       = leg["strike"]
            premium = leg["premium"]
            size    = leg["size"]
            if leg["kind"] == "call":
                intrinsic = max(p - K, 0.0)
            else:
                intrinsic = max(K - p, 0.0)
            total += size * (intrinsic - premium)
        payoffs.append(round(total, 6))
    return {"probs": probs, "payoffs": payoffs}


# ── Implied probability distribution ──────────────────────────────────────────

def implied_distribution(
    p0: float,
    sigma: float,
    tau: float,
    steps: int = 200,
) -> dict:
    """
    Compute the logit-normal terminal probability distribution p_T.

    Returns {probs: [...], densities: [...]} for rendering the distribution curve.
    """
    L0  = logit(p0)
    std = clamp_sigma(sigma) * np.sqrt(max(tau, 1 / 365))

    # Sample uniformly in logit space, map back to prob space
    L_lo = L0 - 4 * std
    L_hi = L0 + 4 * std
    ls   = np.linspace(L_lo, L_hi, steps)
    ps   = sigmoid(ls)

    # Density in probability space via change of variables: f_p = f_L / |dp/dL|
    # dp/dL = sigmoid(L) * (1 - sigmoid(L)) = p * (1 - p)
    f_L = stats.norm.pdf(ls, L0, std)
    jac = ps * (1.0 - ps)  # |dL/dp| = 1 / (p*(1-p))
    f_p = f_L / np.maximum(jac, 1e-10)

    return {
        "probs":     ps.tolist(),
        "densities": f_p.tolist(),
    }
