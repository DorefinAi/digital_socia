// Where a live draft's tag suggestions came from, and which group the editor shows them in. Suggestions the
// reporter usually carries (measured, or a beat the desk declared) get their own "Reporter usually tags"
// group under the normal ones; every other source, or none at all (older servers), stays a normal suggestion.
// Nothing here ticks a suggestion: both groups start unticked and take one click to accept.

import type { HashtagSuggestion, MentionSuggestion } from "../../../lib/socia/types";
import { isHashtag, tagKey } from "./postBox";
import { normaliseTag } from "./socialText";

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

/**
 * Adds a suggestion unless the draft already carries it. When two suggestions are the same tag (any case),
 * the first keeps its place, but a reporter-sourced one replaces a non-reporter one there, so its group and
 * reason (the evidence for ticking it) are not hidden by a plain duplicate.
 */
function addOffer(out: OfferedTag[], index: Map<string, number>, onDraft: ReadonlySet<string>, offer: OfferedTag) {
  const key = tagKey(offer.value);
  if (onDraft.has(key)) return;
  const i = index.get(key);
  if (i === undefined) {
    index.set(key, out.length);
    out.push(offer);
  } else if (isReporterSource(offer.source) && !isReporterSource(out[i].source)) {
    out[i] = offer;
  }
}

/** The draft's handle suggestions not already on it; the server's reason wins over "Handle for <entity>" */
export function offeredMentions(suggestions: readonly MentionSuggestion[], onDraft: readonly string[]): OfferedTag[] {
  const have = new Set(onDraft.map((m) => tagKey(at(m.trim()))));
  const out: OfferedTag[] = [];
  const index = new Map<string, number>();
  for (const s of suggestions) {
    const handle = text(s.handle);
    if (!handle.replace(/^@+/, "")) continue;
    const reason = text(s.reason) || `Handle for ${s.entity}`;
    addOffer(out, index, have, { value: at(handle), reason, ...(s.source ? { source: s.source } : {}), checked: false });
  }
  return out;
}

/**
 * A server hashtag as the editor would write it (the same normaliseTag typed tags go through), or "" when it
 * isn't a clean tag: anything normalising would have to change beyond the leading # ("Jaipur Police",
 * "Raj.Gov", "#") is dropped rather than offered under the reporter's evidence as a tag they never used.
 */
export function offerableHashtag(raw: unknown): string {
  const tag = text(raw);
  const value = normaliseTag(tag, "#");
  return value && isHashtag(value) && value.slice(1) === tag.replace(/^#+/, "") ? value : "";
}

/** Reason line for a normal hashtag suggestion that carries none (bare strings, or objects without a reason) */
export const PLAIN_HASHTAG_REASON = "Suggested";

/**
 * Every hashtag suggestion the editor offers, unticked. Bare strings and objects with any other source
 * ("reporter_policy", "district.inferred", none) go in the normal list with their reason when they have one;
 * reporter_prior/reporter_beat ones go in the "Reporter usually tags" group. Tags already on the draft, and
 * anything offerableHashtag would have to rewrite, are skipped.
 */
export function offeredHashtags(suggestions: readonly (string | HashtagSuggestion)[] | undefined, onDraft: readonly string[]): OfferedTag[] {
  const have = new Set(onDraft.map((t) => tagKey(hash(t.trim()))));
  const out: OfferedTag[] = [];
  const index = new Map<string, number>();
  for (const s of suggestions ?? []) {
    if (!s) continue;
    const raw = typeof s === "string" ? s : s.tag;
    const value = offerableHashtag(raw);
    if (!value) continue;
    if (typeof s === "string") {
      addOffer(out, index, have, { value, reason: PLAIN_HASHTAG_REASON, checked: false });
      continue;
    }
    const source = text(s.source);
    const fallback = isReporterSource(source) ? "Reporter usually tags this" : PLAIN_HASHTAG_REASON;
    addOffer(out, index, have, { value, reason: text(s.reason) || fallback, ...(source ? { source } : {}), checked: false });
  }
  return out;
}
