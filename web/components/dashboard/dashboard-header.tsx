"use client";

import { demoStats } from "@/lib/demo-data";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import type { StatsResponse } from "@/lib/types";

function formatRange(start: string, end: string): string {
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${from.toLocaleDateString(undefined, options)} — ${to.toLocaleDateString(
    undefined,
    options,
  )}`;
}

export function DashboardHeader() {
  const { data, loading, isDemo } = useDashboardData<StatsResponse>(
    "/api/stats",
    demoStats,
    (stats) => stats.total_requests === 0,
  );

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Cost, quality and savings across every routed request.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {!loading && data ? (
          <span className="text-muted-foreground tabular-nums">
            {formatRange(data.period_start, data.period_end)}
          </span>
        ) : null}
        {isDemo ? (
          <span className="rounded-full border border-dashed px-2 py-1 text-muted-foreground">
            Sample data — connect the database for live traffic
          </span>
        ) : (
          <span
            className="flex items-center gap-1.5 rounded-full border px-2 py-1"
            style={{ color: "var(--chart-bifrost)" }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: "var(--chart-bifrost)" }}
            />
            Live
          </span>
        )}
      </div>
    </div>
  );
}
