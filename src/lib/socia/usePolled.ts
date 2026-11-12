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
 *
 * Only the latest request counts: starting one cancels the one in flight (its `signal` aborts), and a key
 * change or unmount cancels too, so a slow answer for an old key (an earlier day's pages) never lands.
 */
export function usePolled<T>(fetcher: (signal: AbortSignal) => Promise<T>, intervalMs: number, key: string, enabled = true): Polled<T> {
  const [state, setState] = useState<{ key: string; data: T | null; error: Error | null; loaded: boolean }>({ key, data: null, error: null, loaded: false });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const request = new AbortController();
    inFlight.current = request;
    try {
      const data = await fetcherRef.current(request.signal);
      if (request.signal.aborted) return;
      setState({ key, data, error: null, loaded: true });
    } catch (err) {
      if (request.signal.aborted) return;
      setState((s) => ({ key, data: s.key === key ? s.data : null, error: err as Error, loaded: true }));
    } finally {
      if (inFlight.current === request) inFlight.current = null;
    }
  }, [key]);

  // A new key (or leaving the page) cancels what the old key still has in flight
  useEffect(
    () => () => {
      inFlight.current?.abort();
      inFlight.current = null;
    },
    [key],
  );

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
