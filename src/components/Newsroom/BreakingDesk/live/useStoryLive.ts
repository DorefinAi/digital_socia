"use client";

// Live presence for the story open in the editor (src/lib/socia/live.tsx does the connection):
//   - holding the lock: be on the story as "edit" and send the Tweet box's text and cursor as they change;
//   - someone else holds it: be on it as "watch", keep their latest text and cursor, notice when they leave;
//   - asking the holder to hand the story over, and the holder hearing that ask.
// Without a connection this does nothing and the editor behaves exactly as before.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import * as socia from "@/lib/socia/api";
import { useLiveActions, useLiveStatus, useStoryPresence, type LiveEditState, type LiveEvents } from "@/lib/socia/live";
import { LONG_TEXT_MARK, PRESENCE_COLORS, askReducer, firstName, groupPresence, type AskState } from "@/lib/socia/liveCore";
import type { Lease } from "./LiveEditor";

/** How long an ask to take over waits for an answer (the server forgets it after the same time) */
export const TAKEOVER_WAIT_MS = 60_000;

export type TakeoverAsk = AskState;

export interface TakeoverRequest {
  userId: string;
  name: string;
  color: string;
}

export interface StoryLive {
  connected: boolean;
  /** The stream had worked and dropped: watch mode says "Live view unavailable" */
  dropped: boolean;
  /** Someone else holds the story and live presence is up: the Tweet box shows their text */
  watching: boolean;
  /** Who holds the story, as live presence knows them (name and colour for the banner and the box) */
  holder: { name: string; color: string } | null;
  /** The holder's latest text and cursor (watch mode), with when it arrived here */
  remote: (LiveEditState & { receivedAt: number }) | null;
  /** The holder's post is too long to stream: the box shows the saved draft instead */
  remoteLong: boolean;
  /** The story is free (the holder left): their first name, for the green banner */
  gone: string | null;
  /** This person handed the story to someone (first name) who hasn't taken it yet */
  handedTo: string | null;
  markHandedOver: (name: string) => void;
  ask: TakeoverAsk;
  askTakeover: () => void;
  /** Someone asked this holder for the story */
  incoming: TakeoverRequest | null;
  /** Keep editing: tells the asker no */
  decline: () => void;
  /** Hand over, after the caller saved and before it releases: tells the asker yes. Resolves to an error code or null. */
  accept: () => Promise<string | null>;
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
  const { setStory, sendState, flushState, on, requestTakeover, answerTakeover } = actions;
  const { connected, dropped } = useLiveStatus();
  const entries = useStoryPresence(draftId);
  const mine = lease?.kind === "mine";
  const held = lease?.kind === "held";
  const heldName = lease?.kind === "held" ? lease.name : null;
  const mode = mine ? "edit" : "watch";
  const hasLease = !!lease;

  // Latest values for the event handlers below, which subscribe once per story
  const leaseRef = useRef(lease);
  const callbacks = useRef({ onClaimedBy, onAccepted, onFreed });
  const latest = useRef({ draftId, text, textarea, version, mine, connected });
  const actionsMe = useRef(actions.me);
  useEffect(() => {
    actionsMe.current = actions.me;
    leaseRef.current = lease;
    callbacks.current = { onClaimedBy, onAccepted, onFreed };
    latest.current = { draftId, text, textarea, version, mine, connected };
  });

  // ─── Holder: send the text and cursor ──────────────────────────────────────
  const push = useCallback(
    (now = false) => {
      const l = latest.current;
      if (!l.mine || !l.connected || !l.draftId) return;
      const ta = l.textarea;
      // The cursor counts only while the box has focus; otherwise it rests at the end of the text
      const focused = !!ta && document.activeElement === ta;
      const selStart = focused ? ta.selectionStart : l.text.length;
      const selEnd = focused ? ta.selectionEnd : l.text.length;
      sendState({ draftId: l.draftId, text: l.text, selStart, selEnd, version: l.version() });
      if (now) flushState();
    },
    [sendState, flushState],
  );

