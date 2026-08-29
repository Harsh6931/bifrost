"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useApiData } from "@/hooks/use-api-data";
import type { StatsResponse } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/widget-states";

const CHART_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function ModelMixChart() {
  const { data, error, loading, refetch } = useApiData<StatsResponse>(
    "/api/stats"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model distribution</CardTitle>
        <CardDescription>
          Where the router actually sent traffic — the cheap-model share is
          the point.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <WidgetSkeleton />
        ) : error ? (
          <WidgetError message={error} onRetry={refetch} />
        ) : !data || data.model_mix.length === 0 ? (
          <WidgetEmpty hint="No routed requests yet — nothing to chart." />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.model_mix}
                  dataKey="count"
                  nameKey="display_name"
                  innerRadius={55}
                  outerRadius={90}
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
                  formatter={(value: number | string, name: unknown) => [
                    `${Number(value).toLocaleString()} requests`,
                    String(name),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {data.model_mix.map((entry, index) => (
                <li key={entry.model} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: CHART_VARS[index % CHART_VARS.length],
                      }}
                    />
                    <span className="truncate text-muted-foreground">
                      {entry.display_name}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {(entry.pct_of_requests * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
