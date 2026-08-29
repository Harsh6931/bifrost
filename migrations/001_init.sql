-- Bifrost initial schema
-- Runs automatically on first `docker compose up` (mounted into initdb.d).
-- To re-run from scratch: docker compose down -v && docker compose up

-- ─────────────────────────────────────────────────────────────
-- Model registry
-- Config-driven candidate list. Adding a model is one INSERT,
-- no redeploy. Prices are USD per 1M tokens.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE model_registry (
  id                TEXT PRIMARY KEY,          -- OpenRouter slug, e.g. 'deepseek/deepseek-r1'
  display_name      TEXT     NOT NULL,
  price_in_per_1m   NUMERIC  NOT NULL,
  price_out_per_1m  NUMERIC  NOT NULL,
  context_length    INT      NOT NULL,
  avg_latency_ms    INT,
  enabled           BOOLEAN  NOT NULL DEFAULT true
);

-- ─────────────────────────────────────────────────────────────
-- Request log
-- One row per routed request. Powers the whole dashboard.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE requests (
  id                UUID        PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  prompt_hash       TEXT        NOT NULL,
  prompt_preview    TEXT,                      -- first 200 chars, for the dashboard

  policy_mode       TEXT,                      -- 'quality' | 'balanced' | 'cheap'
  lambda            REAL,

  chosen_model      TEXT        REFERENCES model_registry(id),
  pred_quality      REAL,
  est_cost_usd      NUMERIC,

  actual_in_tokens  INT,
  actual_out_tokens INT,
  actual_cost_usd   NUMERIC,
  latency_ms        INT,

  baseline_model    TEXT,                      -- what always-premium would have cost
  baseline_cost_usd NUMERIC,
  savings_usd       NUMERIC,

  cache_hit         BOOLEAN     NOT NULL DEFAULT false,
  explanation       JSONB
);

CREATE INDEX requests_created_at_idx  ON requests (created_at DESC);
CREATE INDEX requests_prompt_hash_idx ON requests (prompt_hash);
CREATE INDEX requests_chosen_model_idx ON requests (chosen_model);

-- ─────────────────────────────────────────────────────────────
-- Exact-match response cache
-- A cache hit is a 100% saving, so it counts toward the numbers.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE response_cache (
  prompt_hash  TEXT        PRIMARY KEY,
  model        TEXT        NOT NULL,
  response     JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits         INT         NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- Seed: 6 candidates spanning a ~165x input price spread.
-- Prices pulled from OpenRouter 2026-08-29 — re-check before demo.
-- ─────────────────────────────────────────────────────────────
INSERT INTO model_registry
  (id, display_name, price_in_per_1m, price_out_per_1m, context_length, avg_latency_ms) VALUES
  ('openai/gpt-5.5',             'GPT-5.5',           5.00, 30.00, 1050000, 2400),
  ('anthropic/claude-sonnet-4.6','Claude Sonnet 4.6', 3.00, 15.00, 1000000, 2000),
  ('google/gemini-2.5-pro',      'Gemini 2.5 Pro',    1.25, 10.00, 1048576, 1900),
  ('deepseek/deepseek-r1',       'DeepSeek R1',       0.70,  2.50,   64000, 3400),
  ('openai/gpt-5-mini',          'GPT-5 mini',        0.25,  2.00,  400000, 1300),
  ('qwen/qwen3.7-flash',         'Qwen3.7 Flash',     0.03,  0.13, 1000000,  900);
