// Words for a story row in the header search: its age and its desk status.

import type { DraftStatus, StorySearchItem, StorySearchMatch } from "@/lib/socia/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const IST = "Asia/Kolkata";

const istDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: IST });

/** "just now", "12 min ago", "2 h ago" (same IST day), "Yesterday", then "12 Nov" ("12 Nov 2025" in another year) */
export function storyAge(iso: string, now: number): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const diff = Math.max(0, now - at);
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (istDay(at) === istDay(now)) return `${Math.floor(diff / HOUR)} h ago`;
  if (istDay(at) === istDay(now - 24 * HOUR)) return "Yesterday";
  const sameYear = istDay(at).slice(0, 4) === istDay(now).slice(0, 4);
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric", timeZone: IST });
}

export type StatusTone = "done" | "problem" | "neutral";

/** Every draft status, so a new one in DraftStatus is a type error here until it has a label */
const STATUS: Record<DraftStatus, { label: string; tone: StatusTone }> = {
  rendering: { label: "Drawing card", tone: "neutral" },
  ready: { label: "Ready", tone: "neutral" },
  claimed: { label: "Being edited", tone: "neutral" },
  queued: { label: "Queued", tone: "neutral" },
  publishing: { label: "Sending", tone: "neutral" },
  published: { label: "Posted", tone: "done" },
  failed: { label: "Failed", tone: "problem" },
  rejected: { label: "Rejected", tone: "problem" },
  render_failed: { label: "Card failed", tone: "problem" },
  recalled: { label: "Recalled", tone: "problem" },
};

/** The desk's name for a status; an unknown one is shown as the server wrote it, in sentence case */
export function storyStatus(status: string): { label: string; tone: StatusTone } {
  // hasOwn, so a status such as "constructor" can't resolve to Object.prototype
  if (Object.hasOwn(STATUS, status)) return STATUS[status as DraftStatus];
  const text = status.replace(/_/g, " ").trim();
  return { label: text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown", tone: "neutral" };
}

const MATCH_NOTES: Record<StorySearchMatch, string | null> = {
  text: null,
  phonetic: "matched by sound",
  translated: "matched in Hindi",
};

/** Why an English or Roman query found a Hindi story; nothing for a plain text match (or a kind this desk doesn't know yet) */
export function matchNote(match: StorySearchMatch): string | null {
  return Object.hasOwn(MATCH_NOTES, match) ? MATCH_NOTES[match] : null;
}

/**
 * How far back a ?story= link opens a draft: GET /drafts/resolve only matches drafts from the last 30 days,
 * so the server sends no linkSlug for older stories.
 */
export const STORY_LINK_DAYS = 30;
const DAY = 24 * HOUR;

/** Why a story row can't be opened: a short form for announcements, the full one shown on the row */
export type Blocked = { short: string; long: string };
export const BLOCKED_TOO_OLD: Blocked = { short: "Older than 30 days", long: "Older than 30 days. Find it in the Posted list." };
export const BLOCKED_NO_DRAFT: Blocked = { short: "No X draft yet", long: "No X draft yet. It opens here once the desk drafts it." };
export const BLOCKED_NO_ACCESS: Blocked = { short: "You can't open X Post Studio", long: "You can't open X Post Studio." };

/** Null when the row opens; otherwise why not. `now` is the time the answer arrived. */
export function storyBlocked(story: Pick<StorySearchItem, "linkSlug" | "receivedAt">, canOpenX: boolean, now: number): Blocked | null {
  if (!story.linkSlug) {
    const at = new Date(story.receivedAt).getTime();
    return Number.isFinite(at) && now - at > STORY_LINK_DAYS * DAY ? BLOCKED_TOO_OLD : BLOCKED_NO_DRAFT;
  }
  return canOpenX ? null : BLOCKED_NO_ACCESS;
}
