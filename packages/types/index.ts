// Gateway -> ML service: POST /route request
export interface RouteRequest {
  prompt: string;
  candidates: string[];
  policy: {
    mode: "quality" | "balanced" | "cheap";
    lambda: number;
    max_cost_usd: number;
  };
}

// ML service -> Gateway: POST /route response
export interface RouteResponse {
  chosen: string;
  scores: ModelScore[];
  explanation: Explanation;
  timing_ms: {
    embed: number;
    predict: number;
  };
}

export interface ModelScore {
  model: string;
  pred_quality: number;
  est_cost_usd: number;
  est_latency_ms: number;
  score: number;
}

export interface Explanation {
  method: "knn" | "lgbm";
  summary: string;
  neighbors: Neighbor[];
  baseline_model: string;
  est_savings_usd: number;
}

export interface Neighbor {
  prompt: string;
  winner: string;
  sim: number;
}

// Database model_registry row
export interface ModelRegistryRow {
  id: string;
  display_name: string;
  price_in_per_1m: number;
  price_out_per_1m: number;
  context_length: number;
  avg_latency_ms: number | null;
  enabled: boolean;
}

// Database requests row
export interface RequestRow {
  id: string;
  created_at: string;
  prompt_hash: string;
  prompt_preview: string | null;
  policy_mode: string | null;
  lambda: number | null;
  chosen_model: string;
  pred_quality: number | null;
  est_cost_usd: number | null;
  actual_in_tokens: number | null;
  actual_out_tokens: number | null;
  actual_cost_usd: number | null;
  latency_ms: number | null;
  baseline_model: string | null;
  baseline_cost_usd: number | null;
  savings_usd: number | null;
  cache_hit: boolean;
  explanation: Explanation | null;
}

// API response types for the dashboard
export interface StatsResponse {
  total_requests: number;
  total_spend_usd: number;
  total_savings_usd: number;
  total_baseline_usd: number;
  avg_savings_pct: number;
  model_mix: ModelMixEntry[];
  cache_hit_rate: number;
  period_start: string;
  period_end: string;
}

export interface ModelMixEntry {
  model: string;
  display_name: string;
  count: number;
  total_cost_usd: number;
  total_savings_usd: number;
  pct_of_requests: number;
}

export interface RequestListResponse {
  requests: RequestRow[];
  total: number;
  page: number;
  per_page: number;
}

export interface ModelListResponse {
  models: ModelRegistryRow[];
}

export interface UpdateModelBody {
  enabled?: boolean;
  price_in_per_1m?: number;
  price_out_per_1m?: number;
  display_name?: string;
}
