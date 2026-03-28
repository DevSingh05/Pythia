/**
 * Neon (serverless Postgres) client.
 * Uses @neondatabase/serverless for HTTP-compatible pooled connections.
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export { sql };

// ── Prob series ────────────────────────────────────────────────────────────────

export async function insertProbTick(
  condition_id: string,
  prob: number,
  ts: Date = new Date()
): Promise<void> {
  await sql`
    INSERT INTO prob_series (condition_id, ts, prob)
    VALUES (${condition_id}, ${ts.toISOString()}, ${prob})
    ON CONFLICT (condition_id, ts) DO NOTHING
  `;
}

export async function getProbHistory(
  condition_id: string,
  days: number = 30
): Promise<Array<{ ts: string; prob: number }>> {
  const rows = await sql`
    SELECT ts, prob
    FROM prob_series
    WHERE condition_id = ${condition_id}
      AND ts >= NOW() - INTERVAL '${days} days'
    ORDER BY ts DESC
    LIMIT 2000
  `;
  return rows as Array<{ ts: string; prob: number }>;
}

// ── Markets ────────────────────────────────────────────────────────────────────

export async function upsertMarket(market: {
  condition_id: string;
  question: string;
  category?: string;
  resolution_ts?: string;
}): Promise<void> {
  await sql`
    INSERT INTO markets (condition_id, question, category, resolution_ts, updated_at)
    VALUES (
      ${market.condition_id},
      ${market.question},
      ${market.category ?? null},
      ${market.resolution_ts ?? null},
      NOW()
    )
    ON CONFLICT (condition_id) DO UPDATE SET
      question      = EXCLUDED.question,
      category      = EXCLUDED.category,
      resolution_ts = EXCLUDED.resolution_ts,
      updated_at    = NOW()
  `;
}

export async function updateMarketProb(
  condition_id: string,
  prob: number,
  vol: number,
  vol_source: string
): Promise<void> {
  await sql`
    UPDATE markets
    SET current_prob = ${prob},
        current_vol  = ${vol},
        vol_source   = ${vol_source},
        updated_at   = NOW()
    WHERE condition_id = ${condition_id}
  `;
}

export async function resolveMarket(
  condition_id: string,
  value: 0 | 1
): Promise<void> {
  await sql`
    UPDATE markets
    SET resolved          = TRUE,
        resolution_value  = ${value},
        updated_at        = NOW()
    WHERE condition_id = ${condition_id}
  `;
}

export async function searchMarkets(
  query: string,
  limit: number = 20
): Promise<Array<{ condition_id: string; question: string; category: string; current_prob: number; current_vol: number }>> {
  const rows = await sql`
    SELECT condition_id, question, category, current_prob, current_vol
    FROM markets
    WHERE resolved = FALSE
      AND (question ILIKE ${"%" + query + "%"} OR category ILIKE ${"%" + query + "%"})
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;
  return rows as Array<{ condition_id: string; question: string; category: string; current_prob: number; current_vol: number }>;
}

export async function getMarket(condition_id: string) {
  const rows = await sql`
    SELECT * FROM markets WHERE condition_id = ${condition_id} LIMIT 1
  `;
  return rows[0] ?? null;
}

// ── Vol snapshots ──────────────────────────────────────────────────────────────

export async function insertVolSnapshot(
  condition_id: string,
  vol_data: Array<{
    strike: number;
    tau_days: number;
    call_price: number;
    put_price: number;
    delta: number;
    theta: number;
    vega: number;
    gamma: number;
  }>
): Promise<void> {
  for (const row of vol_data) {
    await sql`
      INSERT INTO vol_snapshots
        (condition_id, computed_at, strike, tau_days, call_price, put_price, delta, theta, vega, gamma)
      VALUES (
        ${condition_id}, NOW(), ${row.strike}, ${row.tau_days},
        ${row.call_price}, ${row.put_price}, ${row.delta}, ${row.theta}, ${row.vega}, ${row.gamma}
      )
    `;
  }
}

// ── Simulation series ──────────────────────────────────────────────────────────

export async function getSimulationSeries(sim_id: string) {
  const rows = await sql`
    SELECT *
    FROM simulation_series
    WHERE sim_id = ${sim_id}
    ORDER BY tick ASC
  `;
  return rows;
}

export async function listSimulations(): Promise<Array<{ sim_id: string; tick: number }>> {
  const rows = await sql`
    SELECT DISTINCT sim_id, MAX(tick) AS ticks
    FROM simulation_series
    GROUP BY sim_id
  `;
  return rows as Array<{ sim_id: string; tick: number }>;
}