  // ─── Where this tab is: the story and mode, one join when only the mode changes ──
  useEffect(() => {
    if (!draftId || !hasLease) return;
    void setStory({ draftId, mode }).then((ack) => {
      // Watchers who join now get this as their snapshot, even before the holder types
      if (ack.ok && mode === "edit") push(true);
    });
  }, [draftId, mode, hasLease, setStory, push]);
  // Off the story when the editor closes, or no story is open
  useEffect(() => {
    if (!draftId || !hasLease) void setStory(null);
  }, [draftId, hasLease, setStory]);
  useEffect(() => () => void setStory(null), [setStory]);

  // Back after a dropped stream (the provider joins again): send the holder's state once more
  useEffect(() => {
    if (connected && mine) push(true);
  }, [connected, mine, push]);

  // Every change of the Tweet text
  useEffect(() => {
    if (mine && connected) push();
  }, [text, mine, connected, push]);

  // Cursor and selection moves in the Tweet box
  useEffect(() => {
    if (!mine || !connected || !textarea) return;
    const moved = () => push();
    const onDocSelection = () => document.activeElement === textarea && push();
    const events = ["select", "keyup", "mouseup", "focus", "blur"] as const;
    for (const e of events) textarea.addEventListener(e, moved);
    document.addEventListener("selectionchange", onDocSelection);
    return () => {
      for (const e of events) textarea.removeEventListener(e, moved);
      document.removeEventListener("selectionchange", onDocSelection);
    };
  }, [mine, connected, textarea, push]);

  // ─── Watcher: the holder's text, and noticing that they left ──────────────
  const [remote, setRemote] = useState<StoryLive["remote"]>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [handedTo, setHandedTo] = useState<string | null>(null);
  const [ask, dispatchAsk] = useReducer(askReducer, { state: "idle" } as AskState);
  const [incoming, setIncoming] = useState<TakeoverRequest | null>(null);

  // A new story, or a new holder: start over (a hand-over in progress stays until the new holder shows up)
  const [seen, setSeen] = useState<{ draftId: string | null; holder: string | null }>({ draftId, holder: heldName });
  if (seen.draftId !== draftId || seen.holder !== heldName) {
    setSeen({ draftId, holder: heldName });
    setRemote(null);
    setGone(null);
    if (seen.draftId !== draftId) setHandedTo(null);
    if (ask.state !== "idle") dispatchAsk({ type: "reset" });
  }
  if (incoming && !mine) setIncoming(null);
  if (ask.state !== "idle" && !held) dispatchAsk({ type: "reset" });

  const holderName = useRef<string | null>(null);
  const askRef = useRef(ask);
  useEffect(() => {
    holderName.current = remote?.name ?? heldName;
    askRef.current = ask;
  });

  useEffect(() => {
    if (!draftId) return;
    const free = () => {
      setGone(firstName(holderName.current ?? "Someone"));
      callbacks.current.onFreed();
    };
    // Ask the server whether anyone else still holds the story; free if not
    const checkFree = () =>
      void socia
        .fetchDraft(draftId)
        .then((d) => {
          if (leaseRef.current?.kind === "held" && !(d.claim && !d.claim.mine)) free();
        })
        .catch(() => undefined);
    const onState = (s: LiveEditState) => {
      // A state from this person's own other tab shows too; this tab ignores states only while it holds the story
      if (s.draftId !== draftId || leaseRef.current?.kind === "mine") return;
      setRemote({ ...s, receivedAt: Date.now() });
      setGone(null);
      setHandedTo(null);
    };
    // The holder's live text ended: they released, closed, or only dropped off. Ask the server which.
    const onEnded = (e: LiveEvents["edit.ended"]) => {
      if (e.draftId === draftId && leaseRef.current?.kind === "held") checkFree();
    };
    const onQueue = (e: LiveEvents["queue.draft"]) => {
      const l = leaseRef.current;
      if (e.draftId !== draftId || l?.kind !== "held") return;
      if (e.type === "draft.released") free();
      // A fix ends without a release: the story stays posted and is free again
      else if (e.type === "draft.updated" && l.fixing) checkFree();
      else if (e.type === "draft.claimed" && e.userId && e.userId !== actionsMe.current && e.name) {
        // Someone took the free story first, or another person holds it now
        setGone(null);
        setHandedTo(null);
        if (l.name !== e.name) callbacks.current.onClaimedBy(e.name);
      }
    };
    const offs = [on("edit.state", onState), on("edit.snapshot", onState), on("edit.ended", onEnded), on("queue.draft", onQueue)];
    return () => offs.forEach((off) => off());
  }, [draftId, on]);

