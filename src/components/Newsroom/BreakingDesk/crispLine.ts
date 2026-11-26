// The breaking post's line 2, the desk's way: the frontend copy of the composer's crispPoints / breakingDots
// (backend packages/core/src/breaking/compose.ts; whole points since 27 Nov 2026). This
// copy is checked against the backend's 200 shared cases (packages/core/test/fixtures/crisp-cases.json).
import type { SocialPlatform } from "@/types/newsroom";
import { countChars, shortenToFit } from "./socialText";

const X = "X (Twitter)" as const;
const xLen = (text: string) => countChars(text, X);

/** Line 2's length, its dots included: whole points up to MAX (MIN and TARGET describe the desk's habit) */
export const BREAKING_BODY_MIN = 100;
export const BREAKING_BODY_TARGET = 120;
export const BREAKING_BODY_MAX = 130;
/** Kept for old callers: since 27 Nov 2026 line 2 is whole points, so no stub is ever cut (no floor applies) */
export const BREAKING_BODY_FLOOR = 40;
/** The longest whole post the composer writes and the desk can post by hand (b8 decisions §0.2); Fit makes 280 */
export const BREAKING_POST_MAX = 1000;

const nfc = (words: string[]): ReadonlySet<string> => new Set(words.map((w) => w.normalize("NFC")));

/** Trailing punctuation a cut on words or letters drops (core compose.ts TRAILING) */
const TRAILING = /[\s।॥,;:\-–—]+$/u;
/** Line 2's closing dots (or an ellipsis) */
const CLOSING_DOTS = /\s*(?:\.{2,}|…)$/u;

const trimPoint = (p: string) => p.normalize("NFC").replace(/[\s।॥|.,;:!-]+$/u, "").replace(/\s+/g, " ").trim();

let letterSplitter: Intl.Segmenter | null = null;
// Older browsers (Firefox before 125) have no Intl.Segmenter: checked on each use, as the other card files do
const hasSegmenter = () => typeof Intl !== "undefined" && typeof (Intl as { Segmenter?: unknown }).Segmenter === "function";

/** The letters of `text` (whole graphemes); one code point each without a segmenter */
function lettersOf(text: string): string[] {
  if (hasSegmenter()) {
    letterSplitter ??= new Intl.Segmenter("hi", { granularity: "grapheme" });
    return [...letterSplitter.segment(text)].map((s) => s.segment);
  }
  // As the segmenter groups them: an emoji sequence, or a letter with its vowel signs, conjuncts joined by a virama
  return text.match(/\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic}|[\u{E0020}-\u{E007F}])*|\P{M}\p{M}*[\u200C\u200D]*(?:(?<=[\u094D\u200C\u200D])\p{L}\p{M}*[\u200C\u200D]*)*/gu) ?? [];
}

/** Whole letters within `budget`, never ending on a virama (core cutOnGraphemes): the fallback for one huge word */
function cutOnLetters(text: string, budget: number): string {
  let out = "";
  for (const letter of lettersOf(text)) {
    if (xLen(out + letter) > budget) break;
    out += letter;
  }
  return out.replace(/्+$/u, "").replace(TRAILING, "");
}

/** "...." or "...", fixed per story by its headline (the desk: 56% four dots) */
export function breakingDots(seed: string): string {
  let h = 2166136261;
  for (const ch of seed.normalize("NFC")) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619) >>> 0;
  return h % 100 < 56 ? "...." : "...";
}

