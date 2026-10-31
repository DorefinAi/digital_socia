// Keeps this browser's storage small so the editor stays quick. The desk writes a small record per draft
// (card design, X-background card, video project); with hundreds of breaking stories a day those never go away
// on their own, and once localStorage (about 5 MB) is full every write slows down and then fails silently.
// Once a day (IST) the old ones are removed. Only keys listed here are touched, never "clear all": sign-in,
// theme, layout, filters and Web Scraper settings stay. Also here: the nightly reload that brings a tab left
// open overnight onto the latest deploy, held back while someone is working.

import { useEffect } from "react";
import { USE_MOCKS } from "@/lib/socia/config";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The IST day the last tidy ran, e.g. "2026-10-31" */
export const TIDY_DAY_KEY = "socia_tidy_day";
/** Per-draft records are kept this long after their last write */
export const DRAFT_RECORD_TTL_MS = 2 * DAY_MS;

/** Per-draft records, by key prefix. Each carries `savedAt` (ms or ISO); records without one are from before it was kept. */
const DRAFT_PREFIXES = [
  "socia_card_design_", // PostEditor designStore
  "socia_bg_card_", // PostEditor bgStore
  "socia_card_choice_", // PostEditor choiceStore (org template picked per draft)
  "studio:", // video/panels/autosave.ts studioKey()
];

/**
 * Demo-only data (usePersistentData pages, lib/access/mockStore); dead weight on the live backend.
 * Not "newsroom_data": NewsroomProvider re-seeds it on every load and the live editor still reads its
 * hashtag rules and handle directory.
 */
const DEMO_KEYS = ["purchases", "companies", "properties", "receipts", "users", "socia_access_demo_v1", "newsroom_role"];

