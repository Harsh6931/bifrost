"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { demoModels } from "@/lib/demo-data";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import type { ModelListResponse, ModelRegistryRow } from "@/lib/types";
import { WidgetSkeleton } from "@/components/dashboard/widget-states";

interface PriceDraft {
  price_in_per_1m: string;
  price_out_per_1m: string;
}

function draftFromModel(model: ModelRegistryRow): PriceDraft {
  return {
    price_in_per_1m: String(model.price_in_per_1m),
    price_out_per_1m: String(model.price_out_per_1m),
  };
}

export function ModelRegistryTable() {
  const { data, loading, refetch, isDemo } = useDashboardData<ModelListResponse>(
    "/api/models?include_disabled=true",
    demoModels,
    (payload) => payload.models.length === 0,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PriceDraft | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function patchModel(
    id: string,
    body: Record<string, unknown>
  ): Promise<boolean> {
    setBusyId(id);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/models?id=${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          payload &&
          typeof payload === "object" &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `Update failed (${response.status}).`;
        setActionError(message);
        return false;
      }
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function toggleEnabled(model: ModelRegistryRow) {
    const success = await patchModel(model.id, { enabled: !model.enabled });
    if (success) refetch();
  }

  function startEditing(model: ModelRegistryRow) {
    setEditingId(model.id);
    setDraft(draftFromModel(model));
  }

  async function savePrices(model: ModelRegistryRow) {
    if (!draft) return;
    const priceIn = Number.parseFloat(draft.price_in_per_1m);
    const priceOut = Number.parseFloat(draft.price_out_per_1m);
    if (
      !Number.isFinite(priceIn) ||
      !Number.isFinite(priceOut) ||
      priceIn <= 0 ||
      priceOut <= 0
    ) {
      setActionError("Prices must be positive numbers.");
      return;
    }
    const success = await patchModel(model.id, {
      price_in_per_1m: priceIn,
      price_out_per_1m: priceOut,
    });
    if (success) {
      setEditingId(null);
      setDraft(null);
      refetch();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model registry</CardTitle>
        <CardDescription>
          The candidate pool the router picks from. Disabling a model removes
          it from routing instantly — no redeploy. Keep prices current.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <WidgetSkeleton height={240} />
        ) : (
          <div className="space-y-3">
            {actionError ? (
              <p className="text-destructive text-xs" role="alert">
                {actionError}
              </p>
            ) : null}
            {isDemo ? (
              <p className="text-xs text-muted-foreground">
                Showing the seed registry. Editing needs the database running.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Model</th>
                    <th className="py-2 pr-4 text-right font-medium">In $/1M</th>
                    <th className="py-2 pr-4 text-right font-medium">Out $/1M</th>
                    <th className="py-2 pr-4 text-right font-medium">Context</th>
                    <th className="py-2 pr-4 text-right font-medium">Avg latency</th>
                    <th className="py-2 text-right font-medium">Routing</th>
                  </tr>
                </thead>
                <tbody>
                  {data.models.map((model) => {
                    const isEditing = editingId === model.id;
                    const isBusy = busyId === model.id;
                    return (
                      <tr key={model.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{model.display_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {model.id}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {isEditing && draft ? (
                            <input
                              className="w-20 rounded-md border bg-background px-1.5 py-1 text-right text-xs tabular-nums"
                              value={draft.price_in_per_1m}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  price_in_per_1m: event.target.value,
                                })
                              }
                              aria-label={`Input price for ${model.display_name}`}
                            />
                          ) : (
                            model.price_in_per_1m.toFixed(2)
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {isEditing && draft ? (
                            <input
                              className="w-20 rounded-md border bg-background px-1.5 py-1 text-right text-xs tabular-nums"
                              value={draft.price_out_per_1m}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  price_out_per_1m: event.target.value,
                                })
                              }
                              aria-label={`Output price for ${model.display_name}`}
                            />
                          ) : (
                            model.price_out_per_1m.toFixed(2)
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                          {(model.context_length / 1000).toLocaleString()}k
                        </td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                          {model.avg_latency_ms == null
                            ? "—"
                            : `${model.avg_latency_ms.toLocaleString()} ms`}
                        </td>
                        <td className="py-2">
                          <div className="flex justify-end gap-1.5">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  disabled={isBusy}
                                  onClick={() => savePrices(model)}
                                >
                                  {isBusy ? "Saving…" : "Save"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingId(null);
                                    setDraft(null);
                                  }}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  disabled={isBusy || isDemo || !model.enabled}
                                  onClick={() => startEditing(model)}
                                >
                                  Edit prices
                                </Button>
                                <Button
                                  variant={model.enabled ? "destructive" : "default"}
                                  size="xs"
                                  disabled={isBusy || isDemo}
                                  onClick={() => toggleEnabled(model)}
                                >
                                  {isBusy
                                    ? "…"
                                    : model.enabled
                                      ? "Disable"
                                      : "Enable"}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
