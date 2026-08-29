"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { demoTimeseries } from "@/lib/demo-data";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import type { StatsTimeseriesResponse } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WidgetSkeleton } from "@/components/dashboard/widget-states";

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function SavingsChart() {
  const { data, loading } = useDashboardData<StatsTimeseriesResponse>(
    "/api/stats/timeseries?days=30",
    () => demoTimeseries(30),
    (series) =>
      series.days.length === 0 || series.days.every((point) => point.requests === 0),
  );

  const saved = data
    ? (data.days[data.days.length - 1]?.cumulative_savings_usd ?? 0)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative cost</CardTitle>
        <CardDescription>
          Actual spend against the always-premium baseline. The shaded gap is
          what routing saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <WidgetSkeleton />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span
                className="text-2xl font-semibold tabular-nums"
                style={{ color: "var(--chart-bifrost)" }}
              >
                {formatUsd(saved)}
              </span>
              <span className="text-xs text-muted-foreground">
                saved over the last 30 days
              </span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={data.days}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="fillBaseline" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--chart-baseline)"
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--chart-baseline)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="fillSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--chart-bifrost)"
                      stopOpacity={0.45}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--chart-bifrost)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: string) => value.slice(5)}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(value: number) => formatUsd(value)}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  formatter={(value) => `$${Number(value ?? 0).toFixed(4)}`}
                  labelFormatter={(label) => String(label)}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_baseline_usd"
                  name="Always-premium"
                  stroke="var(--chart-baseline)"
                  fill="url(#fillBaseline)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <Area
                  type="monotone"
                  dataKey="cumulative_spend_usd"
                  name="Bifrost"
                  stroke="var(--chart-bifrost)"
                  fill="url(#fillSpend)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-3 flex items-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: "var(--chart-bifrost)" }}
                />
                Bifrost
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-full opacity-70"
                  style={{ backgroundColor: "var(--chart-baseline)" }}
                />
                Always-premium
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
