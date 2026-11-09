// The post box: one text box holds the whole post as it will be copied, the body and then the tag line.
// The hashtag and mention pickers are shortcuts that rewrite the tag line; typing in the tag line ticks and
// unticks them. Saving splits the box back into bodyText + hashtags + mentions, so the server (which puts
// them together with assemblePostText) ends up with exactly the text in the box.

import type { TagOption } from "./composerParts";

/** Puts a body and its tags together: the live desk uses the server's assemblePost, the demo composePostText */
export type PostFormat = (body: string, hashtags: string[], mentions: string[]) => string;

/** PATCH /drafts/:id limits (apps/api/src/routes/desk.ts) */
export const SERVER_BODY_MAX = 2000;
export const SERVER_HASHTAGS_MAX = 10;
export const SERVER_MENTIONS_MAX = 5;

/** Picker rows that come from typing in the box rather than from the suggestions */
export const TYPED_REASON = "In the post text";

// A hashtag is # and then letters (any script, with their matras), digits or _: "#दिल्ली" yes, "#Delhi," or "##" no.
const HASHTAG = /^#[\p{L}\p{M}\p{N}_]+$/u;
// On the live desk a mention is an X handle as the API checks it (JSON Schema's ASCII \w, up to 15)
const X_HANDLE = /^@[A-Za-z0-9_]{1,15}$/;
// The demo desk also writes Instagram and Facebook handles, which may carry dots
const ANY_HANDLE = /^@[\p{L}\p{M}\p{N}_.]{1,30}$/u;
const isMarker = (token: string) => token === "#" || token === "@";

/** How two tags are compared: "#News" and "#news" (and NFC/NFD spellings) are the same tag */
export const tagKey = (tag: string) => tag.normalize("NFC").toLowerCase();

export interface SplitOptions {
  /** Live desk: mentions must be X handles */
  strict: boolean;
  /** Lets a lone # or @ (a tag still being typed) sit on the tag line; used only for what the pickers show */
  lenient?: boolean;
}

export interface SplitPost {
  /** Everything above the tag line, trailing whitespace dropped */
  body: string;
  hashtags: string[];
  mentions: string[];
  /** The tag line(s) exactly as typed, trimmed; "" when there is none */
  tail: string;
  /** A lone # or @ was let through (lenient only) */
  marker: boolean;
}

const lines = (text: string) => text.replace(/\r\n?/g, "\n").split("\n");

/**
 * Reads the tag line off the end of the box: the last lines whose every word is a hashtag or handle, with
 * at least one real tag on each (blank lines between them allowed). The first line with any other word ends
 * the search, and it and everything above it is the body, so a #tag inside a sentence stays where the writer
 * put it and a stray "#" is never thrown away. Repeats ("#News #news") count once, the first spelling kept.
 */
export function splitPost(text: string, { strict, lenient = false }: SplitOptions): SplitPost {
  const all = lines(text);
  const handle = strict ? X_HANDLE : ANY_HANDLE;
  const isTag = (t: string) => HASHTAG.test(t) || handle.test(t);
  let i = all.length - 1;
  let first = all.length;
  let marker = false;
  const tokens: string[] = [];
  for (; i >= 0; i--) {
    const line = all[i].trim();
    if (!line) continue;
    const words = line.split(/\s+/);
    const ok = words.some(isTag) && words.every((w) => isTag(w) || (lenient && isMarker(w)));
    if (!ok) break;
    if (words.some(isMarker)) marker = true;
    tokens.unshift(...words);
    first = i;
  }
  const hashtags: string[] = [];
  const mentions: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (isMarker(token) || seen.has(tagKey(token))) continue;
    seen.add(tagKey(token));
    (token.startsWith("#") ? hashtags : mentions).push(token);
  }
  if (first === all.length) return { body: all.join("\n").trimEnd(), hashtags: [], mentions: [], tail: "", marker: false };
  return { body: all.slice(0, first).join("\n").trimEnd(), hashtags, mentions, tail: all.slice(first).join("\n").trim(), marker };
}

export interface ReadOptions {
  /** Live desk: the API's grammar and limits apply */
  strict: boolean;
  /** Live desk: whether the server will take this handle as a mention (suggested for the draft, or verified) */
  accepts?: (handle: string) => boolean;
}

export interface PostBox {
  split: SplitPost;
  /** The post as it is copied and counted: what the server assembles from `save` */
  finalText: string;
  /** What PATCH /drafts/:id gets */
  save: { bodyText: string; hashtags: string[]; mentions: string[] };
  /** A note for the writer: why the last line is plain text, or why the post can't be saved */
  problem: string | null;
  /** More tags than the server keeps: the tag line is plain text, and posting is blocked as too many tags */
  overflow: boolean;
  /** The box can't be saved at all (too long for the server) */
  unsavable: boolean;
}

