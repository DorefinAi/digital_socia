"use client";

// The X Videos desk's actions on the backend (step 6 routes), live data only: Copy & Mark Posted, undo, reject,
// restore, and the editor's draft. The desk shows each action at once (deskState) and marks the clip as acted on
// ("clip/sending"); only the answer to the clip's newest action settles it ("clip/server"), so a slow answer to an
// older action never wins. When the backend refuses or cannot be reached, the refusal is shown, the clip's mark is
// dropped ("clip/failed") and the list is asked again, so the desk shows what really stands.
//
// Drafts are saved a moment after the last change (DRAFT_SAVE_MS), only for clips still to post and only when they
// differ from what was last saved; a draft that failed is not sent again until it changes; a save still waiting when
// the clip is posted or rejected is dropped, and one waiting when the desk closes is sent at once. The demo sends
// nothing.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch } from "react";
import type { XvClip, XvSavedDraft } from "../data/xVideosData";
import { postXvClip, rejectXvClip, restoreXvClip, saveXvDraft, undoXvPost } from "../lib/api";
import { postedParts, savedDraftOf, type DeskAction, type DeskState, type XvDraft } from "./deskState";

/** A draft is saved this long after its last change */
export const DRAFT_SAVE_MS = 1500;

const message = (err: unknown) => (err instanceof Error && err.message ? err.message : "The server did not take that; the list is shown as it stands.");

export interface XvActions {
  post: (id: string, text: string, draft: XvDraft) => void;
  /** False (nothing sent, nothing to show) while the post's own answer is still on its way */
  undo: (id: string) => boolean;
  reject: (id: string, reason: string) => void;
  restore: (id: string) => void;
  /** The last refusal, with a counter so the same text shown twice is announced again */
  error: { text: string; n: number } | null;
  clearError: () => void;
}

export function useXvActions(live: boolean, dispatch: Dispatch<DeskAction>, state: DeskState, reload: () => void): XvActions {
  const [error, setError] = useState<{ text: string; n: number } | null>(null);
  const showError = useCallback((text: string) => setError((e) => ({ text, n: (e?.n ?? 0) + 1 })), []);
  // The latest state for the callbacks (written before paint, never during render)
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  /** Per clip, the number of its newest action: only that action's answer counts */
  const seq = useRef(new Map<string, number>());

  // Drafts waiting to be saved: the timer and the body it will send
  const timers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; body: XvSavedDraft; key: string }>());
  const saved = useRef(new Map<string, string>());
  const failed = useRef(new Map<string, string>());
  const dropDraftSave = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t.timer);
    timers.current.delete(id);
  }, []);

  const send = useCallback(
    (id: string, call: () => Promise<XvClip>) => {
      if (!live) return;
      const n = (seq.current.get(id) ?? 0) + 1;
      seq.current.set(id, n);
      dispatch({ type: "clip/sending", id, at: Date.now() });
      call().then(
        (clip) => {
          if (seq.current.get(id) === n) dispatch({ type: "clip/server", clip });
        },
        (err: unknown) => {
          if (seq.current.get(id) !== n) return;
          dispatch({ type: "clip/failed", id });
          showError(message(err));
          reload();
        },
      );
    },
    [live, dispatch, reload, showError],
  );

  const post = useCallback(
    (id: string, text: string, draft: XvDraft) => {
      dropDraftSave(id);
      send(id, () => postXvClip(id, { text, title: draft.title, ...postedParts(draft) }));
    },
    [send, dropDraftSave],
  );
  const undo = useCallback(
    (id: string) => {
      if (!live) return true;
      const s = stateRef.current;
      const postId = s.clips.find((c) => c.id === id)?.postId;
      if (s.acted?.[id]?.pending || !postId) {
        showError("That post is still being saved; press Undo again in a moment.");
        return false;
      }
      send(id, () => undoXvPost(id, postId));
      return true;
    },
    [live, send, showError],
  );
  const reject = useCallback(
    (id: string, reason: string) => {
      dropDraftSave(id);
      send(id, () => rejectXvClip(id, reason));
    },
    [send, dropDraftSave],
  );
  const restore = useCallback((id: string) => send(id, () => restoreXvClip(id)), [send]);

  // Drafts: saved DRAFT_SAVE_MS after their last change, for clips still to post
  const saveNow = useCallback(
    (id: string, body: XvSavedDraft, key: string) => {
      timers.current.delete(id);
      saved.current.set(id, key);
      saveXvDraft(id, body).then(
        () => failed.current.delete(id),
        (err: unknown) => {
          if (saved.current.get(id) === key) saved.current.delete(id);
          failed.current.set(id, key);
          showError(message(err));
        },
      );
    },
    [showError],
  );
  useEffect(() => {
    if (!live) return;
    for (const [id, draft] of Object.entries(state.drafts)) {
      const clip = state.clips.find((c) => c.id === id);
      const body = savedDraftOf(draft);
      const key = JSON.stringify(body);
      const waiting = timers.current.get(id);
      if (waiting?.key === key) continue;
      // A newer change replaces the one waiting (also when it goes back to what was saved)
      dropDraftSave(id);
      if (!clip || clip.status !== "new") continue;
      if (saved.current.get(id) === key || failed.current.get(id) === key) continue;
      if (!saved.current.has(id) && clip.savedDraft && JSON.stringify(clip.savedDraft) === key) continue;
      timers.current.set(id, { timer: setTimeout(() => saveNow(id, body, key), DRAFT_SAVE_MS), body, key });
    }
  }, [live, state.drafts, state.clips, saveNow, dropDraftSave]);
  // The desk closing: a draft still waiting is sent now, not lost
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const [id, t] of [...pending]) {
        clearTimeout(t.timer);
        pending.delete(id);
        saveXvDraft(id, t.body).catch(() => undefined);
      }
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { post, undo, reject, restore, error, clearError };
}
