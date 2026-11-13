// Where a live draft's tag suggestions came from, and which group the editor shows them in. Suggestions the
// reporter usually carries (measured, or a beat the desk declared) get their own "Reporter usually tags"
// group under the normal ones; every other source, or none at all (older servers), stays a normal suggestion.
// Nothing here ticks a suggestion: both groups start unticked and take one click to accept.

import type { HashtagSuggestion, MentionSuggestion } from "../../../lib/socia/types";

/** Sources that go in the reporter group */
export const REPORTER_SOURCES = ["reporter_prior", "reporter_beat"] as const;

export const REPORTER_GROUP_LABEL = "Reporter usually tags";

export const isReporterSource = (source: string | null | undefined): boolean =>
  !!source && (REPORTER_SOURCES as readonly string[]).includes(source);

/** Splits suggestions into the normal group and the reporter group, each keeping its order */
export function groupSuggestions<T extends { source?: string | null }>(items: readonly T[]): { normal: T[]; reporter: T[] } {
  const normal: T[] = [];
  const reporter: T[] = [];
  for (const item of items) (isReporterSource(item.source) ? reporter : normal).push(item);
  return { normal, reporter };
}

/** A short tag beside the suggestion, for sources the reason alone doesn't name */
export const sourceLabel = (source: string | null | undefined): string | null => (source === "reporter_beat" ? "declared beat" : null);

/** A suggestion as the editor offers it: unticked, with its reason and source */
export interface OfferedTag {
  value: string;
  reason: string;
  source?: string;
  checked: false;
}

const at = (h: string) => (h.startsWith("@") ? h : `@${h}`);
const hash = (t: string) => (t.startsWith("#") ? t : `#${t}`);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The draft's handle suggestions not already on it; the server's reason wins over "Handle for <entity>" */
export function offeredMentions(suggestions: readonly MentionSuggestion[], onDraft: readonly string[]): OfferedTag[] {
  const have = new Set(onDraft.map((m) => at(m).toLowerCase()));
  const out: OfferedTag[] = [];
  for (const s of suggestions) {
    const value = at(s.handle);
    if (have.has(value.toLowerCase())) continue;
    have.add(value.toLowerCase());
    out.push({ value, reason: text(s.reason) || `Handle for ${s.entity}`, ...(s.source ? { source: s.source } : {}), checked: false });
  }
  return out;
}

/**
 * The hashtag suggestions the editor offers. Bare strings (today's API) carry no source and are not listed:
 * the live editor has never shown them, and this change keeps that. Only reporter-group hashtags are added,
 * so the normal hashtag list is exactly what it was.
 */
export function offeredHashtags(suggestions: readonly (string | HashtagSuggestion)[] | undefined, onDraft: readonly string[]): OfferedTag[] {
  const have = new Set(onDraft.map((t) => hash(t).toLowerCase()));
  const out: OfferedTag[] = [];
  for (const s of suggestions ?? []) {
    if (typeof s === "string" || !s || !isReporterSource(s.source)) continue;
    const tag = text(s.tag);
    if (!tag) continue;
    const value = hash(tag);
    if (have.has(value.toLowerCase())) continue;
    have.add(value.toLowerCase());
    out.push({ value, reason: text(s.reason) || "Reporter usually tags this", source: s.source, checked: false });
  }
  return out;
}
