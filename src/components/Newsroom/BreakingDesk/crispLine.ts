// The breaking post's line 2, the desk's way: the frontend copy of the composer's crispPoints / breakingDots
// (backend packages/core/src/breaking/compose.ts, format b8). The word lists and numbers live in the backend; this
// copy is checked against the backend's 200 shared cases (packages/core/test/fixtures/crisp-cases.json).
import type { SocialPlatform } from "@/types/newsroom";
import { countChars, shortenToFit } from "./socialText";

const X = "X (Twitter)" as const;
const xLen = (text: string) => countChars(text, X);

/** Line 2's length, its dots included: the cut lands between MIN and MAX, nearest TARGET */
export const BREAKING_BODY_MIN = 100;
export const BREAKING_BODY_TARGET = 120;
export const BREAKING_BODY_MAX = 130;
/** A line 2 shorter than this is a stub ("आमजन....") and the post goes without it */
export const BREAKING_BODY_FLOOR = 40;
/** The longest whole post the composer writes and the desk can post by hand (b8 decisions §0.2); Fit makes 280 */
export const BREAKING_POST_MAX = 1000;

const nfc = (words: string[]): ReadonlySet<string> => new Set(words.map((w) => w.normalize("NFC")));

/** Postpositions, conjunctions and relational nouns a point can stop on so its outcome is withheld */
const LINKING_WORDS = nfc([
  "का", "की", "के", "को", "से", "में", "पर", "ने", "और", "व", "एवं", "तथा", "जबकि", "बाद", "लेकर", "दौरान", "तक", "लिए", "साथ",
  "द्वारा", "बीच", "सहित", "समेत", "खिलाफ", "बावजूद", "चलते", "जरिए", "कि", "लेकिन", "पहले",
]);
/** "की गई", "को है": after these the word before is a verb or complete, not a link */
const AUXILIARIES = nfc([
  "गई", "गया", "गए", "गयी", "जा", "जाएगी", "जाएगा", "जाएंगे", "जाती", "जाता", "जाते", "है", "हैं", "था", "थी", "थे", "रही", "रहा", "रहे", "हो",
  "होगा", "होगी", "होंगे", "हुआ", "हुई", "हुए", "सकता", "सकती", "सकते", "चुकी", "चुका", "चुके",
]);
/** Describing words the payoff follows: "डंपर और कार के बीच हुई जोरदार...." */
const HANGING_WORDS = nfc([
  "जोरदार", "भीषण", "बड़ी", "बड़ा", "बड़े", "गंभीर", "दर्दनाक", "तेज", "अहम", "नई", "नया", "नए", "भारी", "खास", "विशेष",
  "अचानक", "पूरी", "पूरा", "पूरे", "अनूठी", "अनूठा", "शानदार", "सनसनीखेज", "जानलेवा", "खूनी",
]);
/** Words that finish a statement: a cut after them gives the outcome away ("…किया गिरफ्तार", "…जारी") */
const FINISHING_WORDS = nfc([
  "किया", "किए", "की", "दी", "दिया", "दिए", "मिला", "मिली", "मिले", "गिरफ्तार", "जारी", "बरामद", "जब्त", "दर्ज", "शुरू", "पूरी",
  "मौजूद", "रवाना", "पहुंचे", "पहुंची", "पहुंचा", "निलंबित", "घायल",
]);
const NUMBER = /^[\p{N}.,:]+$/u;
/** Punctuation left dangling before the dots */
const DANGLING = /[\s,،;:।॥|\-–—]+$/u;
/** Trailing punctuation a cut on words or letters drops (core compose.ts TRAILING) */
const TRAILING = /[\s।॥,;:\-–—]+$/u;
/** Line 2's closing dots (or an ellipsis) */
const CLOSING_DOTS = /\s*(?:\.{2,}|…)$/u;

const trimPoint = (p: string) => p.normalize("NFC").replace(/[\s।॥|.,;:!-]+$/u, "").replace(/\s+/g, " ").trim();

interface Word { text: string; start: number; end: number }

let wordSplitter: Intl.Segmenter | null = null;
let letterSplitter: Intl.Segmenter | null = null;
// Older browsers (Firefox before 125) have no Intl.Segmenter: checked on each use, as the other card files do
const hasSegmenter = () => typeof Intl !== "undefined" && typeof (Intl as { Segmenter?: unknown }).Segmenter === "function";

