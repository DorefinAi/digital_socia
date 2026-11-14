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

export const isReporterSource = (source: unknown): boolean =>
  typeof source === "string" && (REPORTER_SOURCES as readonly string[]).includes(source);

/** Splits suggestions into the normal group and the reporter group, each keeping its order; a missing item is skipped */
export function groupSuggestions<T extends { source?: string | null }>(items: readonly T[]): { normal: T[]; reporter: T[] } {
  const normal: T[] = [];
  const reporter: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    (isReporterSource(item.source) ? reporter : normal).push(item);
  }
  return { normal, reporter };
}

/** A short tag beside the suggestion, for sources the reason alone doesn't name */
export const sourceLabel = (source: string | null | undefined): string | null => (source === "reporter_beat" ? "declared beat" : null);

/** A suggestion as the editor offers it: unticked, with its reason ("" when the server's was malformed) and source */
export interface OfferedTag {
  value: string;
  reason: string;
  source?: string;
  checked: false;
}

const at = (h: string) => (h.startsWith("@") ? h : `@${h}`);
const hash = (t: string) => (t.startsWith("#") ? t : `#${t}`);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
/** One Unicode form for every offered value, the form tagKey compares in: a tag sent twice (NFC and NFD) shows once, as NFC */
const nfc = (v: string) => v.normalize("NFC");
/** The draft's own tags as keys; anything that isn't a string is skipped rather than breaking every suggestion */
const draftKeys = (onDraft: readonly unknown[] | undefined, prefix: (v: string) => string) =>
  new Set((Array.isArray(onDraft) ? onDraft : []).map(text).filter(Boolean).map((v) => tagKey(prefix(v))));
/**
 * A suggestion's reason: its own when it is text, the fallback when it has none (missing, null or blank), and ""
 * when it sent something that isn't text, so only that suggestion's reason line is hidden.
 */
const reasonOf = (raw: unknown, fallback: string): string => {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "string") return "";
  return raw.trim() || fallback;
};
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

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

/**
 * The draft's handle suggestions not already on it; the server's reason wins over "Handle for <entity>". A
 * malformed suggestion (not an object, no text handle) is skipped on its own; the others are still offered.
 */
export function offeredMentions(suggestions: readonly MentionSuggestion[] | undefined, onDraft: readonly string[] | undefined): OfferedTag[] {
  const have = draftKeys(onDraft, at);
  const out: OfferedTag[] = [];
  const index = new Map<string, number>();
  for (const s of Array.isArray(suggestions) ? suggestions : []) {
    if (!isObject(s)) continue;
    const handle = nfc(text(s.handle));
    if (!handle.replace(/^@+/, "")) continue;
    const entity = text(s.entity);
    const reason = reasonOf(s.reason, entity ? `Handle for ${entity}` : "");
    const source = text(s.source);
    addOffer(out, index, have, { value: at(handle), reason, ...(source ? { source } : {}), checked: false });
  }
  return out;
}

/**
 * A server hashtag as the editor would write it (the same normaliseTag typed tags go through), or "" when it
 * isn't a clean tag: anything normalising would have to change beyond the leading # ("Jaipur Police",
 * "Raj.Gov", "#") is dropped rather than offered under the reporter's evidence as a tag they never used.
 * The result is NFC, so a Hindi tag sent in its decomposed form is offered (and shown) as the composed one.
 */
export function offerableHashtag(raw: unknown): string {
  const tag = nfc(text(raw));
  const value = normaliseTag(tag, "#");
  return value && isHashtag(value) && value.slice(1) === tag.replace(/^#+/, "") ? value : "";
}

/** Any hashtag in running text (not only a whole tag): "#Jaipur:", "#JaipurNews," */
const BODY_HASHTAG = /#([\p{L}\p{M}\p{N}_]+)/gu;
/** "#JaipurNews", "#Jaipur_News", "#जयपुरन्यूज़", "#जयपुरसमाचार": the tag of the place a news tag names */
const NEWS_STEM = /^(.+?)_?(?:news|न्यूज़?|समाचार)$/u;

/**
 * The tag keys (tagKey) of every hashtag in a post's text, each "<Place>News" tag also as its place's tag, so a
 * "#Jaipur" suggestion is not offered beside a "#JaipurNews" the post already has. Not text: no keys.
 */
export function bodyTagKeys(body: unknown): Set<string> {
  const keys = new Set<string>();
  if (typeof body !== "string") return keys;
  for (const m of body.normalize("NFC").matchAll(BODY_HASHTAG)) {
    const key = tagKey(`#${m[1]}`);
    keys.add(key);
    const stem = NEWS_STEM.exec(key.slice(1))?.[1];
    if (stem) keys.add(`#${stem}`);
  }
  return keys;
}

/** Reason line for a normal hashtag suggestion that carries none (bare strings, or objects without a reason) */
export const PLAIN_HASHTAG_REASON = "Suggested";

/**
 * Every hashtag suggestion the editor offers, unticked. Bare strings and objects with any other source
 * ("reporter_policy", "district.inferred", none) go in the normal list with their reason when they have one;
 * reporter_prior/reporter_beat ones go in the "Reporter usually tags" group. Tags already on the draft, and
 * anything offerableHashtag would have to rewrite, are skipped. A reason that isn't text hides that one
 * suggestion's reason line; the suggestion itself is still offered.
 */
export function offeredHashtags(
  suggestions: readonly (string | HashtagSuggestion)[] | undefined,
  onDraft: readonly string[] | undefined,
  body?: string | null,
): OfferedTag[] {
  const have = draftKeys(onDraft, hash);
  // A hashtag already in the post text counts as on the draft ("#Jaipur: ..." in line 1, "#JaipurNews" in a line)
  for (const k of bodyTagKeys(body)) have.add(k);
  const out: OfferedTag[] = [];
  const index = new Map<string, number>();
  for (const s of Array.isArray(suggestions) ? suggestions : []) {
    // Anything but a string or an object with a text tag is skipped on its own; the rest are still offered
    if (typeof s !== "string" && !isObject(s)) continue;
    const raw = typeof s === "string" ? s : s.tag;
    const value = offerableHashtag(raw);
    if (!value) continue;
    if (typeof s === "string") {
      addOffer(out, index, have, { value, reason: PLAIN_HASHTAG_REASON, checked: false });
      continue;
    }
    const source = text(s.source);
    const fallback = isReporterSource(source) ? "Reporter usually tags this" : PLAIN_HASHTAG_REASON;
    addOffer(out, index, have, { value, reason: reasonOf(s.reason, fallback), ...(source ? { source } : {}), checked: false });
  }
  return out;
}
