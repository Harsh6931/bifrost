# Bifrost — PRD & Build Plan

**An intelligent LLM router that picks the cheapest model that still answers well.**

Status: pre-implementation · Last updated: 2026-08-29

---

## 1. Problem

Teams default to the most expensive model for every prompt because they have no way to know which prompts actually need it. In practice a large fraction of traffic — reformatting, extraction, simple Q&A, boilerplate code — is answered just as well by a model costing 20–50× less.

Nobody downgrades manually because the tradeoff is invisible and per-prompt. Bifrost makes that decision automatically, per request, and shows its work.

## 2. Solution

A drop-in gateway that speaks the OpenAI API. Point any existing client at it by changing one line:

```python
client = OpenAI(base_url="https://api.bifrost.dev/v1", api_key=BIFROST_KEY)
```

For each prompt Bifrost embeds it, predicts how well each candidate model would answer, weighs that against each model's cost, routes to the winner, and logs what it saved versus always using a premium baseline.

### Non-goals

Not a fine-tuning platform. Not a prompt optimizer. Not a general LLM proxy with retries/failover/rate-limit handling — routing is the product; everything else is scope we are deliberately not taking on.

## 3. Users

| User | Need | What they see |
|---|---|---|
| Indie dev / small team | Cut a $400/mo bill without rewriting code | One-line base_url swap, savings dashboard |
| Eng lead at a startup | Justify model spend, show a number to finance | Cumulative savings vs. baseline, model mix over time |
| First-time evaluator | Understand the value in under a minute | Live playground: prompt → decision → *why* → savings |

## 4. Success criteria

- [ ] Existing OpenAI SDK code works against Bifrost with only `base_url` changed
- [ ] ≥40% cost reduction vs. always-premium on a held-out prompt set
- [ ] ≥95% of premium-baseline quality retained on that same set
- [ ] Routing overhead (embed + predict) < 50ms p95
- [ ] Every decision is explainable in one sentence a non-ML person understands

---

## 5. Architecture

### 5.1 Components

```
┌──────────────┐
│  Any OpenAI  │  base_url swap, no other change
│  SDK client  │
└──────┬───────┘
       │ POST /v1/chat/completions
       ▼
┌────────────────────────────────────────────┐
│  Gateway  (Rust · axum)          :8080     │
│  ─────────────────────────────────────────  │
│  auth → cache lookup → /route → dispatch   │
│  → stream response → log actuals           │
└───┬────────────────┬───────────────┬───────┘
    │ POST /route    │ chat request  │ SQL
    ▼                ▼               ▼
┌─────────────┐  ┌──────────┐  ┌─────────────┐
│ Router ML   │  │OpenRouter│  │  Postgres   │
│ FastAPI     │  │ upstream │  │  (Neon)     │
│ :8000       │  │          │  │             │
│             │  └──────────┘  └──────┬──────┘
│ fastembed   │                       │
│   ↓ 384-d   │                       │ read
│ kNN / LGBM  │                ┌──────▼──────┐
│   ↓         │                │  Next.js    │
│ score+pick  │                │  dashboard  │
└─────────────┘                │  :3000      │
                               └─────────────┘
```

**Why this split:** the ML service is a separate process so gateway and routing work are never blocked on each other — both sides code against the `/route` JSON contract from hour one. The localhost hop costs ~1ms against LLM calls measured in seconds.

**Why OpenRouter as the only upstream:** one API key, one request shape, every model, and it reports actual generation cost. Writing adapters for OpenAI + Google + Anthropic + DeepSeek separately is a full day of work that adds no product value. Keep a `LlmProvider` trait so a direct provider can be added later.

### 5.2 Request flow

1. Client sends OpenAI-shaped `POST /v1/chat/completions`
2. Gateway validates bearer token
3. Gateway hashes `(prompt, policy)` → checks response cache → **hit returns immediately, 100% savings**
4. Gateway calls `POST /route` on the ML service
5. ML service: embed prompt → kNN over labeled corpus → per-model predicted quality → pull prices from registry → composite score → pick winner
6. ML returns decision + all scores + explanation payload
7. Gateway dispatches the chat request to OpenRouter with the chosen model
8. Gateway streams tokens back to client (SSE) or returns a single JSON body
9. Gateway writes a `requests` row: predicted vs. actual, real cost, latency, baseline cost, savings
10. Dashboard reads aggregates from Postgres

