import type { RouteResponse } from "@/lib/route-types";

const CANDIDATES = [
  {
    model: "openai/gpt-5.5",
    pred_quality: 0.94,
    est_cost_usd: 0.019,
    est_latency_ms: 2400,
  },
  {
    model: "anthropic/claude-sonnet-4.6",
    pred_quality: 0.93,
    est_cost_usd: 0.012,
    est_latency_ms: 2000,
  },
  {
    model: "google/gemini-2.5-pro",
    pred_quality: 0.91,
    est_cost_usd: 0.008,
    est_latency_ms: 1900,
  },
  {
    model: "deepseek/deepseek-r1",
    pred_quality: 0.89,
    est_cost_usd: 0.0004,
    est_latency_ms: 3400,
  },
  {
    model: "openai/gpt-5-mini",
    pred_quality: 0.84,
    est_cost_usd: 0.0009,
    est_latency_ms: 1300,
  },
  {
    model: "qwen/qwen3.7-flash",
    pred_quality: 0.78,
    est_cost_usd: 0.00008,
    est_latency_ms: 900,
  },
] as const;

const BASELINE = "openai/gpt-5.5";

const NEIGHBOR_STEMS = [
  "walk me through vector clocks",
  "explain CRDTs to a backend engineer",
  "how do Raft elections work",
  "summarize eventual consistency",
  "compare Paxos and Raft briefly",
];

export function mockPreview(prompt: string, lambda: number): RouteResponse {
  const costs = CANDIDATES.map((item) => item.est_cost_usd);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const denom = maxCost - minCost + 1e-9;

  const scores = CANDIDATES.map((item) => {
    const cNorm = (item.est_cost_usd - minCost) / denom;
    return {
      model: item.model,
      pred_quality: item.pred_quality,
      est_cost_usd: item.est_cost_usd,
      est_latency_ms: item.est_latency_ms,
      score: item.pred_quality - lambda * cNorm,
    };
  }).sort((a, b) => b.score - a.score);

  const chosen = scores[0];
  const baseline = CANDIDATES.find((item) => item.model === BASELINE) ?? CANDIDATES[0];
  const savings = Math.max(0, baseline.est_cost_usd - chosen.est_cost_usd);
  const qualityGap = Math.abs(baseline.pred_quality - chosen.pred_quality) * 100;
  const shortName = chosen.model.split("/").pop() ?? chosen.model;

  const neighbors = NEIGHBOR_STEMS.slice(0, 5).map((stem, index) => ({
    prompt: stem,
    winner: scores[index % 3]?.model ?? chosen.model,
    sim: Number((0.94 - index * 0.03).toFixed(2)),
  }));

  const preview = prompt.trim().slice(0, 48);

  return {
    chosen: chosen.model,
    scores,
    explanation: {
      method: "knn",
      summary: `Routed to ${shortName}. Across ${neighbors.length} similar prompts${
        preview ? ` (near “${preview}”)` : ""
      }, it stayed within ${qualityGap.toFixed(0)}% of GPT-5.5 at a lower estimated cost.`,
      neighbors,
      baseline_model: BASELINE,
      est_savings_usd: savings,
    },
    timing_ms: { embed: 4, predict: 2 },
  };
}
