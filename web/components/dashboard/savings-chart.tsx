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

import { useApiData } from "@/hooks/use-api-data";
import type { StatsTimeseriesResponse } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/widget-states";

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function SavingsChart() {
  const { data, error, loading, refetch } =
    useApiData<StatsTimeseriesResponse>("/api/stats/timeseries?days=30");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative cost — Bifrost vs always-premium</CardTitle>
        <CardDescription>
          Actual spend against the premium baseline over the last 30 days. The
          gap is what Bifrost saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <WidgetSkeleton />
        ) : error ? (
          <WidgetError message={error} onRetry={refetch} />
        ) : !data || data.days.length === 0 ? (
          <WidgetEmpty hint="No routed requests yet — nothing to chart." />
        ) : data.days.every((point) => point.requests === 0) ? (
          <WidgetEmpty hint="No routed requests in the last 30 days." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fillBaseline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fillSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: string) => value.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                width={64}
                tickFormatter={(value: number) => formatUsd(value)}
              />
              <Tooltip
                formatter={(value: number | string) => `$${Number(value).toFixed(4)}`}
                labelFormatter={(label: string) => label}
              />
              <Area
                type="monotone"
                dataKey="cumulative_baseline_usd"
                name="Always-premium"
                stroke="var(--chart-1)"
                fill="url(#fillBaseline)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="cumulative_spend_usd"
                name="Bifrost"
                stroke="var(--chart-2)"
                fill="url(#fillSpend)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
