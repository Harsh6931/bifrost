"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function WidgetSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-muted"
      style={{ height }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function WidgetError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Couldn&apos;t load data</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      {onRetry ? (
        <CardContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function WidgetEmpty({ hint }: { hint: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>No data yet</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
    </Card>
  );
}
