import type { RequestRow } from "@/lib/types";
import { getSql } from "@/lib/db";

export async function getRequests(
  page = 1,
  perPage = 50,
  modelFilter?: string
): Promise<{ requests: RequestRow[]; total: number }> {
  const sql = getSql();
  const offset = (page - 1) * perPage;
  const where = modelFilter
    ? sql`WHERE chosen_model = ${modelFilter}`
    : sql``;

  const [countRow] = await sql`SELECT COUNT(*)::int AS total FROM requests ${where}`;

  const rows = await sql`
    SELECT * FROM requests ${where}
    ORDER BY created_at DESC
    LIMIT ${perPage} OFFSET ${offset}
  `;

  return {
    requests: rows.map((row) => mapRequestRow(row)),
    total: Number(countRow?.total) || 0,
  };
}

export async function getRequestById(id: string): Promise<RequestRow | null> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM requests WHERE id = ${id}`;
  return row ? mapRequestRow(row) : null;
}

export async function getRequestByHash(
  promptHash: string
): Promise<RequestRow | null> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM requests WHERE prompt_hash = ${promptHash} ORDER BY created_at DESC LIMIT 1`;
  return row ? mapRequestRow(row) : null;
}

function mapRequestRow(row: Record<string, unknown>): RequestRow {
  return {
    id: row.id as string,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : (row.created_at as string),
    prompt_hash: row.prompt_hash as string,
    prompt_preview: (row.prompt_preview as string) ?? null,
    policy_mode: (row.policy_mode as string) ?? null,
    lambda: (row.lambda as number) ?? null,
    chosen_model: row.chosen_model as string,
    pred_quality: (row.pred_quality as number) ?? null,
    est_cost_usd: row.est_cost_usd != null ? Number(row.est_cost_usd) : null,
    actual_in_tokens: (row.actual_in_tokens as number) ?? null,
    actual_out_tokens: (row.actual_out_tokens as number) ?? null,
    actual_cost_usd:
      row.actual_cost_usd != null ? Number(row.actual_cost_usd) : null,
    latency_ms: (row.latency_ms as number) ?? null,
    baseline_model: (row.baseline_model as string) ?? null,
    baseline_cost_usd:
      row.baseline_cost_usd != null ? Number(row.baseline_cost_usd) : null,
    savings_usd: row.savings_usd != null ? Number(row.savings_usd) : null,
    cache_hit: (row.cache_hit as boolean) ?? false,
    explanation:
      typeof row.explanation === "string"
        ? JSON.parse(row.explanation as string)
        : (row.explanation as RequestRow["explanation"]) ?? null,
  };
}
