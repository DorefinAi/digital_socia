"use client";

// Live presence and watch mode: who has which story open, the lock holder's live text for the people watching,
// and asking to take a story over. The server pushes over one Server-Sent Events stream (GET /live/stream); the
// browser answers with ordinary POSTs (api.ts liveJoin, liveState...), each carrying the `clientId` the stream's
// `hello` event gave.
//
// One EventSource per tab (a module-level hub, kept on globalThis so a hot reload in development replaces it
// instead of opening a second one), through the same base URL as every other call. Three ways to read it:
//   - useLiveActions(): stable calls (join a story, send state, ask to take over, subscribe to events);
//   - useLiveStatus(): connected, or dropped after having worked;
//   - useStoryPresence(draftId): one story's people, the same array until that story's list changes, so a row
//     or the editor re-renders only for its own story.
// A server without live presence (404), or a stream that never says hello, leaves the status "off": the desk
// then works exactly as before. Polling stays as it is; while connected, a queue event only makes a visible
// desk refresh sooner (at most every 2 s).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import * as socia from "./api";
import { ApiError } from "./client";
import { usePermissions } from "@/lib/access/usePermissions";
import {
  LIVE_PLATFORM,
  NO_PRESENCE,
  QUEUE_EVENTS,
  createOutbox,
  createRefreshGate,
  createStateSender,
  mergePresence,
  planPresence,
  presenceOf,
  refreshesLists,
  streamable,
  type EditState,
  type LiveAnswerLike,
  type Outbox,
  type PresenceEntry,
  type PresenceStories,
  type StateSender,
  type StorySpot,
} from "./liveCore";

export type { EditState, PresenceEntry, PresenceMode, PresenceStories } from "./liveCore";

/** edit.state and edit.snapshot: the holder's text and selection */
export interface LiveEditState extends EditState {
  userId: string;
  name: string;
  color: string;
  at: string;
}

export interface LiveEvents {
  "edit.state": LiveEditState;
  "edit.snapshot": LiveEditState;
  "edit.ended": { draftId: string; userId: string };
  "takeover.requested": { draftId: string; from: { userId: string; name: string; color: string } };
  "takeover.answered": { draftId: string; accept: boolean; by: { userId: string; name: string } };
  /** A queue event about one draft, with its type; draft.claimed carries who, draft.updated the status */
  "queue.draft": { type: string; draftId: string; userId?: string; name?: string; status?: string };
}

export type LiveEventName = keyof LiveEvents;
export type LiveAck = LiveAnswerLike;

/** "off": no live presence (switched off, refused, not connected yet, or replaced); "dropped": it worked, then the stream went */
export type LiveStatus = "off" | "live" | "dropped";

const OFFLINE: LiveAck = { ok: false, error: "offline" };
const noop = () => undefined;

// ─── The tab's one stream ────────────────────────────────────────────────────

/** Failed attempts in a row (no hello in between) before the stream rests instead of retrying every few seconds */
const FAILS_BEFORE_REST = 3;
/** A resting stream tries again this often, or on focus once FOCUS_RETRY_MS has passed */
const REST_MS = 5 * 60_000;
const FOCUS_RETRY_MS = 60_000;

/** Every event the stream sends that the desk listens to */
const STREAM_EVENTS = ["hello", "replaced", "presence.list", "edit.state", "edit.snapshot", "edit.ended", "takeover.requested", "takeover.answered", "resync", ...QUEUE_EVENTS] as const;
const PUBLIC_EVENTS = new Set<string>(["edit.state", "edit.snapshot", "edit.ended", "takeover.requested", "takeover.answered"]);
const QUEUE_EVENT_SET = new Set<string>(QUEUE_EVENTS);

type Internal = (event: string, payload: unknown) => void;

class LiveHub {
  private source: EventSource | null = null;
  clientId: string | null = null;
  private fails = 0;
  private restTimer: ReturnType<typeof setTimeout> | null = null;
  private restingSince = 0;
  /** Off for the rest of the session: the server has no live presence (404), or replaced this stream */
  private stopped = false;
  /** One fetch to tell a 404 from a passing failure, the first time the stream is refused */
  private probed = false;
  private everLive = false;

  status: LiveStatus = "off";
  private statusListeners = new Set<() => void>();
  presence: PresenceStories = {};
  private presenceListeners = new Set<() => void>();
  private internal = new Set<Internal>();
  private handlers = new Map<string, Set<(p: unknown) => void>>();

