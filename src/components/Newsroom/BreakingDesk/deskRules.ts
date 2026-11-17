// Small pure rules of the X desk and studio, kept apart from the components so they can be unit-checked
// (deskRules.test.ts): the queue's day key and date chip, the age dot, the post counter's colour, text size
// steps, and which story comes next in the queue's order.

// The desk works on India time whatever the browser's zone says: the server's ?day= is an IST day
const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** The IST day of a moment as "YYYY-MM-DD" (the queue's ?day= and its date filter), or null for an unreadable time */
export function istDay(value: Date | string | number): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? IST_DAY.format(date) : null;
}

/** Today's IST day, read when called (the desk re-reads it on every poll, so it rolls over at midnight IST) */
export const istToday = () => istDay(Date.now());

/** True for a real calendar day written "YYYY-MM-DD" (2026-02-30 is not one) */
export function isDayKey(day: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** "YYYY-MM-DD" from calendar numbers (month 1-12), with no time zone involved */
export const dayKey = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The age dot on a queue row: green under 5 minutes, amber under 30, grey after */
export const ageTone = (iso: string, now = Date.now()): "fresh" | "recent" | "old" => {
  const age = now - new Date(iso).getTime();
  return age < 5 * 60 * 1000 ? "fresh" : age < 30 * 60 * 1000 ? "recent" : "old";
};

/** The post counter's colour: X turns amber from 260 and red at 280 (the limit); other platforms at 90% / 100% */
export const counterTone = (used: number, limit: number, isX: boolean): "success" | "warning" | "error" =>
  used >= limit ? "error" : used >= (isX ? 260 : limit * 0.9) ? "warning" : "success";

/** The text size one step (10%) bigger or smaller, on the control's own step and within its bounds */
export const steppedTextSize = (value: number, direction: 1 | -1, min: number, max: number, step: number) => {
  const next = value * (direction === 1 ? 1.1 : 0.9);
  return +Math.max(min, Math.min(max, Math.round(next / step) * step)).toFixed(4);
};

/** S / M / L: a scale (80%, 100%, 120%) for the headline, or a pixel size for a text box */
export const textSizePreset = (preset: "S" | "M" | "L", min: number, max: number) =>
  max <= 2 ? { S: 0.8, M: 1, L: 1.2 }[preset] : Math.max(min, Math.min(max, { S: 32, M: 48, L: 72 }[preset]));

/** The story before (-1) or after (1) the current one in the given order; none past either end or when it isn't listed */
export function adjacentStory<T extends { id: string }>(stories: readonly T[], currentId: string, direction: 1 | -1): T | undefined {
  const index = stories.findIndex((story) => story.id === currentId);
  return index < 0 ? undefined : stories[index + direction];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-11" -> "11th Nov", the date chip's label (fixed month names, so every browser reads the same) */
export function dayChipLabel(day: string): string {
  if (!isDayKey(day)) return day;
  const [, m, d] = day.split("-").map(Number);
  const suffix = d % 100 >= 11 && d % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[d % 10] ?? "th";
  return `${d}${suffix} ${MONTHS[m - 1]}`;
}

/** After a story is marked posted: the next story in the queue's order, else the one before, else none (back to the desk). */
export function storyAfterPosted<T extends { id: string }>(stories: readonly T[], postedId: string): T | undefined {
  return adjacentStory(stories, postedId, -1) ?? adjacentStory(stories, postedId, 1);
}

/**
 * The stories to try, in turn, after `postedId` was posted: the ones after it in the queue's order, then the ones
 * before it (nearest first), leaving out the posted one and every story `taken` says someone else has or can't be
 * worked. The first is the story to open; the rest are where to go if its claim fails. Empty: back to the desk.
 * A posted story not in the list (filtered out, or a fix of one already posted) starts from the top of the list.
 */
export function advanceCandidates<T extends { id: string }>(stories: readonly T[], postedId: string, taken: (story: T) => boolean): T[] {
  const at = stories.findIndex((s) => s.id === postedId);
  if (at < 0) return stories.filter((s) => !taken(s));
  const after = stories.slice(at + 1);
  const before = stories.slice(0, at).reverse();
  return [...before, ...after].filter((s) => s.id !== postedId && !taken(s));
}

/**
 * What the editor does after a post, or after a fix of a posted story (`fix`), given the next free story (if any):
 * open it with the FTP feed on the left, or close when none is free. After a fix the desk behind turns to its
 * New tab ("queue") either way, so closing lands there.
 */
export type AfterPost<T> = { open: T; tool: "ftp"; returnTo: "queue" | undefined } | { open: null; returnTo: "queue" | undefined };
export function afterPost<T>(next: T | undefined, fix: boolean): AfterPost<T> {
  const returnTo = fix ? "queue" : undefined;
  return next ? { open: next, tool: "ftp", returnTo } : { open: null, returnTo };
}

/** The queue narrowed to the open story's tab (BIG Breaking or Breaking), so the pick after posting never flips tabs */
export function sameTab<T extends { id: string }, K>(order: readonly T[], current: T, tabOf: (story: T) => K): T[] {
  const tab = tabOf(current);
  return order.filter((s) => s.id === current.id || tabOf(s) === tab);
}

/**
 * The stories to pick from after Copy & Mark Posted (or a fix): the open story's own tab only, without posted
 * stories, the open story kept in its place so the pick starts from the one just above it. `currentTab` is the
 * tab the desk knows the open story by (its queue row), so a story whose editor copy lacks the BIG tag never flips tabs.
 */
export function afterPostOrder<T extends { id: string }, K>(order: readonly T[], currentId: string, currentTab: K, tabOf: (story: T) => K, isPosted: (story: T) => boolean): T[] {
  return order.filter((s) => s.id === currentId || (tabOf(s) === currentTab && !isPosted(s)));
}

/**
 * The story a click on a BIG Breaking / Breaking tab opens: the one last open in that tab while it is still listed,
 * else the tab's top story that isn't posted, else none (the tab shows, nothing opens). Never starts a fix.
 */
export function tabTarget<T extends { id: string }, K>(listed: readonly T[], tab: K, tabOf: (story: T) => K, remembered: string | null | undefined, isPosted: (story: T) => boolean): T | undefined {
  const inTab = listed.filter((s) => tabOf(s) === tab);
  return (remembered ? inTab.find((s) => s.id === remembered) : undefined) ?? inTab.find((s) => !isPosted(s));
}

/** Only the body of the FTP story is copied: never the headline or the file name */
export function ftpCopyText(sourceText: string | null | undefined, body: string | null | undefined): string {
  return sourceText?.trim() || body?.trim() || "";
}

/** The draft fields the pick after posting reads (a live queue item's status and claim) */
export interface AdvanceDraft {
  status: string;
  claim: { mine: boolean } | null;
}

/**
 * Whether the studio may move on to this story after posting: it is waiting to be worked ("ready", or "claimed"
 * by no one else), nobody else has it open in edit mode, and it isn't posted, rejected, sending or rendering.
 * A story without draft data (the demo desk) counts as free unless someone is editing it.
 */
export function freeForAdvance(id: string, draft: AdvanceDraft | null | undefined, editedByOthers: ReadonlySet<string>): boolean {
  if (editedByOthers.has(id)) return false;
  if (!draft) return true;
  if (draft.status !== "ready" && draft.status !== "claimed") return false;
  return !draft.claim || draft.claim.mine;
}

/** The queue's order for Prev / Next and the story after posting: without stories `skip` says to step over, but always with the open one */
export function workableOrder<T extends { id: string }>(stories: readonly T[], currentId: string, skip: (story: T) => boolean): T[] {
  return stories.filter((story) => story.id === currentId || !skip(story));
}

/** All / BIG Breaking / Breaking over `stories`: a story without a BIG / Breaking tag counts in All only. */
export function priorityCounts<T>(stories: readonly T[], tag: (story: T) => "big_breaking" | "breaking" | null | undefined): { all: number; big_breaking: number; breaking: number } {
  const counts = { all: 0, big_breaking: 0, breaking: 0 };
  for (const story of stories) {
    counts.all += 1;
    const t = tag(story);
    if (t) counts[t] += 1;
  }
  return counts;
}

/**
 * All / BIG Breaking / Breaking for the date box's day (today, or the picked earlier day): only stories whose
 * IST day is `day` count, so the numbers are that day's, not every day still waiting. The priority switch,
 * the search and the other filters narrow the list, never these numbers.
 */
export function dayPriorityCounts<T>(
  stories: readonly T[],
  day: string,
  dayOf: (story: T) => string | null,
  tag: (story: T) => "big_breaking" | "breaking" | null | undefined,
): { all: number; big_breaking: number; breaking: number } {
  return priorityCounts(stories.filter((story) => dayOf(story) === day), tag);
}

/** The patti number in an FTP file name: the first all-digit part of 3+ digits ("nat_flash_rj_breaking_7920_yn_..." -> "7920") */
export function pattiNumber(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const base = fileName.split(/[\\/]/).pop()!.replace(/\.[a-z0-9]+$/i, "");
  return base.split(/[_\-\s]+/).find((part) => /^\d{3,}$/.test(part)) ?? null;
}
