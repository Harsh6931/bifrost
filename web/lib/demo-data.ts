// Deterministic sample data so the dashboard is presentable before the
// gateway starts logging real traffic. Every widget derives from the same
// generated request list, so the tiles, charts and tables always agree.
//
// Swap off by setting NEXT_PUBLIC_BIFROST_DEMO=0 once the DB has rows.

import type {
  Explanation,
  ModelListResponse,
  ModelMixEntry,
  ModelRegistryRow,
  RequestListResponse,
  RequestRow,
  StatsResponse,
  StatsTimeseriesResponse,
  TimeseriesPoint,
} from "@/lib/types";

const BASELINE_MODEL = "openai/gpt-5.5";
const DAYS = 30;
const REQUEST_COUNT = 420;

interface DemoModel {
  id: string;
  display_name: string;
  price_in_per_1m: number;
  price_out_per_1m: number;
  context_length: number;
  avg_latency_ms: number;
  /** Predicted answer quality, 0..1. Anchors the scatter and the score bars. */
  quality: number;
  /** Share of routed traffic. Must sum to 1. */
  share: number;
}

// Mirrors the seed in migrations/001_init.sql.
const MODELS: DemoModel[] = [
  {
    id: "qwen/qwen3.7-flash",
    display_name: "Qwen3.7 Flash",
    price_in_per_1m: 0.03,
    price_out_per_1m: 0.13,
    context_length: 1_000_000,
    avg_latency_ms: 900,
    quality: 0.71,
    share: 0.30,
  },
  {
    id: "openai/gpt-5-mini",
    display_name: "GPT-5 mini",
    price_in_per_1m: 0.25,
    price_out_per_1m: 2.0,
    context_length: 400_000,
    avg_latency_ms: 1300,
    quality: 0.79,
    share: 0.25,
  },
  {
    id: "deepseek/deepseek-r1",
    display_name: "DeepSeek R1",
    price_in_per_1m: 0.7,
    price_out_per_1m: 2.5,
    context_length: 64_000,
    avg_latency_ms: 3400,
    quality: 0.84,
    share: 0.18,
  },
  {
    id: "google/gemini-2.5-pro",
    display_name: "Gemini 2.5 Pro",
    price_in_per_1m: 1.25,
    price_out_per_1m: 10.0,
    context_length: 1_048_576,
    avg_latency_ms: 1900,
    quality: 0.88,
    share: 0.14,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    display_name: "Claude Sonnet 4.6",
    price_in_per_1m: 3.0,
    price_out_per_1m: 15.0,
    context_length: 1_000_000,
    avg_latency_ms: 2000,
    quality: 0.91,
    share: 0.08,
  },
  {
    id: BASELINE_MODEL,
    display_name: "GPT-5.5",
    price_in_per_1m: 5.0,
    price_out_per_1m: 30.0,
    context_length: 1_050_000,
    avg_latency_ms: 2400,
    quality: 0.93,
    share: 0.05,
  },
];

const BY_ID = new Map(MODELS.map((model) => [model.id, model]));
const BASELINE = BY_ID.get(BASELINE_MODEL)!;

/** Prompts short enough to read in a table row, varied enough to look real. */
const PROMPTS = [
  "Summarise this changelog into three bullet points",
  "What's the capital of Australia?",
  "Refactor this reducer to use immer",
  "Explain CAP theorem to a new backend hire",
  "Translate the onboarding email into Japanese",
  "Write a regex for semantic version strings",
  "Why is my Postgres query doing a seq scan?",
  "Draft a polite follow-up to an unanswered invoice",
  "Convert this cURL command to Python requests",
  "Give me 5 title options for a launch blog post",
  "Prove that the halting problem is undecidable",
  "Fix the off-by-one in this binary search",
  "What does HTTP 418 mean?",
  "Design a schema for multi-tenant audit logs",
  "Rewrite this paragraph in plain English",
  "Is 1729 a prime number?",
  "Outline a migration plan from REST to gRPC",
  "Turn these notes into a standup update",
  "Explain the difference between RAG and fine-tuning",
  "What time zone is UTC+5:30?",
];