  // ── Stores ──
  onStatus = (l: () => void) => {
    this.statusListeners.add(l);
    return () => void this.statusListeners.delete(l);
  };
  onPresence = (l: () => void) => {
    this.presenceListeners.add(l);
    return () => void this.presenceListeners.delete(l);
  };
  private setStatus(s: LiveStatus) {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach((l) => l());
  }
  private setPresence(next: PresenceStories) {
    const merged = mergePresence(this.presence, next);
    if (merged === this.presence) return;
    this.presence = merged;
    this.presenceListeners.forEach((l) => l());
  }

  // ── Events ──
  on = (event: string, handler: (p: unknown) => void) => {
    const set = this.handlers.get(event) ?? new Set();
    this.handlers.set(event, set);
    set.add(handler);
    return () => void set.delete(handler);
  };
  private dispatch(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }

  // ── The stream ──
  private open() {
    if (this.source || this.stopped || typeof EventSource === "undefined") return;
    let source: EventSource;
    try {
      source = new EventSource(socia.liveStreamUrl(LIVE_PLATFORM), { withCredentials: true });
    } catch {
      return this.rest();
    }
    this.source = source;
    let saidHello = false;
    for (const name of STREAM_EVENTS) {
      source.addEventListener(name, (e) => {
        if (this.source !== source) return;
        let payload: unknown = undefined;
        try {
          const data = (e as MessageEvent).data;
          payload = data ? JSON.parse(data) : undefined;
        } catch {
          return;
        }
        if (name === "hello") {
          const id = (payload as { clientId?: unknown } | undefined)?.clientId;
          if (typeof id !== "string" || !id) return;
          saidHello = true;
          this.fails = 0;
          this.clientId = id;
          this.everLive = true;
          this.setStatus("live");
        }
        this.receive(name, payload);
      });
    }
    source.onerror = () => {
      if (this.source !== source) return;
      this.lost();
      this.fails += 1;
      // CLOSED: the browser won't retry (a 404 from a server without live presence, signed out). Before any hello,
      // one fetch tells a missing endpoint (stop for the session) from a passing failure.
      if (source.readyState === EventSource.CLOSED && !saidHello && !this.probed) {
        this.probed = true;
        this.pause();
        void this.probe();
        return;
      }
      if (source.readyState === EventSource.CLOSED || this.fails >= FAILS_BEFORE_REST) this.rest();
    };
  }

  private receive(name: string, payload: unknown) {
    if (name === "replaced") {
      // This person opened too many streams and the server closed this one: stay quiet for the session
      this.stop();
      return;
    }
    if (name === "presence.list") {
      const stories = (payload as { stories?: unknown } | undefined)?.stories;
      this.setPresence(stories && typeof stories === "object" && !Array.isArray(stories) ? (stories as PresenceStories) : {});
      return;
    }
    this.internal.forEach((l) => l(name, payload));
    if (PUBLIC_EVENTS.has(name) && payload && typeof payload === "object") this.dispatch(name, payload);
    else if (QUEUE_EVENT_SET.has(name) && payload && typeof payload === "object") {
      const p = payload as { draftId?: unknown; userId?: unknown; name?: unknown; status?: unknown };
      if (typeof p.draftId === "string") {
        this.dispatch("queue.draft", {
          type: name,
          draftId: p.draftId,
          userId: typeof p.userId === "string" ? p.userId : undefined,
          name: typeof p.name === "string" ? p.name : undefined,
          status: typeof p.status === "string" ? p.status : undefined,
        });
      }
    }
  }

  /** The stream went: presence is unknown until it comes back */
  private lost() {
    const had = this.clientId !== null;
    this.clientId = null;
    this.setPresence({});
    this.setStatus(this.everLive && !this.stopped ? "dropped" : "off");
    if (had) this.internal.forEach((l) => l("closed", undefined));
  }

  private pause() {
    this.source?.close();
    this.source = null;
  }

  /** Is the endpoint there at all? A 404 stops live presence for the session; anything else rests and retries. */
  private async probe() {
    const ctrl = new AbortController();
    try {
      const res = await fetch(socia.liveStreamUrl(LIVE_PLATFORM), { credentials: "include", cache: "no-store", headers: { accept: "text/event-stream" }, signal: ctrl.signal });
      ctrl.abort();
      if (res.status === 404) return this.stop();
    } catch {
      // Network trouble: rest and try again later
    }
    this.rest();
  }