/**
 * The box as the desk sees it. With `strict`, a tag line the API would refuse (a handle that isn't verified
 * for this draft, more tags than it keeps) is saved as part of the body instead, so the PATCH is always valid
 * and the server's assembled text is still the box, word for word. Handles written in the body still work on X.
 */
export function readPostBox(text: string, format: PostFormat, { strict, accepts }: ReadOptions): PostBox {
  const split = splitPost(text, { strict });
  const whole = lines(text).join("\n").trim();
  let problem: string | null = null;
  let fallback = false;
  let overflow = false;

  if (!split.tail) {
    // A last line that reads as tags but isn't (a lone #, "#Delhi,", a handle X can't take) stays text: say why
    const last = lines(text).map((l) => l.trim()).filter(Boolean).pop() ?? "";
    const words = last ? last.split(/\s+/) : [];
    if (words.length && words.every((w) => /^[#@]/.test(w))) {
      const odd = words.find((w) => !(HASHTAG.test(w) || (strict ? X_HANDLE : ANY_HANDLE).test(w))) ?? words[0];
      problem = isMarker(odd)
        ? `Finish or delete the lone “${odd}” on the last line. Until then the line is plain text, not tags.`
        : `“${odd}” isn’t a hashtag${strict ? " or X handle" : " or handle"}, so the last line is plain text, not tags.`;
    }
  } else if (strict) {
    const unknown = accepts ? split.mentions.find((m) => !accepts(m)) : undefined;
    if (unknown) {
      // The server refuses unverified handles (422 bad_mention), so the tag line is saved as plain text.
      // No warning: the post reads the same and the handle still tags on X once posted.
      fallback = true;
    } else if (split.hashtags.length > SERVER_HASHTAGS_MAX || split.mentions.length > SERVER_MENTIONS_MAX) {
      fallback = true;
      overflow = true;
      problem = `Up to ${SERVER_HASHTAGS_MAX} hashtags and ${SERVER_MENTIONS_MAX} mentions are kept as tags.`;
    }
  }

  const save = fallback || !split.tail ? { bodyText: whole, hashtags: [], mentions: [] } : { bodyText: split.body.trim(), hashtags: split.hashtags, mentions: split.mentions };
  const finalText = fallback || !split.tail ? whole : format(split.body, split.hashtags, split.mentions);
  const unsavable = strict && [...save.bodyText].length > SERVER_BODY_MAX;
  if (unsavable) problem = `The post is over ${SERVER_BODY_MAX} characters, too long to save. Shorten it.`;
  return { split, finalText, save, problem, overflow, unsavable };
}

/** The box with its body replaced and its tag line kept exactly as it is (Make it crisp, Use draft) */
export function withBody(box: string, body: string, opts: SplitOptions): string {
  const { tail } = splitPost(box, { ...opts, lenient: true });
  return [body.trim(), tail].filter(Boolean).join("\n\n");
}

/** The box with its tag line rewritten from the pickers, its body kept */
export const withTags = (box: string, hashtags: string[], mentions: string[], format: PostFormat, opts: SplitOptions): string =>
  format(splitPost(box, { ...opts, lenient: true }).body, hashtags, mentions);

/**
 * What the picker shows: the saved rows, ticked exactly when the box carries them (matched by tagKey, with the
 * box's spelling), then a row for each tag typed in the box that the picker doesn't list. Pure, so typed rows
 * are derived from the text and never stored. Returns `options` itself when nothing differs.
 */
export function syncOptions(options: TagOption[], chosen: string[]): TagOption[] {
  const left = new Map(chosen.map((v) => [tagKey(v), v]));
  let changed = false;
  const next = options.map((o) => {
    const value = left.get(tagKey(o.value));
    if (value !== undefined) left.delete(tagKey(o.value));
    const checked = value !== undefined;
    if (o.checked === checked && (!checked || o.value === value)) return o;
    changed = true;
    return { ...o, checked, value: value ?? o.value };
  });
  for (const value of left.values()) {
    next.push({ value, reason: TYPED_REASON, checked: true });
    changed = true;
  }
  return changed ? next : options;
}

/** Ticked values, in picker order */
export const checkedValues = (options: TagOption[]) => options.filter((o) => o.checked).map((o) => o.value);

/**
 * What a picker change keeps as rows: typed rows that are still ticked come back from the text on their own;
 * one unticked in the picker stays as an added row so it can be ticked again.
 */
export const pickerRows = (options: TagOption[]): TagOption[] =>
  options.filter((o) => o.reason !== TYPED_REASON || !o.checked).map((o) => (o.reason === TYPED_REASON ? { ...o, reason: "Added by editor" } : o));
