"use client";

// Live presence for the story open in the editor (src/lib/socia/live.tsx does the connection):
//   - holding the lock: be on the story as "edit" and send the Tweet box's text and cursor as they change;
//   - someone else holds it: be on it as "watch", keep their latest text and cursor, notice when they leave;
//   - asking the holder to hand the story over, and the holder hearing that ask.
// Without a connection this does nothing and the editor behaves exactly as before.
//
// A thin shell over storyLiveCore.ts (createStoryLive), which holds the logic and is tested on its own: this hook
// feeds it the latest props after each render, reads its snapshot, and listens to the Tweet box's cursor.

import { useEffect, useState, useSyncExternalStore } from "react";
import * as socia from "@/lib/socia/api";
import { useLiveActions, useLiveStatus, useStoryPresence } from "@/lib/socia/live";
import type { AskState } from "@/lib/socia/liveCore";
import type { Lease } from "./LiveEditor";
import { createStoryLive, viewOf, type StoryLiveController, type StoryLiveView } from "./storyLiveCore";

export { TAKEOVER_WAIT_MS, type TakeoverRequest } from "./storyLiveCore";
export type TakeoverAsk = AskState;

export interface StoryLive extends StoryLiveView {
  connected: boolean;
  /** The stream had worked and dropped: watch mode says "Live view unavailable" */
  dropped: boolean;
  markHandedOver: (name: string) => void;
  askTakeover: () => void;
  /** Keep editing: tells the asker no */
  decline: () => void;
  /** Hand over, after the caller saved and before it releases: tells the asker yes. Resolves to an error code or null. */
  accept: () => Promise<string | null>;
  /** Drops the holder's text still waiting to go out (handing over) */
  dropPending: () => void;
}

export function useStoryLive({
  draftId,
  lease,
  text,
  textarea,
  version,
  onClaimedBy,
  onAccepted,
  onFreed,
}: {
  /** The open live draft; null on the demo desk */
  draftId: string | null;
  lease: Lease | null;
  /** The Tweet box's text */
  text: string;
  textarea: HTMLTextAreaElement | null;
  /** The draft version the editor works from */
  version: () => number;
  /** Someone else took the story (seen from a queue event) */
  onClaimedBy: (name: string) => void;
  /** The holder said yes to this tab's ask: claim the story */
  onAccepted: () => void;
  /** The story just became free (released, or a fix ended) */
  onFreed: () => void;
}): StoryLive {
  const actions = useLiveActions();
  const { connected, dropped } = useLiveStatus();
  const entries = useStoryPresence(draftId);

  const [ctl] = useState<StoryLiveController>(() =>
    createStoryLive({
      heldByOther: async (id) => {
        const d = await socia.fetchDraft(id);
        return !!(d.claim && !d.claim.mine);
      },
    }),
  );

  // The latest props, after every render (the controller ignores what didn't change)
  useEffect(() => {
    ctl.update({
      actions,
      draftId,
      lease,
      connected,
      me: actions.me,
      text,
      version,
      onClaimedBy,
      onAccepted,
      onFreed,
      // The cursor counts only while the box has focus; otherwise it rests at the end of the text
      selection: () => (textarea && document.activeElement === textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : null),
    });
  });
  useEffect(() => () => ctl.dispose(), [ctl]);

  // Cursor and selection moves in the Tweet box
  const mine = lease?.kind === "mine";
  useEffect(() => {
    if (!mine || !connected || !textarea) return;
    const moved = () => ctl.push();
    const onDocSelection = () => document.activeElement === textarea && ctl.push();
    const events = ["select", "keyup", "mouseup", "focus", "blur"] as const;
    for (const e of events) textarea.addEventListener(e, moved);
    document.addEventListener("selectionchange", onDocSelection);
    return () => {
      for (const e of events) textarea.removeEventListener(e, moved);
      document.removeEventListener("selectionchange", onDocSelection);
    };
  }, [mine, connected, textarea, ctl]);

  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  return {
    connected,
    dropped,
    ...viewOf(snap, { draftId, lease, connected, entries }),
    markHandedOver: ctl.markHandedOver,
    askTakeover: ctl.askTakeover,
    decline: ctl.decline,
    accept: ctl.accept,
    dropPending: ctl.dropPending,
  };
}
