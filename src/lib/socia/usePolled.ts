"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { answerKey, focusRefreshDelay, sameAsShown, type ShownAnswer } from "./pollEqual";

export interface Polled<T> {
  data: T | null;
  error: Error | null;
  /** True until the first answer (or error) arrives */
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * A refresh that never cancels one already running: with a request in flight it asks for one more read after
   * it, else it reads now. For live queue events, which must not keep aborting a slow read.
   */
  nudge: () => void;
}

/**
 * Loads `fetcher` now and again every `intervalMs` while the tab is visible, and on focus.
 * The desk's source of truth: live presence (src/lib/socia/live.tsx) only makes it refresh sooner when a
 * queue event arrives, and a desk without the live stream relies on it alone. Pass `enabled: false` to pause.
 *
 * Only the latest request counts: starting one cancels the one in flight (its `signal` aborts), and a key
 * change or unmount cancels too, so a slow answer for an old key (an earlier day's pages) never lands.
 *
 * An answer that reads the same as the one on screen changes nothing: the hook keeps its old object (and does
 * not re-render), so views memoised on `data` or on the returned object skip the work.
 */
export function usePolled<T>(fetcher: (signal: AbortSignal) => Promise<T>, intervalMs: number, key: string, enabled = true): Polled<T> {
  const [state, setState] = useState<{ key: string; data: T | null; error: Error | null; loaded: boolean }>({ key, data: null, error: null, loaded: false });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const inFlight = useRef<AbortController | null>(null);
  // A nudge came while a read was in flight: read once more when it ends
  const again = useRef(false);
  // What is on screen now, as a string, so an unchanged answer can be told apart without a render
  const shown = useRef<ShownAnswer | null>(null);
  // When the last read ended (answer or error); a window focus right after one skips its refresh
  const lastDoneAt = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const request = new AbortController();
    inFlight.current = request;
    try {
      const data = await fetcherRef.current(request.signal);
      if (request.signal.aborted) return;
      lastDoneAt.current = Date.now();
      const json = answerKey(data);
      if (sameAsShown(shown.current, key, json)) return;
      shown.current = { key, json, ok: true };
      setState({ key, data, error: null, loaded: true });
    } catch (err) {
      if (request.signal.aborted) return;
      lastDoneAt.current = Date.now();
      // The error shows over the data, so the next good answer must be set even if it reads the same
      if (shown.current?.key === key) shown.current = { ...shown.current, ok: false };
      else shown.current = null;
      setState((s) => ({ key, data: s.key === key ? s.data : null, error: err as Error, loaded: true }));
    } finally {
      if (inFlight.current === request) {
        inFlight.current = null;
        if (again.current) {
          again.current = false;
          void refreshRef.current();
        }
      }
    }
  }, [key]);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const nudge = useCallback(() => {
    if (inFlight.current) again.current = true;
    else void refresh();
  }, [refresh]);

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
    // Every poller on the page hears the same focus; a fresh answer skips it and the rest spread out a little
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => {
      const wait = focusRefreshDelay(lastDoneAt.current, Date.now(), intervalMs);
      if (wait === null) return;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        if (!stopped) void refresh();
      }, wait);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(focusTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, intervalMs, enabled]);

  // A key change (e.g. switching tabs) shows nothing stale from the previous key
  const current = state.key === key;
  const data = current ? state.data : null;
  const error = current ? state.error : null;
  const loading = !current || !state.loaded;
  // The same object while nothing in it changed, so a context or memo built on it holds between polls
  return useMemo(() => ({ data, error, loading, refresh, nudge }), [data, error, loading, refresh, nudge]);
}