  /** Stop for a while; nothing is logged, the desk polls meanwhile */
  private rest() {
    this.pause();
    if (this.stopped) return;
    this.restingSince = Date.now();
    if (this.restTimer) clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => this.retry(), REST_MS);
  }

  private retry() {
    if (this.restTimer) clearTimeout(this.restTimer);
    this.restTimer = null;
    this.fails = 0;
    if (this.internal.size) this.open();
  }

  /** Off for this session (no live presence on the server, or this stream was replaced) */
  private stop() {
    this.stopped = true;
    if (this.restTimer) clearTimeout(this.restTimer);
    this.restTimer = null;
    this.pause();
    this.lost();
    this.setStatus("off");
  }

  /** Back in focus: a resting stream tries again, at most every FOCUS_RETRY_MS */
  wake = () => {
    if (this.source || this.stopped || !this.internal.size || Date.now() - this.restingSince < FOCUS_RETRY_MS) return;
    this.restingSince = Date.now();
    this.retry();
  };

  /** The first subscriber opens the stream, the last one closes it */
  subscribe(l: Internal) {
    this.internal.add(l);
    if (this.clientId) l("hello", { clientId: this.clientId });
    else if (!this.source && !this.restTimer) this.open();
    return () => {
      this.internal.delete(l);
      if (!this.internal.size) this.dispose();
    };
  }

  dispose() {
    if (this.restTimer) clearTimeout(this.restTimer);
    this.restTimer = null;
    this.pause();
    if (this.clientId !== null || this.status !== "off") this.lost();
    this.setStatus("off");
  }
}

// One hub per tab. A hot reload re-runs this module: the old hub's stream is closed and a new hub takes over.
const G = globalThis as typeof globalThis & { __sociaLiveHub?: LiveHub };
G.__sociaLiveHub?.dispose();
const hub = new LiveHub();
G.__sociaLiveHub = hub;

/** One POST, as an answer: an error (404 included) comes back as { ok: false, error, status } instead of throwing */
async function answer(call: () => Promise<LiveAck>): Promise<LiveAck> {
  try {
    return (await call()) ?? { ok: false, error: "no_answer" };
  } catch (err) {
    return err instanceof ApiError ? { ok: false, error: err.code, status: err.status } : { ok: false, error: "offline" };
  }
}

// ─── Reading it ──────────────────────────────────────────────────────────────

export interface LiveActions {
  /** The signed-in user's id, to tell "you" apart in the presence lists */
  me: string | null;
  /**
   * Where this tab is: a story and a mode, or nowhere (null). A mode change on the same story is one join; a
   * change of story sends the latest state, then leaves, then joins. Resolves to the join's answer.
   */
  setStory: (spot: StorySpot | null) => Promise<LiveAck>;
  /** The holder's text and selection, throttled (about 3/s for text, 5/s for cursor moves; the latest always goes) */
  sendState: (s: EditState) => void;
  /** Sends a waiting state now */
  flushState: () => void;
  requestTakeover: (draftId: string) => Promise<LiveAck>;
  answerTakeover: (draftId: string, requesterId: string, accept: boolean) => Promise<LiveAck>;
  /** Subscribe to edit.* / takeover.* / per-draft queue events; returns the unsubscribe */
  on: <K extends LiveEventName>(event: K, handler: (payload: LiveEvents[K]) => void) => () => void;
}

const subscribeEvent = <K extends LiveEventName>(event: K, handler: (payload: LiveEvents[K]) => void) => hub.on(event, handler as (p: unknown) => void);

/** Outside a provider (demo desk, Templates page): never connected, every call a no-op */
const DISCONNECTED: LiveActions = {
  me: null,
  setStory: async () => OFFLINE,
  sendState: noop,
  flushState: noop,
  requestTakeover: async () => OFFLINE,
  answerTakeover: async () => OFFLINE,
  on: () => noop,
};

const ActionsContext = createContext<LiveActions>(DISCONNECTED);
/** Whether a provider holds the stream; without one the status reads "off" */
const ActiveContext = createContext(false);

/** Live presence's calls; stable while the signed-in person stays the same */
export const useLiveActions = () => useContext(ActionsContext);

const offStatus = (): LiveStatus => "off";
/** Connected (live), or dropped after it had worked; "off" covers everything else */
export function useLiveStatus(): { connected: boolean; dropped: boolean } {
  const active = useContext(ActiveContext);
  const status = useSyncExternalStore(hub.onStatus, () => (active ? hub.status : "off"), offStatus);
  return { connected: status === "live", dropped: status === "dropped" };
}

const noPresence = () => NO_PRESENCE;
/** One story's people; the same array until that story's list changes */
export function useStoryPresence(draftId: string | null | undefined): readonly PresenceEntry[] {
  const active = useContext(ActiveContext);
  const read = useCallback(() => (active ? presenceOf(hub.presence, draftId) : NO_PRESENCE), [active, draftId]);
  return useSyncExternalStore(hub.onPresence, read, noPresence);
}

// ─── Provider ────────────────────────────────────────────────────────────────

/** How soon a "join again" after a not_holder / unknown_client / not_joined answer may repeat */
const REJOIN_GAP_MS = 2000;