const MODES = ["cheap", "balanced", "quality"] as const;
const MODE_LAMBDA: Record<(typeof MODES)[number], number> = {
  cheap: 0.9,
  balanced: 0.5,
  quality: 0.1,
};

/** mulberry32 — small, seeded, and stable across renders. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function costOf(model: DemoModel, inTokens: number, outTokens: number): number {
  return (
    (inTokens / 1_000_000) * model.price_in_per_1m +
    (outTokens / 1_000_000) * model.price_out_per_1m
  );
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Picks a model by cumulative share so the mix matches the declared split. */
function pickModel(roll: number): DemoModel {
  let acc = 0;
  for (const model of MODELS) {
    acc += model.share;
    if (roll <= acc) return model;
  }
  return MODELS[MODELS.length - 1];
}

function buildExplanation(
  model: DemoModel,
  prompt: string,
  savings: number,
  random: () => number,
): Explanation {
  const cheaper = MODELS.filter((m) => m.price_out_per_1m < BASELINE.price_out_per_1m);
  const neighbours = Array.from({ length: 3 }, (_, index) => {
    const winner = cheaper[Math.floor(random() * cheaper.length)] ?? model;
    return {
      prompt: PROMPTS[(PROMPTS.indexOf(prompt) + index + 1) % PROMPTS.length],
      winner: winner.id,
      sim: round(0.94 - index * 0.06 - random() * 0.04, 2),
    };
  });

  return {
    method: "knn",
    summary:
      model.id === BASELINE_MODEL
        ? `Kept ${model.display_name}: similar prompts needed the strongest model to stay correct.`
        : `Routed to ${model.display_name} — nearby prompts were answered just as well for ${
            savings > 0 ? `$${savings.toFixed(4)} less` : "less"
          }.`,
    neighbors: neighbours,
    baseline_model: BASELINE_MODEL,
    est_savings_usd: round(savings, 6),
  };
}