/** "YYYY-MM-DD" of the IST calendar day at `now` */
export function istDay(now: number): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes past IST midnight at `now` */
function istMinutes(now: number): number {
  const d = new Date(now + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Milliseconds from `now` to the next IST hh:mm (always in the future, at most a day away) */
export function msUntilIst(now: number, hour: number, minute = 0): number {
  const target = (hour * 60 + minute) * 60_000;
  const sinceMidnight = (now + IST_OFFSET_MS) % DAY_MS;
  const wait = target - sinceMidnight;
  return wait > 0 ? wait : wait + DAY_MS;
}

/** Video projects the editor may still be working on survive a forced clear for this long after their last save */
export const FORCE_KEEP_STUDIO_MS = 10 * 60_000;

/** Fired on window after a tidy removed card-design choices, so thumbnails drawn from them redraw (live/storyThumbs) */
export const CARD_CHOICES_TIDIED_EVENT = "socia:card-choices-tidied";

/**
 * A record's `savedAt` as ms. A readable record from before `savedAt` was kept is stamped with `now` and
 * written back, so it gets the full TTL from today. Null when the record can't be read.
 */
function savedAtOf(key: string, now: number): number | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const at = (parsed as { savedAt?: unknown }).savedAt;
  if (at === undefined) {
    try {
      localStorage.setItem(key, JSON.stringify({ ...parsed, savedAt: now }));
    } catch {
      // Storage full: it is still kept, and stamped on a later run
    }
    return now;
  }
  const ms = typeof at === "number" ? at : typeof at === "string" ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Removes stale per-draft records (and the demo data when the live backend is in use). Runs at most once per
 * IST day; `force` runs it now and treats every per-draft record as stale, except video projects saved in the
 * last FORCE_KEEP_STUDIO_MS (an editor may have one open). Returns how many keys went.
 * Blocked storage (private mode, site data off) is a no-op that returns 0.
 */
export function tidyBrowserStorage({ force = false, now = Date.now() }: { force?: boolean; now?: number } = {}): number {
  try {
    const today = istDay(now);
    if (!force && localStorage.getItem(TIDY_DAY_KEY) === today) return 0;

    // Collect first: removing while walking by index skips keys
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }

    const stale = keys.filter((k) => {
      if (DRAFT_PREFIXES.some((p) => k.startsWith(p))) {
        if (force && !k.startsWith("studio:")) return true;
        const at = savedAtOf(k, now);
        return at === null || now - at > (force ? FORCE_KEEP_STUDIO_MS : DRAFT_RECORD_TTL_MS);
      }
      return !USE_MOCKS && DEMO_KEYS.includes(k);
    });
    for (const k of stale) localStorage.removeItem(k);
    if (stale.some((k) => k.startsWith("socia_card_choice_"))) window.dispatchEvent(new Event(CARD_CHOICES_TIDIED_EVENT));

    localStorage.setItem(TIDY_DAY_KEY, today);
    return stale.length;
  } catch {
    return 0;
  }
}

// ---- What counts as "someone is working in this tab" ----

let busyCount = 0;

/** Marks the tab busy (an editor is open) while mounted and `busy` is true; the nightly reload waits for it. */
export function useTabBusy(busy = true) {
  useEffect(() => {
    if (!busy) return;
    busyCount++;
    return () => {
      busyCount--;
    };
  }, [busy]);
}

/** An editor registered busy, a dialog is open, or the cursor is in a text field */
export function isTabBusy(): boolean {
  if (busyCount > 0) return true;
  if (typeof document === "undefined") return false;
  // Kept-mounted but closed modals (the mobile nav drawer) sit under .MuiModal-hidden / aria-hidden
  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
  if (Array.from(dialogs).some((d) => !d.closest('.MuiModal-hidden, [aria-hidden="true"]'))) return true;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

// ---- Nightly reload ----

/** The reload window, IST: from 04:30, retried every 10 minutes while busy, given up at 06:00 */
export const RELOAD_FROM = { hour: 4, minute: 30 } as const;
const RELOAD_UNTIL_MIN = 6 * 60;
export const RELOAD_RETRY_MS = 10 * 60_000;

export type ReloadDecision = "reload" | "retry" | "skip";

/**
 * What a tab should do at `now`. Only a tab loaded before today's 04:30 IST reloads (one opened after it is
 * already current, and a reloaded tab is "loaded after", so it reloads once). Busy inside the window: try again
 * later; outside it: leave it for tomorrow.
 */
export function reloadDecision({ now, loadedAt, busy }: { now: number; loadedAt: number; busy: boolean }): ReloadDecision {
  const minutes = istMinutes(now);
  const from = RELOAD_FROM.hour * 60 + RELOAD_FROM.minute;
  if (minutes < from || minutes >= RELOAD_UNTIL_MIN) return "skip";
  const windowStart = now - (minutes - from) * 60_000 - (now % 60_000);
  if (loadedAt >= windowStart) return "skip";
  return busy ? "retry" : "reload";
}

/**
 * Runs the daily tidy now and at every IST midnight, and the 04:30 reload, for as long as the app is open.
 * Mount once, near the top of the client tree.
 */
export function useBrowserTidy() {
  useEffect(() => {
    const loadedAt = Date.now();
    let tidyTimer: ReturnType<typeof setTimeout>;
    let reloadTimer: ReturnType<typeof setTimeout>;

    const tidyAtMidnight = () => {
      tidyBrowserStorage();
      // A minute past midnight, so a timer that fires a hair early still lands on the new day
      tidyTimer = setTimeout(tidyAtMidnight, msUntilIst(Date.now(), 0, 1));
    };

    const tryReload = () => {
      const decision = reloadDecision({ now: Date.now(), loadedAt, busy: isTabBusy() });
      if (decision === "reload") {
        window.location.reload();
        return;
      }
      reloadTimer = setTimeout(tryReload, decision === "retry" ? RELOAD_RETRY_MS : msUntilIst(Date.now(), RELOAD_FROM.hour, RELOAD_FROM.minute));
    };

    tidyAtMidnight();
    reloadTimer = setTimeout(tryReload, msUntilIst(loadedAt, RELOAD_FROM.hour, RELOAD_FROM.minute));
    return () => {
      clearTimeout(tidyTimer);
      clearTimeout(reloadTimer);
    };
  }, []);
}