### 5.3 The scoring function

For each candidate model *m*:

```
q̂(m)      = predicted quality ∈ [0,1]        (from kNN / LightGBM)
cost(m)    = (est_in_tok · price_in(m) + est_out_tok · price_out(m)) / 1e6
c_norm(m)  = (cost(m) − min_cost) / (max_cost − min_cost + ε)

score(m)   = q̂(m) − λ · c_norm(m)
```

Then `chosen = argmax score(m)` over candidates that pass hard filters (context length ≥ prompt tokens, `cost(m) ≤ policy.max_cost_usd`).

**λ is the product.** It is a single slider from 0 to 1:

| Mode | λ | Behavior |
|---|---|---|
| `quality` | 0.1 | Near-always premium; only downgrades on obvious easy prompts |
| `balanced` | 0.5 | Default |
| `cheap` | 0.9 | Downgrades unless the prompt clearly needs power |

Expose it in the UI as a live slider — watching the routing decision flip in real time is the clearest way to understand the tradeoff being made.

### 5.4 Quality prediction

**Baseline: k-NN retrieval.** Embed the prompt, find the *k*=10 nearest labeled prompts in the corpus, average each model's quality score across those neighbors.

Chosen deliberately over a black-box model because **it explains itself**. The UI can show the actual neighbor prompts:

> *"Routed to DeepSeek R1. Across 5 similar prompts in our dataset, DeepSeek scored within 3% of GPT-4o at 1/20th the cost."*

That sentence is worth more to a user than any SHAP plot.

**Upgrade: LightGBM** on `[embedding ‖ model_id] → quality`, trained on the same corpus. Better accuracy, but *keep k-NN running alongside as the explainer* regardless of which drives the decision.

**Implementation note:** at corpus scale (~400k prompt×model rows) a brute-force numpy matmul over a float32 matrix is sub-millisecond and ~55MB resident. No pgvector, no Qdrant. Load at startup, keep in memory.

### 5.5 Data

Primary: **RouterBench** (Martian, on HuggingFace) — prompts × ~11 models with quality scores and cost already labeled. This is close to the exact training table we need; verify the current schema on the dataset card before building the loader.

Supplement if time allows: LMSYS Chatbot Arena for human preference signal. Generating our own labels with LLM-as-judge is the *fallback*, not the plan — it burns hours and budget.

### 5.6 Database schema

```sql
-- Config-driven model list. This IS the "model-agnostic" feature.
-- Adding a model = one INSERT, no redeploy.
CREATE TABLE model_registry (
  id                TEXT PRIMARY KEY,        -- 'deepseek/deepseek-r1'
  display_name      TEXT NOT NULL,
  price_in_per_1m   NUMERIC NOT NULL,
  price_out_per_1m  NUMERIC NOT NULL,
  context_length    INT    NOT NULL,
  avg_latency_ms    INT,
  enabled           BOOLEAN DEFAULT true
);

CREATE TABLE requests (
  id                UUID PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT now(),
  prompt_hash       TEXT NOT NULL,
  prompt_preview    TEXT,                    -- first 200 chars, for the dashboard
  policy_mode       TEXT,
  lambda            REAL,
  chosen_model      TEXT REFERENCES model_registry(id),
  pred_quality      REAL,
  est_cost_usd      NUMERIC,
  actual_in_tokens  INT,
  actual_out_tokens INT,
  actual_cost_usd   NUMERIC,
  latency_ms        INT,
  baseline_model    TEXT,                    -- what always-premium would have cost
  baseline_cost_usd NUMERIC,
  savings_usd       NUMERIC,
  cache_hit         BOOLEAN DEFAULT false,
  explanation       JSONB
);
CREATE INDEX ON requests (created_at DESC);
CREATE INDEX ON requests (prompt_hash);

CREATE TABLE response_cache (
  prompt_hash  TEXT PRIMARY KEY,
  model        TEXT NOT NULL,
  response     JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  hits         INT DEFAULT 0
);
```