/** One generated corpus; every export below is a projection of it. */
function generateRequests(now: number): RequestRow[] {
  const random = makeRandom(45_231);
  const rows: RequestRow[] = [];
  const windowMs = DAYS * 24 * 60 * 60 * 1000;

  for (let index = 0; index < REQUEST_COUNT; index += 1) {
    const model = pickModel(random());
    const prompt = PROMPTS[Math.floor(random() * PROMPTS.length)];
    const mode = MODES[Math.floor(random() * MODES.length)];

    const inTokens = Math.round(180 + random() * 1_100);
    const outTokens = Math.round(120 + random() * 780);
    const actualCost = costOf(model, inTokens, outTokens);
    const baselineCost = costOf(BASELINE, inTokens, outTokens);
    const savings = baselineCost - actualCost;

    // Weight timestamps toward recent days so the traffic curve trends up.
    const age = Math.pow(random(), 1.4) * windowMs;
    const createdAt = new Date(now - age);

    const cacheHit = random() < 0.18;
    const latency = Math.round(
      model.avg_latency_ms * (0.7 + random() * 0.6) * (cacheHit ? 0.05 : 1),
    );

    rows.push({
      id: `req_${(index + 1).toString().padStart(4, "0")}`,
      created_at: createdAt.toISOString(),
      prompt_hash: Math.floor(random() * 0xffffffff)
        .toString(16)
        .padStart(8, "0"),
      prompt_preview: prompt,
      policy_mode: mode,
      lambda: MODE_LAMBDA[mode],
      chosen_model: model.id,
      pred_quality: round(model.quality + (random() - 0.5) * 0.06, 3),
      est_cost_usd: round(actualCost * (0.9 + random() * 0.2), 6),
      actual_in_tokens: inTokens,
      actual_out_tokens: outTokens,
      actual_cost_usd: round(cacheHit ? 0 : actualCost, 6),
      latency_ms: latency,
      baseline_model: BASELINE_MODEL,
      baseline_cost_usd: round(baselineCost, 6),
      savings_usd: round(cacheHit ? baselineCost : savings, 6),
      cache_hit: cacheHit,
      explanation: buildExplanation(model, prompt, savings, random),
    });
  }

  return rows.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

let cache: RequestRow[] | null = null;

function requests(): RequestRow[] {
  if (!cache) {
    // Anchored at call time so "last 30 days" stays current.
    cache = generateRequests(Date.now());
  }
  return cache;
}

export function demoRequests(page = 1, perPage = 20): RequestListResponse {
  const all = requests();
  const start = (page - 1) * perPage;
  return {
    requests: all.slice(start, start + perPage),
    total: all.length,
    page,
    per_page: perPage,
  };
}

let statsCache: StatsResponse | null = null;
let timeseriesCache: StatsTimeseriesResponse | null = null;

export function demoStats(): StatsResponse {
  if (statsCache) return statsCache;
  const all = requests();
  const spend = all.reduce((sum, row) => sum + (row.actual_cost_usd ?? 0), 0);
  const baseline = all.reduce((sum, row) => sum + (row.baseline_cost_usd ?? 0), 0);
  const cacheHits = all.filter((row) => row.cache_hit).length;

  const mix: ModelMixEntry[] = MODELS.map((model) => {
    const rows = all.filter((row) => row.chosen_model === model.id);
    return {
      model: model.id,
      display_name: model.display_name,
      count: rows.length,
      total_cost_usd: round(
        rows.reduce((sum, row) => sum + (row.actual_cost_usd ?? 0), 0),
        6,
      ),
      total_savings_usd: round(
        rows.reduce((sum, row) => sum + (row.savings_usd ?? 0), 0),
        6,
      ),
      pct_of_requests: all.length ? rows.length / all.length : 0,
    };
  })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  const timestamps = all.map((row) => new Date(row.created_at).getTime());

  statsCache = {
    total_requests: all.length,
    total_spend_usd: round(spend, 6),
    total_savings_usd: round(baseline - spend, 6),
    total_baseline_usd: round(baseline, 6),
    avg_savings_pct: baseline > 0 ? (baseline - spend) / baseline : 0,
    model_mix: mix,
    cache_hit_rate: all.length ? cacheHits / all.length : 0,
    period_start: new Date(Math.min(...timestamps)).toISOString(),
    period_end: new Date(Math.max(...timestamps)).toISOString(),
  };
  return statsCache;
}

export function demoTimeseries(days = DAYS): StatsTimeseriesResponse {
  if (timeseriesCache && days === DAYS) return timeseriesCache;
  const all = requests();
  const end = new Date();
  const points: TimeseriesPoint[] = [];

  let cumulativeSpend = 0;
  let cumulativeBaseline = 0;

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - offset);
    const day = date.toISOString().slice(0, 10);

    const rows = all.filter((row) => row.created_at.slice(0, 10) === day);
    const spend = rows.reduce((sum, row) => sum + (row.actual_cost_usd ?? 0), 0);
    const baseline = rows.reduce((sum, row) => sum + (row.baseline_cost_usd ?? 0), 0);

    cumulativeSpend += spend;
    cumulativeBaseline += baseline;

    points.push({
      day,
      requests: rows.length,
      spend_usd: round(spend, 6),
      baseline_usd: round(baseline, 6),
      savings_usd: round(baseline - spend, 6),
      cumulative_spend_usd: round(cumulativeSpend, 6),
      cumulative_baseline_usd: round(cumulativeBaseline, 6),
      cumulative_savings_usd: round(cumulativeBaseline - cumulativeSpend, 6),
    });
  }

  const series: StatsTimeseriesResponse = {
    days: points,
    period_start: points[0]?.day ?? "",
    period_end: points[points.length - 1]?.day ?? "",
  };
  if (days === DAYS) timeseriesCache = series;
  return series;
}

export function demoModels(): ModelListResponse {
  const models: ModelRegistryRow[] = MODELS.map((model) => ({
    id: model.id,
    display_name: model.display_name,
    price_in_per_1m: model.price_in_per_1m,
    price_out_per_1m: model.price_out_per_1m,
    context_length: model.context_length,
    avg_latency_ms: model.avg_latency_ms,
    enabled: true,
  })).sort((a, b) => a.price_out_per_1m - b.price_out_per_1m);

  return { models };
}
