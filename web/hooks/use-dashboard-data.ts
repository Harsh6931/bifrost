"use client";

import { useApiData } from "@/hooks/use-api-data";

/**
 * Wraps useApiData with a sample-data fallback so the dashboard is never a
 * wall of empty cards during a demo. Falls back when the API errors or comes
 * back with nothing to show; real rows always win.
 *
 * Set NEXT_PUBLIC_BIFROST_DEMO=0 to disable the fallback entirely.
 */
export function useDashboardData<T>(
  url: string,
  demo: () => T,
  isEmpty: (data: T) => boolean,
): {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
  isDemo: boolean;
} {
  const { data, error, loading, refetch } = useApiData<T>(url);
  const allowDemo = process.env.NEXT_PUBLIC_BIFROST_DEMO !== "0";

  if (loading) {
    return { data: null, error: null, loading, refetch, isDemo: false };
  }

  const missing = error !== null || data === null || isEmpty(data);

  if (missing && allowDemo) {
    return { data: demo(), error: null, loading: false, refetch, isDemo: true };
  }

  return { data, error, loading, refetch, isDemo: false };
}
