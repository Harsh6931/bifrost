import type { StatsResponse, ModelMixEntry } from "@/lib/types";
import { getSql } from "@/lib/db";

export async function getStats(
  from?: string,
  to?: string
): Promise<StatsResponse> {
  const sql = getSql();
  const conditions: string[] = [];
  const params: string[] = [];

  if (from) {
    conditions.push(`created_at >= $${params.length + 1}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`created_at <= $${params.length + 1}`);
    params.push(to);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [aggregates] = await sql.unsafe(
    `SELECT
       COUNT(*)::int AS total_requests,
       COALESCE(SUM(actual_cost_usd), 0)::numeric AS total_spend,
       COALESCE(SUM(savings_usd), 0)::numeric AS total_savings,
       COALESCE(SUM(baseline_cost_usd), 0)::numeric AS total_baseline,
       COALESCE(AVG(CASE WHEN baseline_cost_usd > 0 THEN savings_usd / baseline_cost_usd ELSE 0 END), 0)::numeric AS avg_savings_pct,
       COALESCE(SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0), 0)::numeric AS cache_hit_rate,
       MIN(created_at) AS period_start,
       MAX(created_at) AS period_end
     FROM requests ${whereClause}`,
    params as any[]
  );

  const modelMixRows = await sql.unsafe(
    `SELECT
       r.chosen_model,
       m.display_name,
       COUNT(*)::int AS count,
       COALESCE(SUM(r.actual_cost_usd), 0)::numeric AS total_cost,
       COALESCE(SUM(r.savings_usd), 0)::numeric AS total_savings
     FROM requests r
     LEFT JOIN model_registry m ON m.id = r.chosen_model
     ${whereClause}
     GROUP BY r.chosen_model, m.display_name
     ORDER BY count DESC`,
    params as any[]
  );

  const total = Number(aggregates.total_requests) || 0;
  const modelMix: ModelMixEntry[] = (modelMixRows as any[]).map((row) => ({
    model: row.chosen_model as string,
    display_name: (row.display_name as string) || (row.chosen_model as string),
    count: row.count as number,
    total_cost_usd: Number(row.total_cost),
    total_savings_usd: Number(row.total_savings),
    pct_of_requests: total > 0 ? Number(row.count) / total : 0,
  }));

  return {
    total_requests: total,
    total_spend_usd: Number(aggregates.total_spend),
    total_savings_usd: Number(aggregates.total_savings),
    total_baseline_usd: Number(aggregates.total_baseline),
    avg_savings_pct: Number(aggregates.avg_savings_pct),
    model_mix: modelMix,
    cache_hit_rate: Number(aggregates.cache_hit_rate),
    period_start: aggregates.period_start?.toISOString() ?? "",
    period_end: aggregates.period_end?.toISOString() ?? "",
  };
}
