// The X Videos desk's live list (NEXT_PUBLIC_XVIDEOS_SOURCE=api): asks the backend for one day folder's clips every
// 15 s and on Refresh, keeps the day folders list fresh for the day picker, and fetches the open clip's transcript.
// In demo mode they do nothing (the folders are the demo's one day).

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { XVIDEOS_SOURCE } from "../lib/source";
import { ApiError } from "@/lib/socia/client";
import { fetchXvClip, fetchXvClips, fetchXvFolders, rescanXvDay } from "../lib/api";
import type { XvFolders } from "../lib/folders";
import type { DeskAction } from "./deskState";

export const XV_POLL_MS = 15_000;
/** The day folders list is asked again this often, so the picker's counts and "today" follow the share */
export const XV_FOLDERS_POLL_MS = 60_000;
/**
 * After Refresh asks the backend to walk the share, the list is asked again at these times (ms): the walk starts within
 * ~3 s and runs again 10 s later, and a new file is listed once two walks see the same size
 */
export const XV_RESCAN_RELOADS_MS = [5_000, 15_000];
/** A list request slower than this counts as failed, so a stuck one never blocks the next poll */
const LIST_TIMEOUT_MS = 20_000;

export interface XvLive {
  mode: "demo" | "api";
  /** The first list arrived */
  loaded: boolean;
  /** The day folder of the last list that arrived (null before the first, and in demo mode) */
  loadedDay: string | null;
  /** The last list request failed: what to tell the desk */
  error: string | null;
  updatedAt: number;
  /**
   * Refresh: asks the backend to walk the shown day folder now, then asks for the list at once and twice more over
   * ~15 s. A second call meanwhile does nothing. Demo: moves the "Updated" time on only
   */
  refresh: () => void;
  /** Asks for the list again now (no share walk): after a desk action the backend refused */
  reload: () => void;
  /** A Refresh is still checking the share (the ~15 s after it) */
  checking: boolean;
}

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : "Can't reach the Socia server.");

/**
 * `day` is the day folder the desk picked, or null to follow today's: the backend picks today (IST), so when the date
 * rolls over while the desk is open the next poll brings the new day's folder. A new `day` asks at once, restarts the
 * poll and cancels a Refresh check.
 *
 * `holdDay` (used only while `day` is null) is asked for instead of today's: the desk holds the shown day while a clip
 * is open, so a midnight rollover never pulls the clip from under the editor. It is read when a request goes out, so
 * opening or closing a clip changes nothing else: no extra request, and a Refresh check carries on.
 */
