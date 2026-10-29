"use client";

import { useMemo } from "react";
import { usePolled } from "@/lib/socia/usePolled";

const RELOAD_MS = 5 * 60_000;

export interface AnalyticsData<T> {
  data: T | null;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Live: loads `fetcher` for `key` and again every 5 minutes. Demo: `demo()` computed here.
 * `key` must change whenever the request does (range, platform, sort).
 */
export function useAnalyticsData<T>(live: boolean, key: string, fetcher: () => Promise<T>, demo: () => T): AnalyticsData<T> {
  const polled = usePolled<T>(fetcher, RELOAD_MS, key, live);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` describes everything `demo` reads
  const demoData = useMemo(() => (live ? null : demo()), [live, key]);
  if (!live) return { data: demoData, error: null, refresh: async () => {} };
  return { data: polled.data, error: polled.error, refresh: polled.refresh };
}