  // ─── Asking to take over (watcher) ─────────────────────────────────────────
  const askTakeover = useCallback(() => {
    const l = leaseRef.current;
    if (!draftId || l?.kind !== "held") return;
    const name = firstName(holderName.current ?? l.name);
    dispatchAsk({ type: "ask", name });
    void requestTakeover(draftId).then((ack) => {
      if (ack.ok) dispatchAsk({ type: "sent" });
      else {
        dispatchAsk({ type: "refused", error: ack.error, status: ack.status });
        if (ack.error === "no_holder") setGone(name);
      }
    });
  }, [draftId, requestTakeover]);

  // The wait for an answer runs only while the ask is out; a story or holder change resets the ask, which ends it
  const askWaiting = ask.state === "asking" && ask.waiting;
  useEffect(() => {
    if (!askWaiting) return;
    const t = setTimeout(() => dispatchAsk({ type: "timeout" }), TAKEOVER_WAIT_MS);
    return () => clearTimeout(t);
  }, [askWaiting]);

  useEffect(() => {
    if (!draftId) return;
    return on("takeover.answered", (a) => {
      // Only an answer to this tab's own ask counts
      if (a.draftId !== draftId || askRef.current.state !== "asking") return;
      dispatchAsk({ type: "answered", accept: a.accept, name: firstName(a.by?.name ?? holderName.current ?? "They") });
      if (a.accept) callbacks.current.onAccepted();
    });
  }, [draftId, on]);

  // ─── Being asked (holder) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!draftId) return;
    return on("takeover.requested", (r) => {
      if (r.draftId !== draftId || leaseRef.current?.kind !== "mine" || !r.from?.userId) return;
      setIncoming({ userId: r.from.userId, name: r.from.name || "Someone", color: r.from.color });
    });
  }, [draftId, on]);
  // An unanswered ask runs out on the server; the dialog goes with it
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => setIncoming(null), TAKEOVER_WAIT_MS);
    return () => clearTimeout(t);
  }, [incoming]);

  const decline = useCallback(() => {
    const r = incoming;
    setIncoming(null);
    if (r && draftId) void answerTakeover(draftId, r.userId, false);
  }, [incoming, draftId, answerTakeover]);
  const accept = useCallback(async () => {
    const r = incoming;
    setIncoming(null);
    if (!r || !draftId) return "no_request";
    const ack = await answerTakeover(draftId, r.userId, true);
    return ack.ok ? null : (ack.error ?? "failed");
  }, [incoming, draftId, answerTakeover]);
  const markHandedOver = useCallback((name: string) => setHandedTo(firstName(name)), []);

  const editor = groupPresence(entries).editor;
  const holder = remote
    ? { name: remote.name, color: remote.color || PRESENCE_COLORS[1] }
    : editor && !mine
      ? { name: editor.name, color: editor.color }
      : heldName
        ? { name: heldName, color: PRESENCE_COLORS[1] }
        : null;

  return {
    connected,
    dropped,
    watching: connected && held,
    holder,
    remote,
    remoteLong: remote?.text === LONG_TEXT_MARK,
    gone,
    handedTo,
    markHandedOver,
    ask,
    askTakeover,
    incoming,
    decline,
    accept,
  };
}