/**
 * Holds the tab's stream while mounted (`enabled`). `onQueueEvent` runs on queue events that change the lists,
 * on the server's resync and on every (re)connect: only while the tab is visible, and at most every 2 s.
 */
export function LiveProvider({ children, enabled = true, onQueueEvent }: { children: ReactNode; enabled?: boolean; onQueueEvent?: () => void }) {
  const { user } = usePermissions();
  const me = user?.id ?? null;
  /** Where this tab is, as last asked; joined again with the new client id after a reconnect */
  const spot = useRef<StorySpot | null>(null);
  const onQueue = useRef(onQueueEvent);
  useEffect(() => {
    onQueue.current = onQueueEvent;
  });

  // The POST queue and the state throttle in front of it, made once
  const outbox = useRef<Outbox | null>(null);
  const sender = useRef<StateSender | null>(null);
  const lastRejoin = useRef(0);
  const rejoin = useCallback(() => {
    const s = spot.current;
    if (!s || !hub.clientId || Date.now() - lastRejoin.current < REJOIN_GAP_MS) return;
    lastRejoin.current = Date.now();
    void outbox.current?.control(() => answer(() => socia.liveJoin(hub.clientId!, s.draftId, s.mode)));
  }, []);
  useEffect(() => {
    const box = createOutbox({
      sendState: (s) => (hub.clientId ? answer(() => socia.liveState(hub.clientId!, s)) : Promise.resolve(OFFLINE)),
      onRejoin: rejoin,
    });
    const throttle = createStateSender((s) => box.state(s));
    outbox.current = box;
    sender.current = throttle;
    return () => {
      throttle.cancel();
      box.dropState();
    };
  }, [rejoin]);

  useEffect(() => {
    if (!enabled) return;
    const gate = createRefreshGate({ run: () => onQueue.current?.(), visible: () => document.visibilityState === "visible" });
    const unsubscribe = hub.subscribe((event, payload) => {
      if (event === "hello") {
        // A new client id: the server knows nothing of this tab yet. Join again, and catch up on the lists.
        gate.call();
        const s = spot.current;
        if (s) void outbox.current?.control(() => answer(() => socia.liveJoin(hub.clientId!, s.draftId, s.mode)));
        return;
      }
      if (event === "resync") return gate.call();
      if (QUEUE_EVENT_SET.has(event) && refreshesLists(event, payload as { status?: unknown } | undefined)) gate.call();
    });
    const onFocus = () => hub.wake();
    const onVisible = () => document.visibilityState === "visible" && hub.wake();
    // A closing tab leaves its story at once, so watchers don't wait for the server to notice
    const onPageHide = () => {
      const s = spot.current;
      if (s && hub.clientId) socia.liveLeaveOnExit(hub.clientId, s.draftId);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      gate.cancel();
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  const setStory = useCallback(async (next: StorySpot | null): Promise<LiveAck> => {
    const prev = spot.current;
    const steps = planPresence(prev, next);
    spot.current = next;
    if (!steps.length) return { ok: true, mode: next?.mode };
    // The last word typed goes before the leave (the outbox keeps the order)
    sender.current?.flush();
    const box = outbox.current;
    if (!box || !hub.clientId) return OFFLINE;
    let last: Promise<LiveAck> = Promise.resolve({ ok: true });
    for (const step of steps) {
      const id = hub.clientId;
      last = box.control(() => (step.kind === "join" ? answer(() => socia.liveJoin(id, step.draftId, step.mode)) : answer(() => socia.liveLeave(id, step.draftId))));
    }
    return last;
  }, []);
  const sendState = useCallback((s: EditState) => {
    if (hub.clientId) sender.current?.push(streamable(s));
  }, []);
  const flushState = useCallback(() => sender.current?.flush(), []);
  const requestTakeover = useCallback(async (draftId: string) => {
    const box = outbox.current;
    if (!box || !hub.clientId) return OFFLINE;
    const id = hub.clientId;
    return box.control(() => answer(() => socia.liveTakeoverRequest(id, draftId)));
  }, []);
  const answerTakeover = useCallback(async (draftId: string, requesterId: string, accept: boolean) => {
    const box = outbox.current;
    if (!box || !hub.clientId) return OFFLINE;
    const id = hub.clientId;
    return box.control(() => answer(() => socia.liveTakeoverAnswer(id, draftId, requesterId, accept)));
  }, []);

  const actions = useMemo<LiveActions>(() => ({ me, setStory, sendState, flushState, requestTakeover, answerTakeover, on: subscribeEvent }), [me, setStory, sendState, flushState, requestTakeover, answerTakeover]);
  return (
    <ActiveContext.Provider value={enabled}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </ActiveContext.Provider>
  );
}
