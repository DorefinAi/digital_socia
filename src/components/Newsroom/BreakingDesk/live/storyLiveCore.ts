// The story-level live presence behind useStoryLive.ts, without React: where this tab is (join, leave, the mode),
// the holder's text going out, the holder's text coming in (watch mode), noticing the holder left, and asking
// for and handing over the story. useStoryLive is a thin shell: it feeds the latest props in with update() and
// reads the snapshot. The node test runner covers it (storyLiveCore.test.ts).

import { LONG_TEXT_MARK, PRESENCE_COLORS, askReducer, firstName, groupPresence, realClock, type AskEvent, type AskState, type Clock, type EditState, type LiveAnswerLike, type PresenceEntry, type StorySpot } from "../../../../lib/socia/liveCore";
import type { LiveEditState, LiveEvents } from "@/lib/socia/live";
import type { Lease } from "./LiveEditor";

/** How long an ask to take over waits for an answer (the server forgets it after the same time) */
export const TAKEOVER_WAIT_MS = 60_000;

export interface TakeoverRequest {
  userId: string;
  name: string;
  color: string;
}

export type RemoteState = LiveEditState & { receivedAt: number };

/** The tab's live calls (live.tsx useLiveActions), fed in with each update */
export interface StoryLiveActions {
  setStory: (spot: StorySpot | null) => Promise<LiveAnswerLike>;
  sendState: (s: EditState) => void;
  flushState: () => void;
  /** Drops text still waiting in the throttle, unsent */
  dropState: () => void;
  on: <K extends keyof LiveEvents>(event: K, handler: (payload: LiveEvents[K]) => void) => () => void;
  requestTakeover: (draftId: string) => Promise<LiveAnswerLike>;
  answerTakeover: (draftId: string, requesterId: string, accept: boolean) => Promise<LiveAnswerLike>;
}

export interface StoryLiveDeps {
  /** Asks the server whether someone other than this person still holds the story */
  heldByOther: (draftId: string) => Promise<boolean>;
  clock?: Clock;
}

export interface StoryLiveInput {
  actions: StoryLiveActions;
  /** The open live draft; null on the demo desk and for a story the live stream doesn't cover */
  draftId: string | null;
  lease: Lease | null;
  connected: boolean;
  /** The signed-in user's id */
  me: string | null;
  /** The Tweet box's text */
  text: string;
  /** The cursor in the Tweet box, or null when it hasn't the focus (the cursor then rests at the end of the text) */
  selection: () => { start: number; end: number } | null;
  /** The draft version the editor works from */
  version: () => number;
  /** Someone else took the story (seen from a queue event) */
  onClaimedBy: (name: string) => void;
  /** The holder said yes to this tab's ask: claim the story */
  onAccepted: () => void;
  /** The story just became free (released, or a fix ended) */
  onFreed: () => void;
}

export interface StoryLiveSnapshot {
  /** The story and holder this snapshot belongs to; a mismatch reads as a blank state */
  draftId: string | null;
  holder: string | null;
  remote: RemoteState | null;
  gone: string | null;
  handedTo: string | null;
  ask: AskState;
  incoming: TakeoverRequest | null;
}

const IDLE: AskState = { state: "idle" };

export interface StoryLiveController {
  update: (input: StoryLiveInput) => void;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StoryLiveSnapshot;
  /** Sends the holder's text and cursor (throttled); `now` sends at once */
  push: (now?: boolean) => void;
  askTakeover: () => void;
  /** Keep editing: tells the asker no. Works whatever else is running. */
  decline: () => void;
  /** Hand over: tells the asker yes. Resolves to an error code, or null. */
  accept: () => Promise<string | null>;
  markHandedOver: (name: string) => void;
  /** Drops the holder's text still waiting to go (handing over: it is never sent) */
  dropPending: () => void;
  dispose: () => void;
}

