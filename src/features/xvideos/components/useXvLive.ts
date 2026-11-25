// The X Videos desk's live list (NEXT_PUBLIC_XVIDEOS_SOURCE=api): asks the backend for the clips every 15 s and on
// Refresh, and fetches the open clip's transcript. In demo mode it does nothing.

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { XVIDEOS_SOURCE } from "../lib/source";
import { ApiError } from "@/lib/socia/client";
import { fetchXvClip, fetchXvClips } from "../lib/api";
import type { DeskAction } from "./deskState";

export const XV_POLL_MS = 15_000;
/** A list request slower than this counts as failed, so a stuck one never blocks the next poll */
const LIST_TIMEOUT_MS = 20_000;

export interface XvLive {
  mode: "demo" | "api";
  /** The first list arrived */
  loaded: boolean;
  /** The last list request failed: what to tell the desk */
  error: string | null;
  updatedAt: number;
  /** Asks for the list now (Refresh); a poll while one is in flight is skipped */
  refresh: () => void;
}

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : "Can't reach the Socia server.");

export function useXvLive(dispatch: Dispatch<DeskAction>): XvLive {
  const live = XVIDEOS_SOURCE === "api";
  const [loaded, setLoaded] = useState(!live);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(
    (manual: boolean) => {
      if (!live) {
        setUpdatedAt(Date.now());
        return;
      }
      // A poll waits for the request in flight; a manual Refresh replaces it
      if (inflight.current && !manual) return;
      inflight.current?.abort();
      const ctl = new AbortController();
      inflight.current = ctl;
      const signal = AbortSignal.any([ctl.signal, AbortSignal.timeout(LIST_TIMEOUT_MS)]);
      fetchXvClips(signal)
        .then(
          (clips) => {
            if (ctl.signal.aborted) return;
            dispatch({ type: "clips/sync", clips });
            setLoaded(true);
            setError(null);
            setUpdatedAt(Date.now());
          },
          (err) => {
            if (ctl.signal.aborted) return;
            setError(signal.aborted ? "The clips list is taking too long. Trying again." : messageOf(err));
          },
        )
        .finally(() => {
          if (inflight.current === ctl) inflight.current = null;
        });
    },
    [live, dispatch],
  );

  useEffect(() => {
    if (!live) return;
    load(true);
    const t = setInterval(() => load(false), XV_POLL_MS);
    return () => {
      clearInterval(t);
      inflight.current?.abort();
      inflight.current = null;
    };
  }, [live, load]);

  const refresh = useCallback(() => load(true), [load]);
  return useMemo(() => ({ mode: live ? "api" : "demo", loaded, error, updatedAt, refresh }), [live, loaded, error, updatedAt, refresh]);
}

/**
 * The open clip's transcript and stills (the list leaves them out), fetched when the editor shows a clip, also on
 * Prev / Next. A clip left before its answer came is cancelled; a failure leaves the editor's "no speech" note as is.
 */
export function useXvClipDetail(dispatch: Dispatch<DeskAction>, clipId: string | null): void {
  useEffect(() => {
    if (XVIDEOS_SOURCE !== "api" || !clipId) return;
    const ctl = new AbortController();
    fetchXvClip(clipId, ctl.signal).then(
      (clip) => {
        if (!ctl.signal.aborted) dispatch({ type: "clip/detail", clip });
      },
      () => undefined,
    );
    return () => ctl.abort();
  }, [dispatch, clipId]);
}
