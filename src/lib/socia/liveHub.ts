// The tab's one live stream (an EventSource on GET /live/stream), without React: live.tsx makes one hub per tab
// and reads it through hooks. The browser, the network and the clock come in as `deps`, so the node test runner
// covers reconnecting (liveHub.test.ts).
//
//   - A server without live presence (404 on the startup probe) stops live presence for the session, silently.
//   - A stream that never said hello rests REST_MS between tries.
//   - A stream that had been live and then went (a 502 on the browser's reconnect, say) tries again after 2, 4, 8,
//     16 and 30 s, then every REST_MS.
//   - Other failures log one console line the first time, then stay quiet until a stream works again.
//   - `replaced` (this person opened too many streams): a visible tab connects once more, at once or when it is
//     next shown; replaced again, it stays off for the session.

import { mergePresence, realClock, type Clock, type PresenceStories } from "./liveCore";

/** "off": no live presence (switched off, refused, not connected yet, or replaced); "dropped": it worked, then the stream went */
export type LiveStatus = "off" | "live" | "dropped";

/** EventSource.CLOSED: the browser won't retry */
export const SOURCE_CLOSED = 2;

/** The part of EventSource the hub uses */
export interface EventSourceLike {
  readonly readyState: number;
  onerror: ((e: Event) => void) | null;
  addEventListener(name: string, listener: (e: { data?: unknown }) => void): void;
  close(): void;
}

export interface HubDeps {
  /** The stream's URL; `probe` asks the server for an answer that ends at once (GET /live/stream?probe=1) */
  streamUrl: (probe: boolean) => string;
  /** Opens a stream; null where EventSource doesn't exist (server rendering, old browsers) */
  createSource: ((url: string) => EventSourceLike) | null;
  /** One GET of the probe URL; resolves to its status, rejects on network trouble */
  probe: (url: string) => Promise<number>;
  /** Whether the tab is shown (a replaced stream connects again only in a shown tab) */
  visible: () => boolean;
  log: (line: string) => void;
  clock?: Clock;
}

/** Failed attempts in a row (no hello in between) before the stream rests instead of retrying every few seconds */
export const FAILS_BEFORE_REST = 3;
/** A resting stream tries again this often, or on focus once FOCUS_RETRY_MS has passed */
export const REST_MS = 5 * 60_000;
export const FOCUS_RETRY_MS = 60_000;
/** The waits before trying again, for a stream that had been live; then every REST_MS */
export const LIVE_RETRY_MS = [2000, 4000, 8000, 16_000, 30_000] as const;

/** How long to rest before the next try: a stream that had been live comes back quickly, the rest slowly */
export function restDelay(everLive: boolean, quickTries: number): number {
  return everLive && quickTries < LIVE_RETRY_MS.length ? LIVE_RETRY_MS[quickTries] : REST_MS;
}

/** Every event the stream sends that the desk listens to */
export type Internal = (event: string, payload: unknown) => void;

export class LiveHub {
  private readonly deps: HubDeps;
  private readonly clock: Clock;
  private source: EventSourceLike | null = null;
  clientId: string | null = null;
  private fails = 0;
  private restTimer: unknown = null;
  private restingSince = 0;
  /** Off for the rest of the session: the server has no live presence (404), or replaced this stream twice */
  private stopped = false;
  /** One fetch to tell a 404 from a passing failure, the first time the stream is refused before ever working */
  private probed = false;
  private everLive = false;
  /** Quick tries used since the stream last worked (restDelay) */
  private quickTries = 0;
  /** A failure was logged; quiet until a stream works again */
  private warned = false;
  /** `replaced` came once: one more connection (now, or when the tab is next shown); twice: off */
  private replacedOnce = false;
  private reconnectWhenShown = false;

  status: LiveStatus = "off";
  private statusListeners = new Set<() => void>();
  presence: PresenceStories = {};
  private presenceListeners = new Set<() => void>();
  private internal = new Set<Internal>();
  private handlers = new Map<string, Set<(p: unknown) => void>>();

  private readonly streamEvents: readonly string[];
  /** Called with each event after hello/replaced/presence.list are handled (live.tsx routes them on) */
  private readonly route: (hub: LiveHub, name: string, payload: unknown) => void;