/** Line 1's headline without its leading hashtags (core plainHeadline): the seed for the dots */
export function plainHeadline(line1: string): string {
  return line1.normalize("NFC").replace(/\s+/g, " ").trim().replace(/^(?:#\S+\s*)+[:：]?\s*/u, "").trim();
}

/** A point with at least this many comma-separated items is a list written on one line (line 2 takes whole items) */
const LIST_MIN_ITEMS = 3;

/**
 * The points as line 2, by WHOLE points (owner, 27 Nov 2026), the same as the composer's (core crispPoints): every point
 * when they all fit in `max` (no dots); otherwise the points from the top while they fit with `dots`, then `dots`; when
 * even the first point does not fit `max`, its comma-separated items the same way (a list on one line, 3 items or more),
 * else that whole point then `dots` as long as it fits `room`; else "". A point, or an item, is never cut.
 */
export function crispPoints(points: string[], dots: string, max = BREAKING_BODY_MAX, room = max): string {
  const parts = points.map(trimPoint).filter(Boolean);
  if (!parts.length || max <= 0) return "";
  const all = parts.join(", ");
  if (xLen(all) <= max) return all;
  const dotLen = xLen(dots);
  const fill = (xs: string[]) => {
    let taken = "";
    for (const x of xs) {
      const next = taken ? `${taken}, ${x}` : x;
      if (xLen(next) + dotLen > max) break;
      taken = next;
    }
    return taken;
  };
  const taken = fill(parts);
  if (taken) return taken + dots;
  const items = parts[0]!.split(/\s*[,،;]\s*/u).filter(Boolean);
  const listed = fill(items);
  if (listed && items.length >= LIST_MIN_ITEMS) return listed + dots;
  const first = parts.length > 1 ? parts[0]! + dots : parts[0]!;
  return xLen(first) <= room ? first : "";
}

const squash = (s: string) => s.normalize("NFC").replace(/[\s,]+/g, " ").trim();
/** A line of hashtags and handles only ("#Extra @x"): Fit never cuts it */
const isTagLine = (line: string) => line.split(/\s+/).every((w) => /^[#@][\p{L}\p{M}\p{N}_]+$/u.test(w) || /^#[A-Za-z0-9_]+(?:-[A-Za-z0-9]+)+$/.test(w));

export interface FitInput {
  /** A live breaking draft (the story's layout is "breaking"); anything else keeps the plain shortening */
  liveBreaking: boolean;
  platform: SocialPlatform;
  /** The post box's text above the tag line */
  body: string;
  /**
   * Line 2 as the composer wrote it (the draft's composerOriginalLine2): never overwritten by saves. Null for a
   * draft from before it existed, whose line 2 is then the desk's own text.
   */
  composerLine2: string | null;
  /** The draft's saved text: the old Fit's fallback for stories that are not live breaking drafts */
  original: string;
  /** The story's points, one per line */
  storyPoints: string[];
  /** Room for the body: X's 280 less the tag line and its blank line */
  budget: number;
}

/**
 * Fits a post body into `budget`: the result is never over it (was the editor's "Fit to 280" button, removed 24 Nov 2026). On a live breaking draft:
 * line 1, the headline, stays; a line of tags and handles stays whole; line 2 is everything else, and
 *   - is rebuilt from the story's points only while it is still the composer's own text,
 *   - is left exactly as typed when the desk wrote it and the post fits, or cut from the desk's own words when not,
 *   - stays out when the desk deleted it.
 * The post is measured exactly as it will go out (Windows line breaks made plain, every line break counted), and
 * line 2 takes fewer whole points until it fits (never a cut inside a point). Dots: the composer's own, else from the
 * plain headline as the composer picks them.
 */
export function fitPostBody({ liveBreaking, platform, body, composerLine2, original, storyPoints, budget }: FitInput): string {
  if (!liveBreaking || platform !== X) {
    const source = countChars(body.trim(), platform) > budget ? body : original;
    return shortenToFit(source, Math.min(budget, platform === X ? 200 : 400), platform);
  }
  const clean = body.replace(/\r\n?/g, "\n").trim();
  const [first = "", ...rest] = clean.split("\n");
  const lines = rest.map((l) => l.trim()).filter(Boolean);
  const tagLines = lines.filter(isTagLine);
  const typed = lines.filter((l) => !isTagLine(l)).join(" ");
  // Tag lines are never cut: when the headline and they do not fit together, the headline is shortened
  const tagRoom = tagLines.length ? xLen(tagLines.join("\n\n")) + 2 : 0;
  const line1 = xLen(first.trim()) + tagRoom > budget ? cutToFit(first.trim(), budget - tagRoom) : first.trim();
  // The tag lines alone are over the budget: nothing else can make it fit
  if (!line1) return cutToFit(clean, budget);
  // Every tag line stays where it was; line 2 (the rest, cut) takes the place of the first text line
  const firstText = lines.findIndex((l) => !isTagLine(l));
  const assemble = (line2: string) =>
    [line1, ...lines.flatMap((l, i) => (isTagLine(l) ? [l] : i === firstText && line2 ? [line2] : []))].join("\n\n");
  if (!typed) return assemble("");
  const untouched = !!composerLine2 && squash(typed) === squash(composerLine2);
  if (!untouched && xLen(clean) <= budget) return clean;
  const dots = composerLine2?.match(/\.{3,4}$/u)?.[0] ?? breakingDots(plainHeadline(line1));
  const points = storyPoints.map((p) => p.trim()).filter(Boolean);
  const source = untouched && points.length ? points : [typed.replace(CLOSING_DOTS, "")];
  // Room for line 2 once line 1, the tag lines and the blank line before line 2 are counted
  const room = budget - xLen(assemble("")) - 2;
  let max = Math.min(BREAKING_BODY_MAX, room);
  let line2 = crispPoints(source, dots, max, room);
  while (line2 && xLen(assemble(line2)) > budget) {
    max -= xLen(assemble(line2)) - budget;
    line2 = crispPoints(source, dots, max);
  }
  const out = assemble(line2);
  // Never over the budget, whatever the input
  return xLen(out) <= budget ? out : cutToFit(out, budget);
}

/** `text` shortened to `budget`: whole sentences or words, and when not one word fits (a huge single word), letters */
function cutToFit(text: string, budget: number): string {
  if (budget <= 0) return "";
  const words = shortenToFit(text, budget, X);
  if (words) return words;
  const letters = cutOnLetters(text, budget - xLen("…"));
  return letters ? `${letters}…` : "";
}
