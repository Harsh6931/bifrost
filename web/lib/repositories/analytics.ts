import type {
  StatsResponse,
  ModelMixEntry,
  StatsTimeseriesResponse,
  TimeseriesPoint,
} from "@/lib/types";
import { getSql } from "@/lib/db";

type SqlClient = ReturnType<typeof getSql>;
type Fragment = ReturnType<SqlClient>;

function dateFilter(from?: string, to?: string): Fragment {
  const sql = getSql();
  if (from && to) {
    return sql`WHERE created_at >= ${from}::timestamptz AND created_at <= ${to}::timestamptz`;
  }
  if (from) {
    return sql`WHERE created_at >= ${from}::timestamptz`;
  }
  if (to) {
    return sql`WHERE created_at <= ${to}::timestamptz`;
  }
  return sql``;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

export async function getStats(
  from?: string,
  to?: string
): Promise<StatsResponse> {
  const sql = getSql();
  const where = dateFilter(from, to);

  const [aggregates] = await sql`
    SELECT
      COUNT(*)::int AS total_requests,
      COALESCE(SUM(actual_cost_usd), 0)::numeric AS total_spend,
      COALESCE(SUM(savings_usd), 0)::numeric AS total_savings,
      COALESCE(SUM(baseline_cost_usd), 0)::numeric AS total_baseline,
      COALESCE(AVG(CASE WHEN baseline_cost_usd > 0 THEN savings_usd / baseline_cost_usd ELSE 0 END), 0)::numeric AS avg_savings_pct,
      COALESCE(SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0), 0)::numeric AS cache_hit_rate,
      MIN(created_at) AS period_start,
      MAX(created_at) AS period_end
    FROM requests
    ${where}
  `;

  const modelMixRows = await sql`
    SELECT
      r.chosen_model,
      m.display_name,
      COUNT(*)::int AS count,
      COALESCE(SUM(r.actual_cost_usd), 0)::numeric AS total_cost,
      COALESCE(SUM(r.savings_usd), 0)::numeric AS total_savings
    FROM requests r
    LEFT JOIN model_registry m ON m.id = r.chosen_model
    ${where}
    GROUP BY r.chosen_model, m.display_name
    ORDER BY count DESC
  `;

  const total = Number(aggregates?.total_requests) || 0;
  const modelMix: ModelMixEntry[] = modelMixRows.map((row) => ({
    model: String(row.chosen_model),
    display_name:
      typeof row.display_name === "string"
        ? row.display_name
        : String(row.chosen_model),
    count: Number(row.count),
    total_cost_usd: Number(row.total_cost),
    total_savings_usd: Number(row.total_savings),
    pct_of_requests: total > 0 ? Number(row.count) / total : 0,
  }));

  return {
    total_requests: total,
    total_spend_usd: Number(aggregates?.total_spend),
    total_savings_usd: Number(aggregates?.total_savings),
    total_baseline_usd: Number(aggregates?.total_baseline),
    avg_savings_pct: Number(aggregates?.avg_savings_pct),
    model_mix: modelMix,
    cache_hit_rate: Number(aggregates?.cache_hit_rate),
    period_start: toIsoString(aggregates?.period_start),
    period_end: toIsoString(aggregates?.period_end),
  };
}

export async function getStatsTimeseries(
  days = 30
): Promise<StatsTimeseriesResponse> {
  const sql = getSql();
  const cappedDays = Math.min(90, Math.max(1, Math.floor(days)));

  const rows = await sql`
    SELECT
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS requests,
      COALESCE(SUM(actual_cost_usd), 0)::numeric AS spend,
      COALESCE(SUM(baseline_cost_usd), 0)::numeric AS baseline,
      COALESCE(SUM(savings_usd), 0)::numeric AS savings
    FROM requests
    WHERE created_at >= now() - (${cappedDays} * interval '1 day')
    GROUP BY 1
    ORDER BY 1
  `;

  const byDay = new Map<string, { requests: number; spend: number; baseline: number; savings: number }>();
  for (const row of rows) {
    byDay.set(String(row.day), {
      requests: Number(row.requests),
      spend: Number(row.spend),
      baseline: Number(row.baseline),
      savings: Number(row.savings),
    });
  }

  const today = new Date();
  const endDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const points: TimeseriesPoint[] = [];
  let cumulativeSpend = 0;
  let cumulativeBaseline = 0;
  let cumulativeSavings = 0;

  for (let i = cappedDays - 1; i >= 0; i--) {
    const day = new Date(endDay - i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(day) ?? {
      requests: 0,
      spend: 0,
      baseline: 0,
      savings: 0,
    };
    cumulativeSpend += row.spend;
    cumulativeBaseline += row.baseline;
    cumulativeSavings += row.savings;
    points.push({
      day,
      requests: row.requests,
      spend_usd: row.spend,
      baseline_usd: row.baseline,
      savings_usd: row.savings,
      cumulative_spend_usd: cumulativeSpend,
      cumulative_baseline_usd: cumulativeBaseline,
      cumulative_savings_usd: cumulativeSavings,
    });
  }

  return {
    days: points,
    period_start: points[0]?.day ?? "",
    period_end: points[points.length - 1]?.day ?? "",
  };
}
