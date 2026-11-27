"use client";

// The X Videos desk's actions on the backend (step 6 routes), live data only: Copy & Mark Posted, undo, reject,
// restore, and the editor's draft. The desk shows each action at once (deskState); the backend's answer then settles it
// ("clip/server"). When the backend refuses (someone else posted the clip a moment ago, the undo window has passed), the
// refusal is shown and the list is asked again, so the desk shows what really stands.
//
// Drafts are saved a moment after the last change (DRAFT_SAVE_MS), only for clips still to post, and only when they
// differ from what was last saved; in the demo nothing is sent.

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { XvClip } from "../data/xVideosData";
import { postXvClip, rejectXvClip, restoreXvClip, saveXvDraft, undoXvPost } from "../lib/api";
import { postedParts, savedDraftOf, type DeskAction, type DeskState, type XvDraft } from "./deskState";

/** A draft is saved this long after its last change */
export const DRAFT_SAVE_MS = 1500;

const message = (err: unknown) => (err instanceof Error && err.message ? err.message : "The server did not take that; the list is shown as it stands.");

export interface XvActions {
  post: (id: string, text: string, draft: XvDraft) => void;
  undo: (id: string) => void;
  reject: (id: string, reason: string) => void;
  restore: (id: string) => void;
  error: string | null;
  clearError: () => void;
}

export function useXvActions(live: boolean, dispatch: Dispatch<DeskAction>, state: DeskState, reload: () => void): XvActions {
  const [error, setError] = useState<string | null>(null);
  // The clips as the last render saw them (undo needs the post's id from the backend's answer)
  const clipsRef = useRef<readonly XvClip[]>(state.clips);
  useEffect(() => {
    clipsRef.current = state.clips;
  }, [state.clips]);

  const send = useCallback(
    (call: () => Promise<XvClip>) => {
      if (!live) return;
      call().then(
        (clip) => dispatch({ type: "clip/server", clip }),
        (err: unknown) => {
          setError(message(err));
          reload();
        },
      );
    },
    [live, dispatch, reload],
  );

  const post = useCallback((id: string, text: string, draft: XvDraft) => send(() => postXvClip(id, { text, title: draft.title, ...postedParts(draft) })), [send]);
  const undo = useCallback(
    (id: string) => {
      if (!live) return;
      const postId = clipsRef.current.find((c) => c.id === id)?.postId;
      if (!postId) {
        // The post's answer has not come back yet: nothing to name, so the list is asked again
        setError("That post is still being saved; try Undo again in a moment.");
        reload();
        return;
      }
      send(() => undoXvPost(id, postId));
    },
    [live, send, reload],
  );
  const reject = useCallback((id: string, reason: string) => send(() => rejectXvClip(id, reason)), [send]);
  const restore = useCallback((id: string) => send(() => restoreXvClip(id)), [send]);

  // Drafts: saved DRAFT_SAVE_MS after their last change, for clips still to post
  const saved = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (!live) return;
    for (const [id, draft] of Object.entries(state.drafts)) {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip || clip.status !== "new") continue;
      const body = savedDraftOf(draft);
      const key = JSON.stringify(body);
      if (saved.current.get(id) === key || (!saved.current.has(id) && clip.savedDraft && JSON.stringify(clip.savedDraft) === key)) continue;
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          saved.current.set(id, key);
          saveXvDraft(id, body).then(
            () => undefined,
            (err: unknown) => {
              saved.current.delete(id);
              setError(message(err));
            },
          );
        }, DRAFT_SAVE_MS),
      );
    }
  }, [live, state.drafts, state.clips]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { post, undo, reject, restore, error, clearError };
}
