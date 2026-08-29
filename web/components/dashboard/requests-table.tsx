"use client";

import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useApiData } from "@/hooks/use-api-data";
import type { RequestRow, RequestListResponse } from "@/lib/types";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/widget-states";

const PER_PAGE = 20;

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatUsd(value: number | null): string {
  return value == null ? "—" : `$${value.toFixed(4)}`;
}

function formatLatency(value: number | null): string {
  return value == null ? "—" : `${value.toLocaleString()} ms`;
}

function ExplanationPanel({ request }: { request: RequestRow }) {
  const explanation = request.explanation;
  if (!explanation) {
    return (
      <p className="text-xs text-muted-foreground">
        No explanation stored for this request.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-xs">
      <p className="font-medium">{explanation.summary}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
        <span>Method: {explanation.method}</span>
        <span>Baseline: {explanation.baseline_model}</span>
        <span>
          Est. savings: ${explanation.est_savings_usd.toFixed(4)}
        </span>
        <span>Mode: {request.policy_mode ?? "—"} (λ {request.lambda ?? "—"})</span>
        <span>
          Tokens: {request.actual_in_tokens ?? "—"} in /{" "}
          {request.actual_out_tokens ?? "—"} out
        </span>
      </div>
      {explanation.neighbors.length > 0 ? (
        <div>
          <p className="mb-1 font-medium">Similar prompts that decided this route</p>
          <ul className="space-y-1">
            {explanation.neighbors.map((neighbor, index) => (
              <li
                key={`${neighbor.prompt}-${index}`}
                className="flex items-baseline justify-between gap-4 rounded-md bg-muted/50 px-2 py-1"
              >
                <span className="min-w-0 truncate">{neighbor.prompt}</span>
                <span className="shrink-0 text-muted-foreground">
                  won by {neighbor.winner.split("/").pop()} · sim{" "}
                  {neighbor.sim.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function RequestsTable() {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, error, loading, refetch } = useApiData<RequestListResponse>(
    `/api/requests?page=${page}&per_page=${PER_PAGE}`
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request log</CardTitle>
        <CardDescription>
          Every routed request with what it cost, what it saved, and why the
          router picked that model. Click a row for the explanation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <WidgetSkeleton height={320} />
        ) : error ? (
          <WidgetError message={error} onRetry={refetch} />
        ) : !data || data.requests.length === 0 ? (
          <WidgetEmpty hint="No routed requests yet. Run npm run seed or send traffic through the gateway." />
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Prompt</th>
                    <th className="py-2 pr-4 font-medium">Model</th>
                    <th className="py-2 pr-4 text-right font-medium">Cost</th>
                    <th className="py-2 pr-4 text-right font-medium">Saved</th>
                    <th className="py-2 pr-4 text-right font-medium">Latency</th>
                    <th className="py-2 text-right font-medium">Cache</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map((request) => (
                    <Fragment key={request.id}>
                      <tr
                        className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                        onClick={() =>
                          setExpandedId((current) =>
                            current === request.id ? null : request.id
                          )
                        }
                      >
                        <td className="py-2 pr-4 whitespace-nowrap tabular-nums text-muted-foreground">
                          {formatWhen(request.created_at)}
                        </td>
                        <td className="max-w-72 truncate py-2 pr-4">
                          {request.prompt_preview ?? request.prompt_hash}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {request.chosen_model.split("/").pop()}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatUsd(request.actual_cost_usd)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatUsd(request.savings_usd)}
                        </td>
                        <td className="py-2 pr-4 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                          {formatLatency(request.latency_ms)}
                        </td>
                        <td className="py-2 text-right">
                          {request.cache_hit ? "hit" : "—"}
                        </td>
                      </tr>
                      {expandedId === request.id ? (
                        <tr className="border-b">
                          <td colSpan={7} className="px-2 py-3">
                            <ExplanationPanel request={request} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {data.total.toLocaleString()} request
                {data.total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Prev
                </Button>
                <span className="tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
