"use client";

import { useApiData } from "@/hooks/use-api-data";
import type { StatsResponse } from "@/lib/types";
import { StatTile } from "@/components/dashboard/stat-tile";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "@/components/dashboard/widget-states";

export function StatsTiles() {
  const { data, error, loading, refetch } = useApiData<StatsResponse>(
    "/api/stats"
  );

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <WidgetSkeleton key={index} height={116} />
        ))}
      </div>
    );
  }

  if (error) {
    return <WidgetError message={error} onRetry={refetch} />;
  }

  if (!data || data.total_requests === 0) {
    return (
      <WidgetEmpty hint="No routed requests yet. Run npm run seed or send traffic through the gateway." />
    );
  }

  const tiles = [
    {
      title: "Requests",
      value: data.total_requests.toLocaleString(),
      hint: `${(data.cache_hit_rate * 100).toFixed(1)}% served from cache`,
    },
    {
      title: "Spend",
      value: `$${data.total_spend_usd.toFixed(4)}`,
      hint: "actual cost of routed calls",
    },
    {
      title: "Saved vs baseline",
      value: `$${data.total_savings_usd.toFixed(4)}`,
      hint: `baseline spend $${data.total_baseline_usd.toFixed(4)}`,
    },
    {
      title: "Avg savings",
      value: `${(data.avg_savings_pct * 100).toFixed(1)}%`,
      hint: "per request vs always-premium",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <StatTile
          key={tile.title}
          title={tile.title}
          value={tile.value}
          hint={tile.hint}
        />
      ))}
    </div>
  );
}
