// The asker's side of a hand-over, without React (PostEditor.tsx wires it; takeoverClaim.test.ts covers it). The
// holder says yes before letting go, so the claim starts when the story is released (freed()); a try after
// TAKEOVER_FALLBACK_MS, then every TAKEOVER_RETRY_MS up to TAKEOVER_CLAIM_MS, is the fallback. One claim runs at a
// time: a release that arrives mid-claim asks for one more try right after it. A claim waits its turn behind
// anything already running in the editor (an autosave, a card upload) instead of being dropped.

import { realClock, type Clock } from "../../../../lib/socia/liveCore";

export const TAKEOVER_FALLBACK_MS = 1500;
export const TAKEOVER_RETRY_MS = 1000;
export const TAKEOVER_CLAIM_MS = 15_000;
/** How soon a claim waiting behind a running call looks again */
export const TAKEOVER_BUSY_MS = 250;

export interface TakeoverClaim {
  /** The holder said yes: claim `draftId` (a sequence already running for an earlier ask is replaced) */
  start: (draftId: string) => void;
  /** The story was released: try now */
  freed: () => void;
  cancel: () => void;
  /** Whether a sequence is under way */
  active: () => boolean;
}

export function createTakeoverClaim<T>(opts: {
  /** One claim; resolves to the story when this person got it, null when not (yet) */
  claim: () => Promise<T | null>;
  /** The story open in the editor now (the sequence ends when it changes) */
  currentDraft: () => string | null;
  /** Another call is running in the editor */
  busy: () => boolean;
  onTook: (story: T) => void;
  onGaveUp: () => void;
  clock?: Clock;
}): TakeoverClaim {
  const clock = opts.clock ?? realClock;
  let seq: { draftId: string; until: number } | null = null;
  let timer: unknown = null;
  /** The one running flag: a claim is out */
  let running = false;
  let again = false;

  const clearTimer = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  /** The one timer: the existing one is always cleared before a new one is set */
  const later = (ms: number) => {
    clearTimer();
    timer = clock.setTimeout(() => {
      timer = null;
      void attempt();
    }, ms);
  };
  const cancel = () => {
    clearTimer();
    seq = null;
    again = false;
  };

  const attempt = async (): Promise<void> => {
    const t = seq;
    if (!t) return;
    if (opts.currentDraft() !== t.draftId) return cancel();
    clearTimer();
    // One claim at a time: a try asked for meanwhile runs right after this one, if this one didn't get the story
    if (running) {
      again = true;
      return;
    }
    if (opts.busy()) return later(TAKEOVER_BUSY_MS);
    running = true;
    let got: T | null = null;
    try {
      got = await opts.claim();
    } catch {
      got = null;
    } finally {
      running = false;
    }
    if (seq !== t) {
      // Cancelled, or a new ask's sequence started meanwhile: that one goes on by itself
      if (seq && again) {
        again = false;
        void attempt();
      }
      return;
    }
    const retryNow = again;
    again = false;
    if (got) {
      cancel();
      opts.onTook(got);
    } else if (clock.now() < t.until) later(retryNow ? 0 : TAKEOVER_RETRY_MS);
    else {
      cancel();
      opts.onGaveUp();
    }
  };

  return {
    start(draftId) {
      clearTimer();
      again = false;
      seq = { draftId, until: clock.now() + TAKEOVER_CLAIM_MS };
      // The release event usually comes first; this only starts the fallback
      later(TAKEOVER_FALLBACK_MS);
    },
    freed() {
      if (seq) void attempt();
    },
    cancel,
    active: () => seq !== null,
  };
}
