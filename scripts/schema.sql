-- ProbX database schema

-- Raw probability time-series
CREATE TABLE IF NOT EXISTS prob_series (
  condition_id  TEXT NOT NULL,
  ts            TIMESTAMPTZ NOT NULL,
  prob          DOUBLE PRECISION NOT NULL CHECK (prob > 0 AND prob < 1),
  PRIMARY KEY (condition_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_prob_series_cond_ts
  ON prob_series (condition_id, ts DESC);

-- Markets metadata
CREATE TABLE IF NOT EXISTS markets (
  condition_id      TEXT PRIMARY KEY,
  question          TEXT NOT NULL,
  category          TEXT,
  resolution_ts     TIMESTAMPTZ,
  resolved          BOOLEAN DEFAULT FALSE,
  resolution_value  DOUBLE PRECISION,
  current_prob      DOUBLE PRECISION,
  current_vol       DOUBLE PRECISION,
  vol_source        TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pre-computed simulation series (one row per tick of replay)
CREATE TABLE IF NOT EXISTS simulation_series (
  sim_id        TEXT NOT NULL,
  tick          INTEGER NOT NULL,
  ts_actual     TIMESTAMPTZ NOT NULL,
  prob          DOUBLE PRECISION NOT NULL,
  option_value  DOUBLE PRECISION NOT NULL,
  pnl           DOUBLE PRECISION NOT NULL,
  pnl_pct       DOUBLE PRECISION NOT NULL,
  delta         DOUBLE PRECISION,
  theta         DOUBLE PRECISION,
  vega          DOUBLE PRECISION,
  event_label   TEXT,
  PRIMARY KEY (sim_id, tick)
);

-- Vol snapshots for chain
CREATE TABLE IF NOT EXISTS vol_snapshots (
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
