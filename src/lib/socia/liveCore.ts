// Pure pieces of live presence (src/lib/socia/live.tsx): who is on a story, the fallback colour and initials,
// the header's short summary, and the throttle that sends the editor's text and cursor. No React and no
// stream here, so the node test runner covers them (liveCore.test.ts).

export type PresenceMode = "edit" | "watch";

/** One person on a story, as the server's presence.list sends them */
export interface PresenceEntry {
  userId: string;
  name: string;
  initials: string;
  color: string;
  mode: PresenceMode;
}

/** presence.list: everyone on every story, by draft id */
export type PresenceStories = Record<string, PresenceEntry[]>;

/** The server's palette; the client picks from it only when an entry arrives without a colour */
export const PRESENCE_COLORS = ["#E8590C", "#7048E8", "#0C8599", "#2B8A3E", "#C2255C", "#1971C2", "#E67700", "#5F3DC4"] as const;

/**
 * The server's colour for a user id (presence.ts presenceColor): 32-bit FNV-1a over the id's UTF-16 code units,
 * then the palette entry at h % 8. Used only when an entry arrives without a colour.
 */
export function colorFor(userId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

/** As the server makes them: the first letters of the first two words, "Asha Rani Verma" → "AR". Works for Devanagari too. */
export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "?";
}

/** "Priya Sharma" → "Priya" */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Fills a missing colour or initials, so every badge can be drawn */
export function withDefaults(e: PresenceEntry): PresenceEntry {
  const color = /^#[0-9a-f]{3,8}$/i.test(e.color ?? "") ? e.color : colorFor(e.userId);
  const initials = e.initials?.trim() ? Array.from(e.initials.trim()).slice(0, 2).join("") : initialsOf(e.name ?? "");
  return { ...e, name: e.name || "Someone", color, initials };
}

export interface StoryPresence {
  /** The lock holder, if they are on the story */
  editor: PresenceEntry | null;
  /** Everyone watching, once each, in the order the server listed them */
  viewers: PresenceEntry[];
}

/**
 * One story's presence: each person once (a person in two tabs counts once, as the editor if either tab
 * edits). `exclude` leaves a user out (the story list leaves out the person looking at it).
 */
export function groupPresence(entries: readonly PresenceEntry[] | undefined, exclude?: string | null): StoryPresence {
  let editor: PresenceEntry | null = null;
  const viewers = new Map<string, PresenceEntry>();
  for (const raw of entries ?? []) {
    if (!raw || !raw.userId || raw.userId === exclude) continue;
    const e = withDefaults(raw);
    if (e.mode === "edit") {
      if (!editor) editor = e;
    } else if (!viewers.has(e.userId)) viewers.set(e.userId, e);
  }
  if (editor) viewers.delete(editor.userId);
  return { editor, viewers: [...viewers.values()] };
}

/** How many badges a row shows before "+N" */
export const LIST_BADGES_MAX = 3;

/** The viewers a row draws, and how many more there are */
export function visibleViewers(viewers: readonly PresenceEntry[], max = LIST_BADGES_MAX): { shown: PresenceEntry[]; more: number } {
  return { shown: viewers.slice(0, max), more: Math.max(0, viewers.length - max) };
}

/** Tooltip and screen-reader lines: "Priya Sharma is editing", "Amit Jain is viewing"; `me` reads "You are ..." */
export function presenceLines(p: StoryPresence, me?: string | null): string[] {
  const who = (e: PresenceEntry) => (me && e.userId === me ? "You are" : `${e.name} is`);
  return [...(p.editor ? [`${who(p.editor)} editing`] : []), ...p.viewers.map((v) => `${who(v)} viewing`)];
}

/**
 * The editor header's short text, e.g. "Priya editing · 2 viewing". The person looking counts among the
 * viewers (or is "You" when they edit). Null when nobody else is on the story: the header then shows nothing.
 */
