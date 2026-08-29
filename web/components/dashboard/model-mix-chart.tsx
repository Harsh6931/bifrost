"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { demoStats } from "@/lib/demo-data";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import type { StatsResponse } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WidgetSkeleton } from "@/components/dashboard/widget-states";

const CHART_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-baseline)",
] as const;

export function ModelMixChart() {
  const { data, loading } = useDashboardData<StatsResponse>(
    "/api/stats",
    demoStats,
    (stats) => stats.model_mix.length === 0,
  );

  // The headline number: how much traffic avoided the premium baseline.
  const cheapShare = data
    ? data.model_mix
        .slice(0, Math.max(data.model_mix.length - 1, 0))
        .reduce((sum, entry) => sum + entry.pct_of_requests, 0)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model distribution</CardTitle>
        <CardDescription>
          Where the router actually sent traffic — the cheap-model share is the
          point.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <WidgetSkeleton />
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={data.model_mix}
                    dataKey="count"
                    nameKey="display_name"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {data.model_mix.map((entry, index) => (
                      <Cell
                        key={entry.model}
                        fill={CHART_VARS[index % CHART_VARS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [
                      `${Number(value ?? 0).toLocaleString()} requests`,
                      String(name),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">
                  {(cheapShare * 100).toFixed(0)}%
                </span>
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  below premium
                </span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2 text-xs">
              {data.model_mix.map((entry, index) => (
                <li key={entry.model} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: CHART_VARS[index % CHART_VARS.length],
                        }}
                      />
                      <span className="truncate">{entry.display_name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {(entry.pct_of_requests * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(entry.pct_of_requests * 100, 1.5)}%`,
                        backgroundColor: CHART_VARS[index % CHART_VARS.length],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