export function createStoryLive(deps: StoryLiveDeps): StoryLiveController {
  const clock = deps.clock ?? realClock;
  let input: StoryLiveInput | null = null;
  let snap: StoryLiveSnapshot = { draftId: null, holder: null, remote: null, gone: null, handedTo: null, ask: IDLE, incoming: null };
  const listeners = new Set<() => void>();
  /** `draftId|mode` the tab was last put on, or null */
  let spotKey: string | null = null;
  /** Holding the story with the stream up, as last seen */
  let sending = false;
  let lastText: string | null = null;
  let subscribedFor: string | null = null;
  let offs: Array<() => void> = [];
  let askTimer: unknown = null;
  let incomingTimer: unknown = null;
  let incomingTimed: TakeoverRequest | null = null;

  /** The latest actions (kept after dispose, so the last leave still goes) */
  const act = (): StoryLiveActions => input!.actions;
  const leaseKind = () => input?.lease?.kind ?? null;
  const heldName = (l: Lease | null | undefined) => (l?.kind === "held" ? l.name : null);
  const holderName = () => snap.remote?.name ?? heldName(input?.lease);

  /** The ask's wait, and the incoming ask's lifetime, follow the snapshot */
  const timers = () => {
    const waiting = snap.ask.state === "asking" && snap.ask.waiting;
    if (waiting && askTimer === null) {
      askTimer = clock.setTimeout(() => {
        askTimer = null;
        dispatchAsk({ type: "timeout" });
      }, TAKEOVER_WAIT_MS);
    }
    else if (!waiting && askTimer !== null) {
      clock.clearTimeout(askTimer);
      askTimer = null;
    }
    if (snap.incoming !== incomingTimed) {
      if (incomingTimer !== null) clock.clearTimeout(incomingTimer);
      incomingTimer = null;
      incomingTimed = snap.incoming;
      // An unanswered ask runs out on the server; the dialog goes with it
      if (snap.incoming) {
        incomingTimer = clock.setTimeout(() => {
          incomingTimer = null;
          set({ incoming: null });
        }, TAKEOVER_WAIT_MS);
      }
    }
  };
  const set = (patch: Partial<StoryLiveSnapshot>) => {
    const changed = (Object.keys(patch) as Array<keyof StoryLiveSnapshot>).some((k) => snap[k] !== patch[k]);
    if (!changed) return;
    snap = { ...snap, ...patch };
    timers();
    listeners.forEach((l) => l());
  };
  const dispatchAsk = (e: AskEvent) => set({ ask: askReducer(snap.ask, e) });

  const push = (now = false) => {
    const l = input;
    if (!l || l.lease?.kind !== "mine" || !l.connected || !l.draftId) return;
    const sel = l.selection();
    act().sendState({ draftId: l.draftId, text: l.text, selStart: sel ? sel.start : l.text.length, selEnd: sel ? sel.end : l.text.length, version: l.version() });
    if (now) act().flushState();
  };

  const listen = (draftId: string) => {
    const free = () => {
      set({ gone: firstName(holderName() ?? "Someone") });
      input?.onFreed();
    };
    // Ask the server whether anyone else still holds the story; free if not
    const checkFree = () =>
      void deps
        .heldByOther(draftId)
        .then((other) => {
          if (input?.draftId === draftId && leaseKind() === "held" && !other) free();
        })
        .catch(() => undefined);
    const onState = (s: LiveEditState) => {
      // A state from this person's own other tab shows too; this tab ignores states only while it holds the story
      if (s.draftId !== draftId || leaseKind() === "mine") return;
      set({ remote: { ...s, receivedAt: clock.now() }, gone: null, handedTo: null });
    };
    const offList = [
      act().on("edit.state", onState),
      act().on("edit.snapshot", onState),
      // The holder's live text ended: they released, closed, or only dropped off. Ask the server which.
      act().on("edit.ended", (e) => {
        if (e.draftId === draftId && leaseKind() === "held") checkFree();
      }),
      act().on("queue.draft", (e) => {
        const l = input?.lease;
        if (e.draftId !== draftId || l?.kind !== "held") return;
        if (e.type === "draft.released") free();
        // A fix ends without a release: the story stays posted and is free again
        else if (e.type === "draft.updated" && l.fixing) checkFree();
        else if (e.type === "draft.claimed" && e.userId && e.userId !== input?.me && e.name) {
          // Someone took the free story first, or another person holds it now
          set({ gone: null, handedTo: null });
          if (l.name !== e.name) input?.onClaimedBy(e.name);
        }
      }),
      // Only an answer to this tab's own ask counts
      act().on("takeover.answered", (a) => {
        if (a.draftId !== draftId || snap.ask.state !== "asking") return;
        dispatchAsk({ type: "answered", accept: a.accept, name: firstName(a.by?.name ?? holderName() ?? "They") });
        if (a.accept) input?.onAccepted();
      }),
      act().on("takeover.requested", (r) => {
        if (r.draftId !== draftId || leaseKind() !== "mine" || !r.from?.userId) return;
        set({ incoming: { userId: r.from.userId, name: r.from.name || "Someone", color: r.from.color } });
      }),
    ];
    return () => offList.forEach((off) => off());
  };

  return {
    update(next) {
      input = next;
      const mine = next.lease?.kind === "mine";
      const held = next.lease?.kind === "held";
      const holder = heldName(next.lease);

      // A new story, or a new holder: start over (a hand-over in progress stays until the new holder shows up)
      if (snap.draftId !== next.draftId || snap.holder !== holder) {
        set({ draftId: next.draftId, holder, remote: null, gone: null, ask: IDLE, ...(snap.draftId !== next.draftId ? { handedTo: null } : {}) });
      }
      if (snap.incoming && !mine) set({ incoming: null });
      if (snap.ask.state !== "idle" && !held) set({ ask: IDLE });

      // The story's events, once per story
      if (subscribedFor !== next.draftId) {
        offs.forEach((off) => off());
        offs = next.draftId ? [listen(next.draftId)] : [];
        subscribedFor = next.draftId;
      }

      // Where this tab is: the story and mode (one join when only the mode changes), or nowhere
      const mode = mine ? "edit" : "watch";
      const key = next.draftId && next.lease ? `${next.draftId}|${mode}` : null;
      if (key !== spotKey) {
        spotKey = key;
        if (key && next.draftId) {
          void act().setStory({ draftId: next.draftId, mode }).then((ack) => {
            // Watchers who join now get this as their snapshot, even before the holder types
            if (ack.ok && mode === "edit" && spotKey === key) push(true);
          });
        } else void act().setStory(null);
      }

      // Holding the story: the state goes once when sending starts (or comes back after a dropped stream), then on
      // every change of the text
      const nowSending = mine && next.connected;
      if (nowSending && !sending) push(true);
      else if (nowSending && next.text !== lastText) push();
      sending = nowSending;
      lastText = next.text;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snap,
    push,
    askTakeover() {
      const l = input;
      if (!l?.draftId || l.lease?.kind !== "held" || snap.ask.state === "asking") return;
      const draftId = l.draftId;
      const name = firstName(holderName() ?? l.lease.name);
      dispatchAsk({ type: "ask", name });
      void act().requestTakeover(draftId).then((ack) => {
        if (input?.draftId !== draftId) return;
        if (ack.ok) dispatchAsk({ type: "sent" });
        else {
          dispatchAsk({ type: "refused", error: ack.error, status: ack.status });
          if (ack.error === "no_holder") set({ gone: name });
        }
      });
    },
    decline() {
      const r = snap.incoming;
      const draftId = input?.draftId;
      set({ incoming: null });
      if (r && draftId) void act().answerTakeover(draftId, r.userId, false);
    },
    async accept() {
      const r = snap.incoming;
      const draftId = input?.draftId;
      set({ incoming: null });
      if (!r || !draftId) return "no_request";
      const ack = await act().answerTakeover(draftId, r.userId, true);
      return ack.ok ? null : (ack.error ?? "failed");
    },
    markHandedOver: (name) => set({ handedTo: firstName(name) }),
    dropPending: () => input?.actions.dropState(),
    dispose() {
      offs.forEach((off) => off());
      offs = [];
      subscribedFor = null;
      if (askTimer !== null) clock.clearTimeout(askTimer);
      if (incomingTimer !== null) clock.clearTimeout(incomingTimer);
      askTimer = incomingTimer = null;
      incomingTimed = null;
      spotKey = null;
      sending = false;
      lastText = null;
      // Off the story when the editor closes
      if (input) void act().setStory(null);
    },
  };
}

// ─── What the editor shows ───────────────────────────────────────────────────

export interface StoryLiveView {
  /** Someone else holds the story, live presence is up and the story has a draft id: the Tweet box shows their text */
  watching: boolean;
  /** Who holds the story, as live presence knows them (name and colour for the banner and the box) */
  holder: { name: string; color: string } | null;
  /** The holder is fixing a posted story: nobody can ask for it, and its posted text is never shown as theirs */
  correcting: boolean;
  remote: RemoteState | null;
  /** The holder's post is too long to stream */
  remoteLong: boolean;
  gone: string | null;
  handedTo: string | null;
  ask: AskState;
  incoming: TakeoverRequest | null;
}

/** The snapshot as the editor reads it for this story and lease (state from another story or holder reads as blank) */
export function viewOf(snap: StoryLiveSnapshot, at: { draftId: string | null; lease: Lease | null; connected: boolean; entries: readonly PresenceEntry[] }): StoryLiveView {
  const mine = at.lease?.kind === "mine";
  const held = at.lease?.kind === "held";
  const heldName = at.lease?.kind === "held" ? at.lease.name : null;
  const same = snap.draftId === at.draftId;
  const sameHolder = same && snap.holder === heldName;
  const remote = sameHolder ? snap.remote : null;
  const editor = groupPresence(at.entries).editor;
  const holder = remote
    ? { name: remote.name, color: remote.color || PRESENCE_COLORS[1] }
    : editor && !mine
      ? { name: editor.name, color: editor.color }
      : heldName
        ? { name: heldName, color: PRESENCE_COLORS[1] }
        : null;
  const correcting = held && (remote?.correcting === true || (!!editor && editor.correcting === true) || (at.lease?.kind === "held" && !!at.lease.fixing));
  return {
    watching: at.connected && held && !!at.draftId,
    holder,
    correcting,
    remote,
    remoteLong: remote?.text === LONG_TEXT_MARK,
    gone: sameHolder ? snap.gone : null,
    handedTo: same ? snap.handedTo : null,
    ask: sameHolder && held ? snap.ask : IDLE,
    incoming: same && mine ? snap.incoming : null,
  };
}

/** Ask to take over shows only to someone allowed to, and never on a story being fixed (the server refuses it) */
export const showAskTakeover = (mayTakeOver: boolean, correcting: boolean) => mayTakeOver && !correcting;

/**
 * What the Tweet box shows in watch mode. The holder's live text when it streams; their post too long to stream:
 * the saved draft (the editor's own text, read again from the server). A story being fixed never shows the
 * editor's own text, which is the old posted text: until the correction streams, the box stays empty.
 */
export function watchedText(v: Pick<StoryLiveView, "watching" | "correcting" | "remote" | "remoteLong">, ownText: string): { text: string; from: "own" | "remote" | "waiting" } {
  if (!v.watching) return { text: ownText, from: "own" };
  if (v.remote && !v.remoteLong) return { text: v.remote.text, from: "remote" };
  if (v.correcting) return { text: "", from: "waiting" };
  return { text: ownText, from: "own" };
}

/** The watch banner's sentence, around the holder's name in bold */
export function watchBannerCopy(correcting: boolean): { before: string; after: string } {
  return correcting ? { before: "", after: " is fixing this post. You can't type here." } : { before: "Watching ", after: ": they are editing this story. You can't type here." };
}

/**
 * The holder's take-over dialog. Keep editing, Escape and the backdrop always work, also during an export or a
 * save; only Hand over waits (blocked). While the hand-over itself runs (handing), nothing can stop it.
 */
export function takeoverDialogControls(at: { handing: boolean; handOverBlocked: boolean }): { canKeep: boolean; canHandOver: boolean } {
  return { canKeep: !at.handing, canHandOver: !at.handing && !at.handOverBlocked };
}
