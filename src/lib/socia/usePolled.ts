"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Polled<T> {
  data: T | null;
  error: Error | null;
  /** True until the first answer (or error) arrives */
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Loads `fetcher` now and again every `intervalMs` while the tab is visible, and on focus.
 * Stands in for the backend's Socket.IO events, which this app does not subscribe to
 * because socket.io-client is not a dependency. Pass `enabled: false` to pause.
 */
export function usePolled<T>(fetcher: () => Promise<T>, intervalMs: number, key: string, enabled = true): Polled<T> {
  const [state, setState] = useState<{ key: string; data: T | null; error: Error | null; loaded: boolean }>({ key, data: null, error: null, loaded: false });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const refresh = useCallback(async () => {
    try {
      const data = await fetcherRef.current();
      setState({ key, data, error: null, loaded: true });
    } catch (err) {
      setState((s) => ({ key, data: s.key === key ? s.data : null, error: err as Error, loaded: true }));
    }
  }, [key]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, intervalMs, enabled]);

  // A key change (e.g. switching tabs) shows nothing stale from the previous key
  const current = state.key === key;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !current || !state.loaded, refresh };
}