  constructor(deps: HubDeps, streamEvents: readonly string[], route: (hub: LiveHub, name: string, payload: unknown) => void) {
    this.deps = deps;
    this.streamEvents = streamEvents;
    this.route = route;
    this.clock = deps.clock ?? realClock;
  }

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
  dispatch(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
  /** Tells the subscribers (the provider) about a stream event */
  tell(event: string, payload: unknown) {
    this.internal.forEach((l) => l(event, payload));
  }

  // ── The stream ──
  private open() {
    if (this.source || this.stopped || !this.deps.createSource) return;
    let source: EventSourceLike;
    try {
      source = this.deps.createSource(this.deps.streamUrl(false));
    } catch {
      this.warn("the stream couldn't be opened");
      return this.rest();
    }
    this.source = source;
    let saidHello = false;
    for (const name of this.streamEvents) {
      source.addEventListener(name, (e) => {
        if (this.source !== source) return;
        let payload: unknown = undefined;
        try {
          const data = e.data;
          payload = typeof data === "string" && data ? JSON.parse(data) : undefined;
        } catch {
          return;
        }
        if (name === "hello") {
          const id = (payload as { clientId?: unknown } | undefined)?.clientId;
          if (typeof id !== "string" || !id) return;
          saidHello = true;
          this.fails = 0;
          this.quickTries = 0;
          this.warned = false;
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
      const closed = source.readyState === SOURCE_CLOSED;
      // CLOSED before any hello in a stream that never worked: one fetch tells a missing endpoint (a 404: stop for
      // the session, quietly) from a passing failure
      if (closed && !saidHello && !this.everLive && !this.probed) {
        this.probed = true;
        this.pause();
        void this.probe();
        return;
      }
      this.warn(closed ? "the stream was refused" : "the stream dropped");
      if (closed || this.fails >= FAILS_BEFORE_REST) this.rest();
    };
  }

  private receive(name: string, payload: unknown) {
    if (name === "replaced") return this.replaced();
    if (name === "presence.list") {
      const stories = (payload as { stories?: unknown } | undefined)?.stories;
      this.setPresence(stories && typeof stories === "object" && !Array.isArray(stories) ? (stories as PresenceStories) : {});
      return;
    }
    this.route(this, name, payload);
  }

  /** The server closed this stream for a newer one of the same person */
  private replaced() {
    if (this.replacedOnce) return this.stop();
    this.replacedOnce = true;
    this.cancelRest();
    this.pause();
    this.lost();
    this.setStatus("off");
    if (this.deps.visible()) this.open();
    else this.reconnectWhenShown = true;
  }

  /** One console line for the first failure; quiet after that until a stream works again (404s never log) */
  private warn(what: string) {
    if (this.warned) return;
    this.warned = true;
    this.deps.log(`Live presence: ${what}. Trying again quietly; the desk keeps polling meanwhile.`);
  }

  /** The stream went: presence is unknown until it comes back */
  private lost() {
    const had = this.clientId !== null;
    this.clientId = null;
    this.setPresence({});
    this.setStatus(this.everLive && !this.stopped ? "dropped" : "off");
    if (had) this.tell("closed", undefined);
  }

  private pause() {
    this.source?.close();
    this.source = null;
  }

  private cancelRest() {
    if (this.restTimer !== null) this.clock.clearTimeout(this.restTimer);
    this.restTimer = null;
  }

  /** Is the endpoint there at all? A 404 stops live presence for the session; anything else rests and retries. */
  private async probe() {
    try {
      const status = await this.deps.probe(this.deps.streamUrl(true));
      if (status === 404) return this.stop();
      this.warn(`the stream was refused (HTTP ${status})`);
    } catch {
      this.warn("the stream couldn't be reached");
    }
    this.rest();
  }

  /** Stop for a while; the desk polls meanwhile */
  private rest() {
    this.pause();
    if (this.stopped) return;
    this.restingSince = this.clock.now();
    const wait = restDelay(this.everLive, this.quickTries);
    if (wait !== REST_MS) this.quickTries += 1;
    this.cancelRest();
    this.restTimer = this.clock.setTimeout(() => this.retry(), wait);
  }

  private retry() {
    this.cancelRest();
    this.fails = 0;
    if (this.internal.size) this.open();
  }

  /** Off for this session (no live presence on the server, or this stream was replaced twice) */
  private stop() {
    this.stopped = true;
    this.reconnectWhenShown = false;
    this.cancelRest();
    this.pause();
    this.lost();
    this.setStatus("off");
  }

  /** Back in focus or shown: a replaced stream connects again; a resting stream tries again, at most every FOCUS_RETRY_MS */
  wake = () => {
    if (this.source || this.stopped || !this.internal.size) return;
    if (this.reconnectWhenShown) {
      if (!this.deps.visible()) return;
      this.reconnectWhenShown = false;
      return this.open();
    }
    if (this.restTimer === null || this.clock.now() - this.restingSince < FOCUS_RETRY_MS) return;
    this.restingSince = this.clock.now();
    this.retry();
  };

  /** The first subscriber opens the stream, the last one closes it */
  subscribe(l: Internal) {
    this.internal.add(l);
    if (this.clientId) l("hello", { clientId: this.clientId });
    else if (!this.source && this.restTimer === null && !this.reconnectWhenShown) this.open();
    return () => {
      this.internal.delete(l);
      if (!this.internal.size) this.dispose();
    };
  }

  dispose() {
    this.cancelRest();
    this.reconnectWhenShown = false;
    this.pause();
    if (this.clientId !== null || this.status !== "off") this.lost();
    this.setStatus("off");
  }
}
