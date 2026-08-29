"use client";

import { demoStats } from "@/lib/demo-data";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import type { StatsResponse } from "@/lib/types";
import { StatTile } from "@/components/dashboard/stat-tile";
import { WidgetSkeleton } from "@/components/dashboard/widget-states";

export function StatsTiles() {
  const { data, loading } = useDashboardData<StatsResponse>(
    "/api/stats",
    demoStats,
    (stats) => stats.total_requests === 0,
  );

  if (loading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <WidgetSkeleton key={index} height={116} />
        ))}
      </div>
    );
  }

  const tiles = [
    {
      title: "Requests routed",
      value: data.total_requests.toLocaleString(),
      hint: `${(data.cache_hit_rate * 100).toFixed(1)}% served from cache`,
      accent: "var(--chart-1)",
    },
    {
      title: "Actual spend",
      value: `$${data.total_spend_usd.toFixed(2)}`,
      hint: `vs $${data.total_baseline_usd.toFixed(2)} always-premium`,
      accent: "var(--chart-4)",
    },
    {
      title: "Saved",
      value: `$${data.total_savings_usd.toFixed(2)}`,
      hint: "kept out of the bill",
      accent: "var(--chart-bifrost)",
      emphasis: true,
    },
    {
      title: "Cost reduction",
      value: `${(data.avg_savings_pct * 100).toFixed(1)}%`,
      hint: "against always-premium routing",
      accent: "var(--chart-bifrost)",
      emphasis: true,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <StatTile key={tile.title} {...tile} />
      ))}
    </div>
  );
}
