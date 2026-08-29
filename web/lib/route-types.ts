export type RouteMode = "quality" | "balanced" | "cheap";

export type ModelScore = {
  model: string;
  pred_quality: number;
  est_cost_usd: number;
  est_latency_ms: number;
  score: number;
};

export type Neighbor = {
  prompt: string;
  winner: string;
  sim: number;
};

export type Explanation = {
  method: "knn" | "lgbm";
  summary: string;
  neighbors: Neighbor[];
  baseline_model: string;
  est_savings_usd: number;
};

export type RouteResponse = {
  chosen: string;
  scores: ModelScore[];
  explanation: Explanation;
  timing_ms: {
    embed: number;
    predict: number;
  };
};

export type PreviewResult = RouteResponse & {
  mock: boolean;
};