export function presenceSummary(p: StoryPresence, me: string | null | undefined): string | null {
  const people = (p.editor ? 1 : 0) + p.viewers.length;
  const onlyMe = people === 0 || (people === 1 && (p.editor?.userId === me || p.viewers[0]?.userId === me));
  if (onlyMe) return null;
  const parts: string[] = [];
  if (p.editor) parts.push(p.editor.userId === me ? "You're editing" : `${firstName(p.editor.name)} editing`);
  if (p.viewers.length) parts.push(`${p.viewers.length} viewing`);
  return parts.join(" · ");
}

/** The watch-mode note's age: "just now", "20 s ago", "3 min ago" */
export function updatedAgo(ms: number): string {
  if (ms < 5000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s ago`;
  return `${Math.floor(ms / 60_000)} min ago`;
}

// ─── Sending the editor's state ──────────────────────────────────────────────

export interface EditState {
  draftId: string;
  text: string;
  selStart: number;
  selEnd: number;
  version: number;
}


/**
 * About 3 sends a second while the text changes, and at most 5 a second for a cursor-only move: the server
 * refuses more than 6 edit states a second, and a resend after a refusal needs room too.
 */
export const TEXT_SEND_MS = 333;
export const CURSOR_SEND_MS = 200;

/** The server refuses longer live text (MAX_EDIT_TEXT); the holder then sends LONG_TEXT_MARK instead */
export const MAX_LIVE_TEXT = 2000;

/**
 * Sent as the live text when the post is too long to stream: watchers show the saved draft with "Showing saved
 * text" instead. Plain characters only (the server refuses control characters).
 */
export const LONG_TEXT_MARK = "[socia:text-too-long]";

/** Control characters the server refuses in live text (all but newline and tab) */
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/**
 * The state to send for `s`: control characters become spaces (one for one, so the cursor offsets still
 * match), and text too long to stream becomes the too-long mark (cursor at 0).
 */
export function streamable(s: EditState): EditState {
  if (s.text.length > MAX_LIVE_TEXT) return { ...s, text: LONG_TEXT_MARK, selStart: 0, selEnd: 0 };
  const text = s.text.replace(CONTROL_CHARS, " ");
  return text === s.text ? s : { ...s, text };
}

/** The platform the desk's live stream is opened for (live.tsx); a story on another platform is not joined */
export const LIVE_PLATFORM = "x";

export interface Clock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface StateSender {
  /** Queue the latest state; it goes now if the gap allows, else once the gap is over (always the latest) */
  push: (s: EditState) => void;
  /** Send whatever is waiting now (before leaving the story) */
  flush: () => void;
  /** Drop whatever is waiting, without sending */
  cancel: () => void;
}

/**
 * A leading-and-trailing throttle for the holder's state. A change of text waits TEXT_SEND_MS after the last
 * send, a cursor-only move CURSOR_SEND_MS; whatever is pending when the gap ends is the newest state.
 */
export function createStateSender(send: (s: EditState) => void, clock: Clock = realClock): StateSender {
  let lastAt = -Infinity;
  let lastText: string | null = null;
  let pending: EditState | null = null;
  // The gap the pending state must wait: text if any queued state since the last send changed the text
  let pendingText = false;
  let timer: unknown = null;

  const fire = () => {
    timer = null;
    if (!pending) return;
    const s = pending;
    pending = null;
    pendingText = false;
    lastAt = clock.now();
    lastText = s.text;
    send(s);
  };
  const schedule = () => {
    const gap = pendingText ? TEXT_SEND_MS : CURSOR_SEND_MS;
    const wait = Math.max(0, lastAt + gap - clock.now());
    if (timer !== null) clock.clearTimeout(timer);
    if (wait === 0) fire();
    else timer = clock.setTimeout(fire, wait);
  };
  return {
    push(s) {
      if (s.text !== lastText) pendingText = true;
      pending = s;
      schedule();
    },
    flush() {
      if (timer !== null) clock.clearTimeout(timer);
      fire();
    },
    cancel() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      pending = null;
      pendingText = false;
    },
  };
}

// ─── Live POSTs, in order ────────────────────────────────────────────────────

export interface LiveAnswerLike {
  ok: boolean;
  error?: string;
  /** The HTTP status when the request failed (429 for a cooldown) */
  status?: number;
  mode?: PresenceMode;
}

/** Answers after which this tab is no longer on its story as the server sees it: join again */
export const REJOIN_ERRORS = new Set(["not_holder", "unknown_client", "not_joined"]);
export const needsRejoin = (a: LiveAnswerLike) => !a.ok && !!a.error && REJOIN_ERRORS.has(a.error);

/** A refusal worth sending the state again for (too fast, network, server trouble); never one about the request itself */
export const retryable = (a: LiveAnswerLike) =>
  !a.ok && (a.status === 429 || a.error === "rate_limited" || a.error === "offline" || a.error === "timeout" || a.error === "server" || a.error === "server_error" || (a.status ?? 0) >= 500);

/** How long before a refused state goes again, and how many times */
export const STATE_RETRY_MS = 600;
export const STATE_RETRY_LIMITED_MS = 1200;
export const STATE_RETRIES = 3;

export interface Outbox {
  /** The newest holder state; replaces one that is queued and not sent yet */
  state: (s: EditState) => void;
  /** A join, leave or other call, sent after everything queued before it */
  control: (run: () => Promise<LiveAnswerLike>) => Promise<LiveAnswerLike>;
  /** Drop a queued state and any resend waiting (leaving the story without a word) */
  dropState: () => void;
}

/**
 * The live POSTs of one tab, one at a time and in order, so a leave never overtakes the last state and an old
 * state never lands after a newer one. States coalesce: only the newest queued one goes. A state the server
 * refused for being too fast, or that the network lost, goes again after a pause (up to STATE_RETRIES times)
 * unless a newer one came meanwhile. `too_long` sends the too-long mark instead. `onRejoin` hears an answer
 * that means the tab must join its story again.
 */
export function createOutbox(opts: { sendState: (s: EditState) => Promise<LiveAnswerLike>; onRejoin?: () => void; clock?: Clock }): Outbox {
  const clock = opts.clock ?? realClock;
  type StateJob = { kind: "state"; s: EditState; tries: number };
  type Job = StateJob | { kind: "control"; run: () => Promise<LiveAnswerLike>; done: (a: LiveAnswerLike) => void };
  const queue: Job[] = [];
  let busy = false;
  let retryTimer: unknown = null;

  const cancelRetry = () => {
    if (retryTimer !== null) clock.clearTimeout(retryTimer);
    retryTimer = null;
  };
  const queuedState = () => queue.find((j): j is StateJob => j.kind === "state");
  const after = (job: StateJob, a: LiveAnswerLike) => {
    if (a.ok) return;
    if (needsRejoin(a)) opts.onRejoin?.();
    // A newer state is already on its way: it supersedes this one
    if (queuedState()) return;
    if (a.error === "too_long" && job.s.text !== LONG_TEXT_MARK) {
      queue.unshift({ kind: "state", s: { ...job.s, text: LONG_TEXT_MARK, selStart: 0, selEnd: 0 }, tries: job.tries });
      return;
    }
    if ((retryable(a) || needsRejoin(a)) && job.tries < STATE_RETRIES) {
      const slow = a.status === 429 || a.error === "rate_limited" || needsRejoin(a);
      retryTimer = clock.setTimeout(
        () => {
          retryTimer = null;
          if (queuedState()) return;
          queue.push({ kind: "state", s: job.s, tries: job.tries + 1 });
          pump();
        },
        slow ? STATE_RETRY_LIMITED_MS : STATE_RETRY_MS,
      );
    }
  };
  const pump = () => {
    if (busy) return;
    const job = queue.shift();
    if (!job) return;
    busy = true;
    const run = job.kind === "state" ? () => opts.sendState(job.s) : job.run;
    void run()
      .catch((): LiveAnswerLike => ({ ok: false, error: "offline" }))
      .then((a) => {
        if (job.kind === "state") after(job, a);
        else job.done(a);
      })
      .finally(() => {
        busy = false;
        pump();
      });
  };
  return {
    state(s) {
      cancelRetry();
      const queued = queuedState();
      if (queued) {
        queued.s = s;
        queued.tries = 0;
      } else queue.push({ kind: "state", s, tries: 0 });
      pump();
    },
    control(run) {
      return new Promise((done) => {
        queue.push({ kind: "control", run, done });
        pump();
      });
    },
    dropState() {
      cancelRetry();
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === "state") queue.splice(i, 1);
    },
  };
}

// ─── Joining and leaving ─────────────────────────────────────────────────────

export interface StorySpot {
  draftId: string;
  mode: PresenceMode;
}

export type PresenceStep = { kind: "join"; draftId: string; mode: PresenceMode } | { kind: "leave"; draftId: string };

/**
 * The calls that move this tab from one story spot to the next. The same story in another mode is a join
 * alone (the server switches the mode): a leave first could land after the join and drop the tab off the list.
 */
export function planPresence(prev: StorySpot | null, next: StorySpot | null): PresenceStep[] {
  if (!next) return prev ? [{ kind: "leave", draftId: prev.draftId }] : [];
  if (prev && prev.draftId === next.draftId) return prev.mode === next.mode ? [] : [{ kind: "join", ...next }];
  return [...(prev ? [{ kind: "leave" as const, draftId: prev.draftId }] : []), { kind: "join", ...next }];
}

// ─── Refreshing the desk on queue events ─────────────────────────────────────

/** Events from the server's queue fan-out (packages/db events.ts) */
export const QUEUE_EVENTS = [
  "story.arrived",
  "draft.updated",
  "draft.claimed",
  "draft.released",
  "post.queued",
  "post.cancelled",
  "post.sent",
  "post.failed",
  "post.recalled",
  "cap.changed",
  "media.attached",
] as const;

/**
 * Whether a queue event should refresh the desk's lists. A draft.updated that leaves the draft claimed is an
 * autosave (every 1.5 s while someone types) and changes nothing the lists show; one that moves the draft on
 * (queued, posted, rejected, back to ready, the end of a fix) does.
 */
export function refreshesLists(type: string, payload?: { status?: unknown } | null): boolean {
  if (type === "draft.updated") return payload?.status !== "claimed";
  return (QUEUE_EVENTS as readonly string[]).includes(type);
}

/** The shortest gap between two event-driven refreshes of the lists */
export const REFRESH_GAP_MS = 2000;

/**
 * Coalesces event-driven refreshes: only while the tab is visible (a hidden tab keeps its own polling, which
 * catches up when it comes back), at most once every `gapMs`. The first call runs at once; calls inside the gap
 * collapse into one run at its end.
 */
export function createRefreshGate(opts: { run: () => void; visible: () => boolean; gapMs?: number; clock?: Clock }): { call: () => void; cancel: () => void } {
  const clock = opts.clock ?? realClock;
  const gap = opts.gapMs ?? REFRESH_GAP_MS;
  let lastAt = -Infinity;
  let timer: unknown = null;
  const fire = () => {
    timer = null;
    if (!opts.visible()) return;
    lastAt = clock.now();
    opts.run();
  };
  return {
    call() {
      if (!opts.visible() || timer !== null) return;
      const wait = lastAt + gap - clock.now();
      if (wait <= 0) fire();
      else timer = clock.setTimeout(fire, wait);
    },
    cancel() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    },
  };
}

// ─── The presence store ──────────────────────────────────────────────────────

const sameEntry = (a: PresenceEntry, b: PresenceEntry) => a.userId === b.userId && a.mode === b.mode && a.name === b.name && a.color === b.color && a.initials === b.initials;

/** Two lists of one story with the same people in the same order and modes */
export function sameEntries(a: readonly PresenceEntry[], b: readonly PresenceEntry[]): boolean {
  return a.length === b.length && a.every((e, i) => sameEntry(e, b[i]));
}

/**
 * The next presence map, keeping the previous array for every story whose list didn't change, so a reader of
 * one story sees the same reference and doesn't re-render. Returns `prev` itself when nothing changed at all.
 */
export function mergePresence(prev: Readonly<PresenceStories>, next: Readonly<PresenceStories>): PresenceStories {
  let changed = false;
  const out: PresenceStories = {};
  let kept = 0;
  for (const [id, list] of Object.entries(next)) {
    if (!Array.isArray(list)) continue;
    const old = prev[id];
    if (old && sameEntries(old, list)) {
      out[id] = old;
      kept += 1;
    } else {
      out[id] = list;
      changed = true;
    }
  }
  if (kept !== Object.keys(prev).length) changed = true;
  return changed ? out : (prev as PresenceStories);
}

/** One story's list from the store: the stored array, or one shared empty array */
export const NO_PRESENCE: readonly PresenceEntry[] = Object.freeze([]);
export const presenceOf = (stories: Readonly<PresenceStories>, draftId: string | null | undefined): readonly PresenceEntry[] => (draftId && stories[draftId]) || NO_PRESENCE;

// ─── Asking to take over ─────────────────────────────────────────────────────

export type AskState =
  | { state: "idle" }
  /** `waiting`: the server took the ask; until then it is still being sent */
  | { state: "asking"; name: string; waiting: boolean }
  | { state: "declined"; name: string }
  | { state: "failed"; message: string };

export type AskEvent =
  | { type: "ask"; name: string }
  | { type: "sent" }
  | { type: "refused"; error?: string; status?: number }
  | { type: "answered"; accept: boolean; name: string }
  | { type: "timeout" }
  | { type: "reset" };

/** The sentence for an ask the server refused */
export function askRefusal(name: string, error?: string, status?: number): string {
  if (status === 429 || error === "rate_limited" || error === "cooldown") return "You asked a moment ago. Wait a few seconds, then ask again.";
  if (error === "forbidden" || status === 403) return "You can't fix this posted story, so you can't take it over.";
  if (error === "holder_away") return `${name} isn't on this story right now, so they can't answer.`;
  if (error === "offline" || error === "timeout") return "Live view is unavailable, so the ask didn't go. Try again in a moment.";
  return "The ask didn't go through. Try again.";
}

/**
 * The watcher's ask, step by step. An answer counts only while an ask is out; the server taking the ask after
 * its answer already came changes nothing; "pending" (an ask already out) keeps waiting; "no_holder" ends it
 * quietly (the story is free).
 */
export function askReducer(s: AskState, e: AskEvent): AskState {
  switch (e.type) {
    case "ask":
      return { state: "asking", name: e.name, waiting: false };
    case "sent":
      return s.state === "asking" ? { ...s, waiting: true } : s;
    case "refused":
      if (s.state !== "asking") return s;
      if (e.error === "pending") return { ...s, waiting: true };
      if (e.error === "no_holder") return { state: "idle" };
      return { state: "failed", message: askRefusal(s.name, e.error, e.status) };
    case "answered":
      if (s.state !== "asking") return s;
      return e.accept ? { state: "idle" } : { state: "declined", name: e.name };
    case "timeout":
      return s.state === "asking" ? { state: "failed", message: `${s.name} didn't answer. Ask again, or wait for them to finish.` } : s;
    case "reset":
      return s.state === "idle" ? s : { state: "idle" };
  }
}

// ─── Badge colours ───────────────────────────────────────────────────────────

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const rgbOf = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** WCAG contrast of white text on `hex` */
export function whiteContrast(hex: string): number {
  const rgb = rgbOf(hex);
  if (!rgb) return 21;
  const l = 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  return 1.05 / (l + 0.05);
}

/**
 * The person's colour as a fill for white initials: the same hue, darkened in small steps until white text
 * reaches 4.5:1. Colours that already pass come back unchanged, so each person stays recognisable.
 */
export function readableFill(hex: string): string {
  const rgb = rgbOf(hex);
  if (!rgb) return hex;
  let [r, g, b] = rgb;
  let out = hex.toUpperCase();
  for (let i = 0; i < 20 && whiteContrast(out) < 4.5; i++) {
    r = Math.round(r * 0.94);
    g = Math.round(g * 0.94);
    b = Math.round(b * 0.94);
    out = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return out;
}