export function useXvLive(dispatch: Dispatch<DeskAction>, day: string | null, holdDay: string | null = null): XvLive {
  const live = XVIDEOS_SOURCE === "api";
  const [loaded, setLoaded] = useState(!live);
  const [loadedDay, setLoadedDay] = useState<string | null>(null);
  // The last failure, with the picked day it was for: an error on one day never shows on another
  const [failure, setFailure] = useState<{ day: string | null; text: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const checkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const holdRef = useRef(holdDay);
  useEffect(() => {
    holdRef.current = holdDay;
  }, [holdDay]);

  const load = useCallback(
    (manual: boolean) => {
      // A poll waits for the request in flight; a manual Refresh replaces it
      if (inflight.current && !manual) return;
      inflight.current?.abort();
      const ctl = new AbortController();
      inflight.current = ctl;
      const signal = AbortSignal.any([ctl.signal, AbortSignal.timeout(LIST_TIMEOUT_MS)]);
      const requestedAt = Date.now();
      fetchXvClips(day ?? holdRef.current, signal)
        .then(
          (res) => {
            if (ctl.signal.aborted) return;
            dispatch({ type: "clips/sync", day: res.day, clips: res.clips, requestedAt });
            setLoaded(true);
            setLoadedDay(res.day);
            setFailure(null);
            setUpdatedAt(Date.now());
          },
          (err) => {
            if (ctl.signal.aborted) return;
            setFailure({ day, text: signal.aborted ? "The clips list is taking too long. Trying again." : messageOf(err) });
          },
        )
        .finally(() => {
          if (inflight.current === ctl) inflight.current = null;
        });
    },
    [dispatch, day],
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

  // Read by Refresh, so a second click during a check does nothing even before React re-renders
  const checkingRef = useRef(false);
  // Bumped when a check is cut short, so a walk request answered after a day change never loads the old day
  const checkGen = useRef(0);
  // A check in progress stops with the desk, or with a picked day change (whose own load starts at once)
  useEffect(
    () => () => {
      checkTimers.current.forEach(clearTimeout);
      checkTimers.current = [];
      checkGen.current += 1;
      checkingRef.current = false;
      setChecking(false);
      setRescanError(null);
    },
    [load],
  );

  const refresh = useCallback(() => {
    if (!live) {
      setUpdatedAt(Date.now());
      return;
    }
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setRescanError(null);
    const gen = checkGen.current;
    // The list is asked again whether or not the walk could be asked for: Refresh still shows what is listed
    rescanXvDay(day ?? holdRef.current, AbortSignal.timeout(LIST_TIMEOUT_MS)).then(
      () => {
        if (gen === checkGen.current) load(true);
      },
      (err) => {
        if (gen !== checkGen.current) return;
        setRescanError(messageOf(err));
        load(true);
      },
    );
    const last = XV_RESCAN_RELOADS_MS[XV_RESCAN_RELOADS_MS.length - 1];
    checkTimers.current = XV_RESCAN_RELOADS_MS.map((ms) =>
      setTimeout(() => {
        load(true);
        if (ms === last) {
          checkingRef.current = false;
          setChecking(false);
          setRescanError(null);
        }
      }, ms),
    );
  }, [live, load, day]);

  const reload = useCallback(() => {
    if (live) load(true);
  }, [live, load]);

  // A failed walk request shows like a failed list, for the ~15 s of the check
  const error = failure && failure.day === day ? failure.text : null;
  const shownError = error ?? rescanError;
  return useMemo(
    () => ({ mode: live ? "api" : "demo", loaded, loadedDay, error: shownError, updatedAt, refresh, reload, checking }),
    [live, loaded, loadedDay, shownError, updatedAt, refresh, reload, checking],
  );
}

export interface XvFoldersLive {
  /** null until the first answer (live) */
  folders: XvFolders | null;
  error: string | null;
  /** Asks again now (the picker opening, or a list from a day the folders don't know yet); while a request is in flight, once more after it */
  refresh: () => void;
}

/** The day folders for the picker: live, asked on mount and every minute; demo, the `demo` list as given (null when live) */
export function useXvFolders(demo: XvFolders | null): XvFoldersLive {
  const live = XVIDEOS_SOURCE === "api";
  const [folders, setFolders] = useState<XvFolders | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);
  // A refresh asked while a request was in flight: that answer may be older than the reason to ask (midnight)
  const again = useRef(false);

  const load = useCallback(() => {
    if (!live) return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    const run = () => {
      const ctl = new AbortController();
      inflight.current = ctl;
      fetchXvFolders(AbortSignal.any([ctl.signal, AbortSignal.timeout(LIST_TIMEOUT_MS)]))
        .then(
          (f) => {
            if (ctl.signal.aborted) return;
            setFolders(f);
            setError(null);
          },
          (err) => {
            if (!ctl.signal.aborted) setError(messageOf(err));
          },
        )
        .finally(() => {
          if (inflight.current !== ctl) return;
          inflight.current = null;
          if (again.current && !ctl.signal.aborted) {
            again.current = false;
            run();
          }
        });
    };
    run();
  }, [live]);

  useEffect(() => {
    if (!live) return;
    load();
    const t = setInterval(load, XV_FOLDERS_POLL_MS);
    return () => {
      clearInterval(t);
      inflight.current?.abort();
      inflight.current = null;
      again.current = false;
    };
  }, [live, load]);

  return useMemo(() => ({ folders: live ? folders : demo, error: live ? error : null, refresh: load }), [live, folders, demo, error, load]);
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
