"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { useApiData } from "@/hooks/use-api-data";
import type { RequestListResponse } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/widget-states";

interface ScatterPoint {
  cost: number;
  quality: number;
  model: string;
}

function toScatterPoints(requests: RequestListResponse["requests"]): ScatterPoint[] {
  const points: ScatterPoint[] = [];
  for (const request of requests) {
    if (request.actual_cost_usd != null && request.pred_quality != null) {
      points.push({
        cost: request.actual_cost_usd,
        quality: request.pred_quality,
        model: request.chosen_model,
      });
    }
  }
  return points;
}

export function CostQualityScatter() {
  const { data, error, loading, refetch } = useApiData<RequestListResponse>(
    "/api/requests?per_page=500"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost vs quality, per request</CardTitle>
        <CardDescription>
          One point per routed request. A good router keeps the cloud low and
          to the right small — quality high at low cost.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <WidgetSkeleton />
        ) : error ? (
          <WidgetError message={error} onRetry={refetch} />
        ) : !data || data.requests.length === 0 ? (
          <WidgetEmpty hint="No routed requests yet — nothing to plot." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="number"
                dataKey="cost"
                name="Cost"
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => `$${value.toFixed(3)}`}
              />
              <YAxis
                type="number"
                dataKey="quality"
                name="Quality"
                domain={[0, 1]}
                width={48}
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => value.toFixed(1)}
              />
              <ZAxis range={[28, 28]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(value, name) =>
                  name === "Cost"
                    ? [`$${Number(value ?? 0).toFixed(4)}`, String(name)]
                    : [Number(value ?? 0).toFixed(2), String(name)]
                }
                labelFormatter={() => ""}
              />
              <Scatter
                data={toScatterPoints(data.requests)}
                fill="var(--chart-2)"
                fillOpacity={0.7}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