### 5.7 API contracts

**Agree on these before anyone writes code.** They are what let the components be built in parallel — each side stubs the other and integrates later.

```jsonc
// ── Gateway → ML service ──────────────────────────
POST /route
{
  "prompt": "explain CRDTs to a backend engineer",
  "candidates": ["openai/gpt-4o", "deepseek/deepseek-r1", "google/gemini-flash-1.5"],
  "policy": { "mode": "balanced", "lambda": 0.5, "max_cost_usd": 0.01 }
}

// ── ML service → Gateway ──────────────────────────
{
  "chosen": "deepseek/deepseek-r1",
  "scores": [
    { "model": "deepseek/deepseek-r1", "pred_quality": 0.89,
      "est_cost_usd": 0.0004, "est_latency_ms": 3100, "score": 0.83 },
    { "model": "openai/gpt-4o", "pred_quality": 0.92,
      "est_cost_usd": 0.0190, "est_latency_ms": 1800, "score": 0.42 }
  ],
  "explanation": {
    "method": "knn",
    "summary": "5 similar prompts where DeepSeek matched GPT-4o within 3%",
    "neighbors": [
      { "prompt": "walk me through vector clocks", "winner": "deepseek/deepseek-r1", "sim": 0.91 }
    ],
    "baseline_model": "openai/gpt-4o",
    "est_savings_usd": 0.0186
  },
  "timing_ms": { "embed": 4, "predict": 2 }
}
```

Gateway also exposes `GET /v1/route/explain?request_id=…` returning the stored `explanation` blob, and `POST /v1/route/preview` which runs step 5 only — decision without dispatch. The playground uses `preview` so it can show the decision before spending money.

### 5.8 Repo layout

```
bifrost/
├── gateway/            # Rust · axum
│   ├── src/
│   │   ├── main.rs
│   │   ├── routes/     # /v1/chat/completions, /v1/route/*
│   │   ├── providers/  # LlmProvider trait + openrouter impl
│   │   ├── db.rs
│   │   └── telemetry.rs
│   └── Cargo.toml
├── router-ml/          # Python · FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── embed.py    # fastembed wrapper
│   │   ├── knn.py
│   │   ├── scoring.py  # the composite function
│   │   └── registry.py
│   ├── notebooks/      # data exploration, training
│   └── pyproject.toml  # uv
├── web/                # Next.js 15
│   ├── app/
│   │   ├── playground/
│   │   └── dashboard/
│   └── components/
├── packages/types/     # shared TS types generated from contracts
├── migrations/
├── docker-compose.yml  # postgres only
└── PRD.md
```

### 5.9 Stack summary

| Layer | Choice | Why |
|---|---|---|
| Gateway | Rust, axum, tokio, reqwest, sqlx | Low-overhead concurrent I/O; credible "gateway" story |
| Upstream | OpenRouter | One key, all models, reports real cost |
| Embeddings | `fastembed` + `bge-small-en-v1.5` (384-d) | Local, ~5ms, free — a router shouldn't make an API call to save money |
| Predictor | k-NN (numpy) → LightGBM | Explains itself; works with small data |
| ML service | FastAPI + uvicorn, `uv` for env | Fast to build, unblocks parallel work |
| DB | Postgres on Neon | One store for relational + logs; zero setup |
| Web | Next.js 15, TS, Tailwind, shadcn/ui, Recharts | Fastest path to a polished playground + dashboard |
| Deploy | Vercel (web), Fly.io (gateway + ML) | Dockerfile deploys, generous free tiers |

**Deliberately skipped:** Redis, vector DB, real auth, provider failover, multi-tenancy. Each is a real product need, and none is required to prove the routing thesis.

`fastembed` is chosen specifically because [`fastembed-rs`](https://github.com/Anush008/fastembed-rs) runs the same ONNX models — so collapsing the Python service into the Rust binary later produces identical vectors. Free migration path, no commitment now.