/** The words of `text`, with their offsets; split on spaces where the browser has no word segmenter */
function wordsOf(text: string): Word[] {
  if (hasSegmenter()) {
    wordSplitter ??= new Intl.Segmenter("hi", { granularity: "word" });
    return [...wordSplitter.segment(text)].filter((s) => s.isWordLike).map((s) => ({ text: s.segment, start: s.index, end: s.index + s.segment.length }));
  }
  // Word characters, the zero-width joiners Hindi typing puts inside a word ("दिल्‍ली"), and numbers like 1.39 / 5,732
  // A word starts with a letter or digit, so the joiners and selectors inside an emoji are never words
  return [...text.matchAll(/[\p{L}\p{N}_][\p{L}\p{M}\p{N}_\u200C\u200D]*(?:[.,:'’][\p{L}\p{N}_][\p{L}\p{M}\p{N}_\u200C\u200D]*)*/gu)].map((m) => ({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

/** The letters of `text` (whole graphemes); one code point each without a segmenter */
function lettersOf(text: string): string[] {
  if (hasSegmenter()) {
    letterSplitter ??= new Intl.Segmenter("hi", { granularity: "grapheme" });
    return [...letterSplitter.segment(text)].map((s) => s.segment);
  }
  // As the segmenter groups them: an emoji sequence, or a letter with its vowel signs, conjuncts joined by a virama
  return text.match(/\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic}|[\u{E0020}-\u{E007F}])*|\P{M}\p{M}*[\u200C\u200D]*(?:(?<=[\u094D\u200C\u200D])\p{L}\p{M}*[\u200C\u200D]*)*/gu) ?? [];
}

const isContent = (w: Word | undefined): w is Word => !!w && !LINKING_WORDS.has(w.text) && !AUXILIARIES.has(w.text);

/** The longest run of whole words within `budget`, trailing punctuation dropped (core cutOnWords) */
function cutOnWords(text: string, budget: number): string {
  if (budget <= 0) return "";
  let end = 0;
  for (const w of wordsOf(text)) {
    if (xLen(text.slice(0, w.end)) > budget) break;
    end = w.end;
  }
  return text.slice(0, end).replace(TRAILING, "");
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

/**
 * The points as line 2: all of them when they fit in `max`; otherwise a cut between MIN and `max` X characters
 * (dots included) that withholds the payoff, then `dots`. Under BREAKING_BODY_FLOOR: "". Same as the composer's.
 */
export function crispPoints(points: string[], dots: string, max = BREAKING_BODY_MAX): string {
  const parts = points.map(trimPoint).filter(Boolean);
  if (!parts.length || max <= 0) return "";
  const all = parts.join(", ");
  const line = xLen(all) <= max ? all : cutPoints(parts, all, dots, max);
  return xLen(line) < BREAKING_BODY_FLOOR ? "" : line;
}

function cutPoints(parts: string[], all: string, dots: string, max: number): string {
  const dotLen = xLen(dots);
  // Never under the floor: a shorter cut would win on score and then be dropped as a stub (review B2)
  const lo = Math.max(BREAKING_BODY_FLOOR, Math.min(BREAKING_BODY_MIN, max - 30));
  const target = Math.min(BREAKING_BODY_TARGET, max);
  const words = wordsOf(all);
  // Each word's point, and how many words and content words of that point come after it
  const point: number[] = [];
  let p = 0;
  let pointEnd = parts[0]!.length;
  for (const w of words) {
    while (w.start >= pointEnd && p < parts.length - 1) pointEnd += 2 + parts[++p]!.length;
    point.push(p);
  }
  const rest = new Array<number>(words.length).fill(0);
  const hidden = new Array<number>(words.length).fill(0);
  for (let i = words.length - 2; i >= 0; i--) {
    if (point[i + 1] !== point[i]) continue;
    rest[i] = rest[i + 1]! + 1;
    hidden[i] = hidden[i + 1]! + (isContent(words[i + 1]) ? 1 : 0);
  }
  let best: { text: string; score: number } | null = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const text = all.slice(0, w.end).replace(DANGLING, "");
    const len = xLen(text) + dotLen;
    // Prefixes only grow: nothing after this fits either
    if (len > max) break;
    if (!text || len < lo) continue;
    const next = words[i + 1];
    let score = 0;
    // The order matters: "की" is both a linking and a finishing word, "पूरी" both describing and finishing; the
    // first rule that matches decides
    if (!rest[i]) score -= 4;
    else if (LINKING_WORDS.has(w.text) && isContent(next) && !(NUMBER.test(words[i - 1]?.text ?? "") && NUMBER.test(next.text))) score += 3;
    else if (HANGING_WORDS.has(w.text) && isContent(next)) score += 3;
    else if (FINISHING_WORDS.has(w.text) || AUXILIARIES.has(w.text)) score -= 2;
    else if (NUMBER.test(w.text)) score -= 2;
    else if (isContent(w) && next && (FINISHING_WORDS.has(next.text) || AUXILIARIES.has(next.text))) score += 2;
    else if (LINKING_WORDS.has(w.text)) score -= 1;
    if (rest[i] && hidden[i]! >= 2) score += 1;
    score -= Math.abs(len - target) / 10;
    if (!best || score > best.score) best = { text, score };
  }
  if (best) return best.text + dots;
  const onWords = cutOnWords(all, max - dotLen).replace(DANGLING, "");
  if (onWords && xLen(onWords) + dotLen >= BREAKING_BODY_FLOOR) return onWords + dots;
  const onLetters = cutOnLetters(all, max - dotLen).replace(DANGLING, "");
  return onLetters ? onLetters + dots : "";
}

const squash = (s: string) => s.normalize("NFC").replace(/[\s,]+/g, " ").trim();
/** A line of hashtags and handles only ("#Extra @x"): Fit never cuts it */
const isTagLine = (line: string) => line.split(/\s+/).every((w) => /^[#@][\p{L}\p{M}\p{N}_]+$/u.test(w));

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
 * "Fit to 280" (the desk's tool for a short post: the result is never over `budget`). On a live breaking draft:
 * line 1, the headline, stays; a line of tags and handles stays whole; line 2 is everything else, and
 *   - is rebuilt from the story's points only while it is still the composer's own text,
 *   - is left exactly as typed when the desk wrote it and the post fits, or cut from the desk's own words when not,
 *   - stays out when the desk deleted it.
 * The post is measured exactly as it will go out (Windows line breaks made plain, every line break counted), and
 * line 2 is cut again until it fits; under 40 characters it is dropped. Dots: the composer's own, else from the
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
  let max = Math.min(BREAKING_BODY_MAX, budget - xLen(assemble("")) - 2);
  let line2 = crispPoints(source, dots, max);
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
