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

import { demoRequests } from "@/lib/demo-data";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import type { RequestListResponse } from "@/lib/types";
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

interface ScatterPoint {
  cost: number;
  quality: number;
  model: string;
}

interface ModelSeries {
  model: string;
  label: string;
  colour: string;
  points: ScatterPoint[];
}

/** Groups requests into one series per model so each tier gets its own colour. */
function toSeries(requests: RequestListResponse["requests"]): ModelSeries[] {
  const grouped = new Map<string, ScatterPoint[]>();

  for (const request of requests) {
    if (request.actual_cost_usd == null || request.pred_quality == null) {
      continue;
    }
    // Cache hits cost nothing and would pile up on the y-axis.
    if (request.cache_hit) {
      continue;
    }
    const points = grouped.get(request.chosen_model) ?? [];
    points.push({
      cost: request.actual_cost_usd,
      quality: request.pred_quality,
      model: request.chosen_model,
    });
    grouped.set(request.chosen_model, points);
  }

  return [...grouped.entries()]
    .map(([model, points]) => ({
      model,
      label: model.split("/").pop() ?? model,
      colour: "",
      points,
    }))
    // Cheapest average cost first, so colours run cheap -> premium.
    .sort((a, b) => {
      const avg = (series: ModelSeries) =>
        series.points.reduce((sum, point) => sum + point.cost, 0) /
        series.points.length;
      return avg(a) - avg(b);
    })
    .map((series, index) => ({
      ...series,
      colour: CHART_VARS[index % CHART_VARS.length],
    }));
}

export function CostQualityScatter() {
  const { data, loading } = useDashboardData<RequestListResponse>(
    "/api/requests?per_page=500",
    () => demoRequests(1, 500),
    (payload) => payload.requests.length === 0,
  );

  const series = data ? toSeries(data.requests) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost vs quality, per request</CardTitle>
        <CardDescription>
          One point per routed request. A good router crowds the top-left —
          high quality, low cost.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <WidgetSkeleton />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  type="number"
                  dataKey="cost"
                  name="Cost"
                  scale="sqrt"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => `$${value.toFixed(3)}`}
                />
                <YAxis
                  type="number"
                  dataKey="quality"
                  name="Quality"
                  domain={[0.6, 1]}
                  width={44}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => value.toFixed(2)}
                />
                <ZAxis range={[26, 26]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) =>
                    name === "Cost"
                      ? [`$${Number(value ?? 0).toFixed(4)}`, String(name)]
                      : [Number(value ?? 0).toFixed(2), String(name)]
                  }
                  labelFormatter={() => ""}
                />
                {series.map((entry) => (
                  <Scatter
                    key={entry.model}
                    name={entry.label}
                    data={entry.points}
                    fill={entry.colour}
                    fillOpacity={0.65}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {series.map((entry) => (
                <li key={entry.model} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: entry.colour }}
                  />
                  {entry.label}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
