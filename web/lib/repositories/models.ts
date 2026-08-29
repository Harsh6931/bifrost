import type { ModelRegistryRow } from "@/lib/types";
import { getSql } from "@/lib/db";

type SqlClient = ReturnType<typeof getSql>;
type Fragment = ReturnType<SqlClient>;

export async function getModels(
  includeDisabled = false
): Promise<ModelRegistryRow[]> {
  const sql = getSql();
  if (includeDisabled) {
    const rows = await sql`SELECT * FROM model_registry ORDER BY display_name`;
    return rows.map((row) => mapModelRow(row));
  }

  const rows =
    await sql`SELECT * FROM model_registry WHERE enabled = true ORDER BY display_name`;
  return rows.map((row) => mapModelRow(row));
}

export async function getModelById(
  id: string
): Promise<ModelRegistryRow | null> {
  const sql = getSql();
  const [row] = await sql`SELECT * FROM model_registry WHERE id = ${id}`;
  return row ? mapModelRow(row) : null;
}

function combineFragments(parts: Fragment[], separator: string): Fragment {
  const sql = getSql();
  let clause = parts[0];
  for (const part of parts.slice(1)) {
    clause = separator === ", "
      ? sql`${clause}, ${part}`
      : sql`${clause} AND ${part}`;
  }
  return clause;
}

export async function updateModel(
  id: string,
  updates: {
    enabled?: boolean;
    price_in_per_1m?: number;
    price_out_per_1m?: number;
    display_name?: string;
  }
): Promise<ModelRegistryRow | null> {
  const sql = getSql();
  const sets: Fragment[] = [];

  if (updates.enabled !== undefined) {
    sets.push(sql`enabled = ${updates.enabled}`);
  }
  if (updates.price_in_per_1m !== undefined) {
    sets.push(sql`price_in_per_1m = ${updates.price_in_per_1m}`);
  }
  if (updates.price_out_per_1m !== undefined) {
    sets.push(sql`price_out_per_1m = ${updates.price_out_per_1m}`);
  }
  if (updates.display_name !== undefined) {
    sets.push(sql`display_name = ${updates.display_name}`);
  }

  if (sets.length === 0) return getModelById(id);

  const setClause = combineFragments(sets, ", ");
  const [row] = await sql`UPDATE model_registry SET ${setClause} WHERE id = ${id} RETURNING *`;

  return row ? mapModelRow(row) : null;
}

export async function createModel(
  model: Omit<ModelRegistryRow, "enabled"> & { enabled?: boolean }
): Promise<ModelRegistryRow> {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO model_registry (id, display_name, price_in_per_1m, price_out_per_1m, context_length, avg_latency_ms, enabled)
    VALUES (${model.id}, ${model.display_name}, ${model.price_in_per_1m}, ${model.price_out_per_1m}, ${model.context_length}, ${model.avg_latency_ms ?? null}, ${model.enabled ?? true})
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      price_in_per_1m = EXCLUDED.price_in_per_1m,
      price_out_per_1m = EXCLUDED.price_out_per_1m,
      context_length = EXCLUDED.context_length,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      enabled = EXCLUDED.enabled
    RETURNING *
  `;
  return mapModelRow(row);
}

function mapModelRow(row: Record<string, unknown>): ModelRegistryRow {
  return {
    id: row.id as string,
    display_name: row.display_name as string,
    price_in_per_1m: Number(row.price_in_per_1m),
    price_out_per_1m: Number(row.price_out_per_1m),
    context_length: row.context_length as number,
    avg_latency_ms: (row.avg_latency_ms as number) ?? null,
    enabled: (row.enabled as boolean) ?? true,
  };
}
