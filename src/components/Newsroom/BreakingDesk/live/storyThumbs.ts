// Small story cards for list thumbnails: a story without a photo is drawn on the org template the editor
// would open it on (or the one picked for it in this browser). Drawn lazily, a few per idle moment, at
// thumbnail size, and kept as object URLs in a small LRU so polls and re-renders never redraw them.

import { CARD_CHOICES_TIDIED_EVENT } from "@/lib/browserTidy";
import type { DrawableCardTemplate, OrgCardTemplate, UserCardTemplate } from "@/lib/socia/types";
import type { BreakingTag } from "@/types/newsroom";
import { fontsReady, istDate, paintCardText } from "./backgroundCard";
import { templateImage } from "./orgCanvas";
import { keyHash } from "./useBackgroundCard";

// ─── The design picked for a draft (PostEditor's choiceStore, same browser) ──────────────────────────
const CHOICE_PREFIX = "socia_card_choice_";
const choices = new Map<string, string | null>();
const choiceListeners = new Set<() => void>();

/** The org template slug (or "own") picked for this draft in the editor's Template tab; null when none. */
export function cardChoiceOf(draftId: string): string | null {
  const hit = choices.get(draftId);
  if (hit !== undefined) return hit;
  let value: string | null = null;
  try {
    const raw = localStorage.getItem(`${CHOICE_PREFIX}${draftId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const template = parsed && typeof parsed === "object" ? (parsed as { template?: unknown }).template : null;
    value = typeof template === "string" ? template : null;
  } catch {
    // Storage blocked or a bad record: the story's default design
  }
  if (choices.size > 2000) choices.clear();
  choices.set(draftId, value);
  return value;
}

/** Call after the editor stores a new design for a draft (no id: forget them all), so its thumbnail follows. */
export function cardChoiceChanged(draftId?: string) {
  if (draftId) choices.delete(draftId);
  else choices.clear();
  choiceListeners.forEach((l) => l());
}

const onStorage = (e: StorageEvent) => {
  // Another tab picked a design
  if (e.key === null) cardChoiceChanged();
  else if (e.key.startsWith(CHOICE_PREFIX)) cardChoiceChanged(e.key.slice(CHOICE_PREFIX.length));
};

// lib/browserTidy removed old choices from storage
const onTidied = () => cardChoiceChanged();

export function subscribeCardChoice(listener: () => void) {
  if (!choiceListeners.size) {
    window.addEventListener("storage", onStorage);
    window.addEventListener(CARD_CHOICES_TIDIED_EVENT, onTidied);
  }
  choiceListeners.add(listener);
  return () => {
    choiceListeners.delete(listener);
    if (!choiceListeners.size) {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CARD_CHOICES_TIDIED_EVENT, onTidied);
    }
  };
}

/**
 * The design a story's thumbnail is drawn on, as the editor picks it (PostEditor `activeOrg`): the one picked
 * for the draft, else the one made for the story's tag, else the first. Null without org templates, so lists
 * look as they did before them.
 */
export function thumbTemplate(org: OrgCardTemplate[], own: UserCardTemplate | null, tag: BreakingTag | null, choice: string | null): { key: string; template: DrawableCardTemplate } | null {
  if (!org.length) return null;
  if (choice === "own" && own) return { key: "own", template: own };
  const t = org.find((o) => o.slug === choice) ?? org.find((o) => !!tag && (o.defaultFor as string[]).includes(tag)) ?? org[0];
  return { key: t.slug, template: t };
}

// ─── Drawn thumbnails: object URLs in an LRU ─────────────────────────────────────────────────────────
const MAX_THUMBS = 300;
/** key → object URL (null: the background failed to load). Map order is least recently used first. */
const thumbs = new Map<string, string | null>();
/** Mounted rows showing a key; those are never evicted from under them */
const holds = new Map<string, number>();
const keyListeners = new Map<string, Set<() => void>>();

const notify = (key: string) => keyListeners.get(key)?.forEach((l) => l());

/** The drawn thumbnail for `key`: a URL, null when it could not be drawn, undefined when not drawn yet. */
export const thumbUrl = (key: string): string | null | undefined => thumbs.get(key);

export function subscribeThumb(key: string, listener: () => void) {
  let set = keyListeners.get(key);
  if (!set) keyListeners.set(key, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) keyListeners.delete(key);
  };
}

/** A row shows `key`: keep it cached while mounted, and mark it recently used. */
export function holdThumb(key: string) {
  holds.set(key, (holds.get(key) ?? 0) + 1);
  const url = thumbs.get(key);
  if (url !== undefined) {
    thumbs.delete(key);
    thumbs.set(key, url);
  }
  return () => {
    const n = (holds.get(key) ?? 1) - 1;
    if (n > 0) holds.set(key, n);
    else holds.delete(key);
  };
}

function store(key: string, url: string | null) {
  const old = thumbs.get(key);
  if (old) URL.revokeObjectURL(old);
  thumbs.delete(key);
  thumbs.set(key, url);
  // Oldest first; rows on screen keep theirs even past the limit
  for (const [k, u] of thumbs) {
    if (thumbs.size <= MAX_THUMBS) break;
    if (holds.has(k)) continue;
    thumbs.delete(k);
    if (u) URL.revokeObjectURL(u);
  }
  notify(key);
}

/** How long a background that failed to load is left alone before rows ask for it again */
const RETRY_MS = 60_000;

/** The thumbnail could not be drawn: show none for now, and forget that after `retryIn` so a row in view asks again. */
function storeFailed(key: string, retryIn = RETRY_MS) {
  store(key, null);
  setTimeout(() => {
    if (thumbs.get(key) !== null) return;
    thumbs.delete(key);
    notify(key);
  }, retryIn);
}

/** Identifies one drawing: draft, design and its version, size, today's date (when shown) and the words. */
export function thumbKey(draftId: string, designKey: string, template: DrawableCardTemplate, px: number, headline: string, body: string): string {
  const date = template.layout.date ? istDate(template.layout.date.format) : "";
  return `${draftId}|${designKey}|${template.updatedAt}|${px}|${date}|${keyHash(JSON.stringify([template.backgroundUrl, template.layout, headline, body]))}`;
}

// ─── Backgrounds: each loaded once, scaled once per thumbnail width ──────────────────────────────────
const backgrounds = new Map<string, Promise<HTMLImageElement>>();
const failedAt = new Map<string, number>();
const scaled = new Map<string, HTMLCanvasElement>();
let fonts: Promise<void> | null = null;
/** Decoded backgrounds, once the fonts are ready too */
const loaded = new Map<string, HTMLImageElement>();
const loading = new Set<string>();

function background(url: string): Promise<HTMLImageElement> {
  let p = backgrounds.get(url);
  if (!p) {
    // The same decoded picture the editor and the Template tab use
    p = templateImage(url);
    backgrounds.set(url, p);
    p.catch(() => {
      // Try again a minute later, not on every row
      backgrounds.delete(url);
      failedAt.set(url, Date.now());
    });
  }
  return p;
}

function scaledBackground(url: string, img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const id = `${url}|${w}x${h}`;
  let c = scaled.get(id);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
    }
    if (scaled.size > 24) scaled.clear();
    scaled.set(id, c);
  }
  return c;
}

// ─── The draw queue: rows in or near view ask, idle time draws ───────────────────────────────────────
export interface ThumbJob {
  template: DrawableCardTemplate;
  headline: string;
  body: string;
  /** Width to draw at, in device pixels */
  px: number;
}

const wanted = new Map<string, ThumbJob>();
const busy = new Set<string>();
let scheduled = false;

type IdleDeadline = { timeRemaining: () => number; didTimeout: boolean };
const idle = (fn: (d: IdleDeadline) => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 400 });
  else setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: true }), 16);
};

function schedule() {
  if (scheduled || !wanted.size) return;
  scheduled = true;
  idle(pump);
}

/** A row came into (or near) view: draw it soon. */
export function wantThumb(key: string, job: ThumbJob) {
  if (thumbs.has(key) || busy.has(key)) return;
  wanted.set(key, job);
  schedule();
}

/** The row left view before its turn: skip it. */
export function unwantThumb(key: string) {
  wanted.delete(key);
}

function pump(deadline: IdleDeadline) {
  scheduled = false;
  if (!fonts) fonts = fontsReady();
  let first = true;
  // Only come back for rows that can draw now; rows waiting on a background are scheduled by its load
  let more = false;
  for (const [key, job] of wanted) {
    // One draw even when idle time ran out (didTimeout), more while the frame has room
    if (!first && deadline.timeRemaining() < 6) {
      more = true;
      break;
    }
    const bgUrl = job.template.backgroundUrl;
    const failed = failedAt.get(bgUrl);
    if (failed && Date.now() - failed < RETRY_MS) {
      wanted.delete(key);
      storeFailed(key, RETRY_MS - (Date.now() - failed));
      continue;
    }
    const ready = loaded.get(bgUrl);
    if (!ready) {
      // Load it once, then come back; other rows on the same design wait for the same load
      if (!loading.has(bgUrl)) {
        loading.add(bgUrl);
        Promise.all([background(bgUrl), fonts]).then(
          ([img]) => {
            loading.delete(bgUrl);
            loaded.set(bgUrl, img);
            schedule();
          },
          () => {
            loading.delete(bgUrl);
            for (const [k, j] of wanted)
              if (j.template.backgroundUrl === bgUrl) {
                wanted.delete(k);
                storeFailed(k);
              }
          },
        );
      }
      continue;
    }
    wanted.delete(key);
    first = false;
    draw(key, job, ready);
  }
  if (more) schedule();
}


function draw(key: string, job: ThumbJob, img: HTMLImageElement) {
  const { template } = job;
  const W = template.width > 0 ? template.width : img.naturalWidth;
  const H = template.height > 0 ? template.height : img.naturalHeight;
  const w = Math.max(16, Math.round(job.px));
  const h = Math.max(16, Math.round((H * w) / W));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    store(key, null);
    return;
  }
  ctx.drawImage(scaledBackground(template.backgroundUrl, img, w, h), 0, 0);
  // Text is laid out at the card's own size, exactly as the editor's card, and scaled down
  const scale = w / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  paintCardText(ctx, template.layout, { headline: job.headline, body: job.body }, W, H);
  busy.add(key);
  canvas.toBlob(
    (blob) => {
      busy.delete(key);
      store(key, blob ? URL.createObjectURL(blob) : null);
    },
    "image/jpeg",
    0.86,
  );
}
