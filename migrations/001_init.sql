-- Bifrost initial schema from PRD §5.6
-- Run: psql $DATABASE_URL -f migrations/001_init.sql

CREATE TABLE IF NOT EXISTS model_registry (
  id                TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  price_in_per_1m   NUMERIC NOT NULL,
  price_out_per_1m  NUMERIC NOT NULL,
  context_length    INT    NOT NULL,
  avg_latency_ms    INT,
  enabled           BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS requests (
  id                UUID PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT now(),
  prompt_hash       TEXT NOT NULL,
  prompt_preview    TEXT,
  policy_mode       TEXT,
  lambda            REAL,
  chosen_model      TEXT REFERENCES model_registry(id),
  pred_quality      REAL,
  est_cost_usd      NUMERIC,
  actual_in_tokens  INT,
  actual_out_tokens INT,
  actual_cost_usd   NUMERIC,
  latency_ms        INT,
  baseline_model    TEXT,
  baseline_cost_usd NUMERIC,
  savings_usd       NUMERIC,
  cache_hit         BOOLEAN DEFAULT false,
  explanation       JSONB
);

CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_prompt_hash ON requests (prompt_hash);

CREATE TABLE IF NOT EXISTS response_cache (
  prompt_hash  TEXT PRIMARY KEY,
  model        TEXT NOT NULL,
  response     JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  hits         INT DEFAULT 0
);
