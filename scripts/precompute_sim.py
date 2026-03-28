#!/usr/bin/env python3
"""
Pre-compute a ProbX demo simulation and insert into Postgres.

Usage:
    python scripts/precompute_sim.py \
        --condition-id 0x... \
        --sim-id demo_eth_call \
        --kind call \
        --strike 0.5 \
        --entry-day 0 \
        --expiry-days 30

Requires: DATABASE_URL env var, pricing-service running on localhost:8000
"""

import argparse
import json
import os
import sys
import httpx
import psycopg2
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pricing-service"))
from pricer import american_option_binomial, greeks as compute_greeks, clamp_sigma


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--condition-id", required=True)
    parser.add_argument("--sim-id",       required=True)
    parser.add_argument("--kind",         default="call", choices=["call", "put"])
    parser.add_argument("--strike",       type=float, default=0.5)
    parser.add_argument("--expiry-days",  type=int,   default=30)
    parser.add_argument("--sigma",        type=float, default=None,
                        help="Override vol. If not set, fetches from Polymarket history.")
    args = parser.parse_args()

    db_url = os.environ["DATABASE_URL"]
    conn   = psycopg2.connect(db_url)
    cur    = conn.cursor()

    # Fetch historical p(t) series
    print(f"Fetching history for {args.condition_id}...")
    cur.execute(
        """
        SELECT ts, prob FROM prob_series
        WHERE condition_id = %s
        ORDER BY ts ASC
        """,
        (args.condition_id,),
    )
    rows = cur.fetchall()
    if not rows:
        print("No historical data found. Exiting.")
        sys.exit(1)

    probs = [float(r[1]) for r in rows]
    dates = [r[0] for r in rows]

    # Estimate vol from history
    from pricer import clamp_sigma
    if args.sigma:
        sigma = clamp_sigma(args.sigma)
    else:
        import numpy as np
        clamped = [max(1e-6, min(1-1e-6, p)) for p in probs]
        logits  = [float(np.log(p/(1-p))) for p in clamped]
        diffs   = [logits[i+1]-logits[i] for i in range(len(logits)-1)]
        diffs   = [d for d in diffs if abs(d) < 5]  # rough winsorise
        sigma   = clamp_sigma(float(np.std(diffs, ddof=1)) * np.sqrt(252))

    print(f"Sigma = {sigma:.4f}")

    # Subset to expiry window
    series_probs = probs[:args.expiry_days + 1]
    series_dates = dates[:args.expiry_days + 1]

    # Entry premium
    entry_prob = series_probs[0]
    entry_tau  = args.expiry_days / 252.0
    premium    = american_option_binomial(entry_prob, args.strike, sigma, entry_tau, 100, args.kind)
    print(f"Entry: p={entry_prob:.3f}, premium=${premium:.4f}")

    # Pre-compute each tick
    sim_rows = []
    for i, (prob, ts) in enumerate(zip(series_probs, series_dates)):
        tau_remaining = max((args.expiry_days - i) / 252.0, 0)
        opt_val = american_option_binomial(prob, args.strike, sigma, tau_remaining, 100, args.kind)
        pnl     = opt_val - premium
        pnl_pct = pnl / premium if premium > 0 else 0

        g = compute_greeks(prob, args.strike, sigma, tau_remaining, 100, args.kind)

        # Detect big moves for annotation
        event_label = None
        if i > 0:
            delta_prob = abs(prob - series_probs[i-1])
            if delta_prob > 0.08:
                direction = "↑" if prob > series_probs[i-1] else "↓"
                event_label = f"Prob jump {direction} {delta_prob*100:.0f}pp"

        sim_rows.append({
            "tick":         i,
            "ts_actual":    ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            "prob":         round(prob, 6),
            "option_value": round(opt_val, 6),
            "pnl":          round(pnl, 6),
            "pnl_pct":      round(pnl_pct, 6),
            "delta":        round(g["delta"], 6),
            "theta":        round(g["theta"], 6),
            "vega":         round(g["vega"], 6),
            "event_label":  event_label,
        })

    print(f"Computed {len(sim_rows)} ticks.")

    # Insert into DB
    cur.execute(
        "DELETE FROM simulation_series WHERE sim_id = %s",
        (args.sim_id,)
    )
    for row in sim_rows:
        cur.execute(
            """
            INSERT INTO simulation_series
              (sim_id, tick, ts_actual, prob, option_value, pnl, pnl_pct, delta, theta, vega, event_label)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                args.sim_id, row["tick"], row["ts_actual"],
                row["prob"], row["option_value"], row["pnl"], row["pnl_pct"],
                row["delta"], row["theta"], row["vega"], row["event_label"],
            ),
        )

    conn.commit()
    cur.close()
    conn.close()
    print(f"Done. Simulation '{args.sim_id}' written ({len(sim_rows)} ticks).")


if __name__ == "__main__":
    main()
