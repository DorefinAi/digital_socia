// The words a card is drawn with come from the story (its headline and its points), never from the X post:
// the heading, then the points as one paragraph (cardBodyText).
// The post starts with place hashtags ("#Jodhpur #रावतभाटा: <headline>"); the card heading starts with the last
// of them without its "#" ("रावतभाटा: <headline>"): the town in Hindi, else the district's English name.

import type { HeadingPlace, QueueItem } from "@/lib/socia/types";
import { CARD_DISTRICTS, CARD_NATIONALS, CARD_TOWNS } from "./cardPlaces.generated";

/** A run of leading hashtags that ends in ":" ("#Jodhpur #रावतभाटा: "); "#1 priority: …" is left alone */
const LEADING_TAGS = /^\s*(?:#[^\s:：]+\s*)+[:：]\s*/u;
const LEADING_COLON = /^[:：]\s*/u;
/** "Jaipur: " or "Sawai Madhopur : " at the start: 1-3 Latin words (hyphens allowed) and a colon */
/** Any short lead before a colon, in any script: "BJP: ", "Congress Kota: ", "ब्रेकिंग: " */
const LEADING_LEAD = /^\s*[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}_-]*(?:\s+[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}_-]*){0,2}\s*[:：]\s+/u;
const LEADING_PLACE = /^\s*([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,2})\s*[:：]\s*/;

/**
 * Places the server may give as stories.district or as the card's place: Rajasthan's districts and the national places
 * the composer knows, in every spelling (cardPlaces.generated.ts, built from the backend's own data: plan C3). Compared
 * without case, spaces or hyphens. A card headline saved with one of them in front ("Jaipur: …") gets it replaced, never
 * stacked ("Ajmer: Jaipur: …"), when the place changes.
 */
const KNOWN_PLACES = new Set([...CARD_DISTRICTS.flatMap((d) => d.names), ...CARD_NATIONALS.flatMap((d) => d.names)].map((p) => placeKey(p)));

/** Rajasthan's towns (everyday words left out): a saved "बेगूं: …" lead is a place, so a new place replaces it */
const KNOWN_TOWNS = new Set(CARD_TOWNS.map((t) => placeMatchKey(t)));

function placeKey(place: string): string {
  return place.normalize("NFC").toLowerCase().replace(/[\s-]+/g, "");
}

/** Every spelling of a district or national place, keyed by placeKey of any of them */
const DISTRICT_NAMES = new Map<string, readonly string[]>(
  [...CARD_DISTRICTS, ...CARD_NATIONALS].flatMap((d) => d.names.map((n) => [placeKey(n), d.names] as const)),
);

/**
 * A place spelling's key (backend packages/core/src/breaking/place-match.ts placeMatchKey, the same rules; the shared
 * case list keeps the two in step): NFC, zero-width joiners out, nukta, chandrabindu and anusvara out ("नैनवा" =
 * "नैनवां"), long vowels as short, spaces and hyphens out ("बड़ी सादड़ी" = "बड़ीसादड़ी"), lower-cased.
 */
export function placeMatchKey(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u200c\u200d]/g, "")
    .normalize("NFD")
    .replace(/[ङञणनम]्(?=[क-ह])/g, "ं") // a half nasal before a consonant is the anusvara (बून्दी = बूंदी)
    .replace(/[़ँं]/g, "")
    .replace(/ी/g, "ि")
    .replace(/ू/g, "ु")
    .replace(/ई/g, "इ")
    .replace(/ऊ/g, "उ")
    .normalize("NFC")
    .replace(/[\s\-–—_]+/gu, "")
    .toLowerCase();
}

/** The most words a place name is written in ("नीम का थाना", "सवाई माधोपुर"): the backend's PLACE_MAX_WORDS */
const PLACE_MAX_WORDS = 4;

/**
 * When `text` opens with one of `names` (its first word, or its first words written apart: "नीम का थाना"), the length of
 * that opening; 0 otherwise; the longest match wins. The backend's openingPlaceLength, the same rules.
 */
export function openingPlaceLength(text: string, names: Iterable<string>): number {
  const keys = new Set([...names].map(placeMatchKey).filter(Boolean));
  if (!keys.size) return 0;
  const lead = /^\s*/u.exec(text)![0].length;
  const words = [...text.slice(lead).matchAll(/[\p{L}\p{M}\p{N}\u200c\u200d]+/gu)].slice(0, PLACE_MAX_WORDS);
  if (!words[0] || words[0].index !== 0) return 0;
  let joined = 1;
  while (joined < words.length && /^[\s\-–]+$/u.test(text.slice(lead + (words[joined - 1]!.index ?? 0) + words[joined - 1]![0].length, lead + (words[joined]!.index ?? 0)))) joined++;
  for (let k = joined; k >= 1; k--) {
    if (keys.has(placeMatchKey(words.slice(0, k).map((w) => w[0]).join("")))) return lead + (words[k - 1]!.index ?? 0) + words[k - 1]![0].length;
  }
  return 0;
}

/** R3: the place word is part of a compound or route when a hyphen or dash follows it ("जयपुर-दिल्ली हाईवे"): it stays */
export function placeWordInCompound(text: string, opening: number): boolean {
  return opening > 0 && /^\s*[-–—]/u.test(text.slice(opening));
}

/** Every name a place goes by: as written, and every spelling of a district or national place */
function namesOf(place: string | null | undefined): string[] {
  const p = (place ?? "").trim();
  if (!p) return [];
  return [p, ...(DISTRICT_NAMES.get(placeKey(p)) ?? [])];
}

/**
 * D1 guard (owner, 23 Nov 2026): dropping the place word must not leave the heading opening with a postposition
 * ("बूंदी के देई…" → never "Bundi: के देई…"); then the word stays and no place goes in front.
 */
const POSTPOSITION = /^(?:में|के|की|का|से|पर|ने|को|तक|द्वारा|और|एवं|व|तथा|सहित|समेत|संग|भी)(?![\p{L}\p{M}\p{N}])/u;

/** "बड़ीसादड़ी": a town as its hashtag spells it (core breaking/compose.ts townHashtag), without the "#" */
export function townTag(town: string | null | undefined): string {
  return (town ?? "").normalize("NFC").replace(/[^\p{L}\p{M}\p{N}_]+/gu, "");
}

/** One word and a colon at the start: "बेगूं: ", "Sirohi: " */
const ONE_WORD_LEAD = /^\s*([\p{L}\p{M}\p{N}_]+)\s*[:：]\s*/u;

/**
 * The place a card heading starts with: the last place tag of the post's first line, without "#". That is
 * the story's town in Hindi when it has one ("#Jhalawar #डग: …" → "डग"), else the district's English name
 * ("#Sirohi: …" → "Sirohi"). Empty when the story has neither.
 */
export function cardPlace(district: string | null | undefined, town: string | null | undefined): string {
  // R8: a national place's name with its spaces ("UttarPradesh" → "Uttar Pradesh")
  return townTag(town) || (district ?? "").trim().replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * The story's town: the field when the server sends one (null: no town). An older server without the field:
 * the last tag of the post's "#District #Town:" first line, when that tag is not the district.
 */
export function storyTown(town: string | null | undefined, bodyText: string | null | undefined, district: string | null | undefined): string | null {
  if (town !== undefined) return town;
  const first = (bodyText ?? "").split("\n")[0] ?? "";
  const run = first.match(LEADING_TAGS)?.[0];
  if (!run) return null;
  const last = run.trim().split(/\s+/).pop()?.replace(/^#/, "").replace(/[:：]$/, "") ?? "";
  if (!last || placeKey(last) === placeKey(district ?? "") || KNOWN_PLACES.has(placeKey(last))) return null;
  return last;
}

/**
 * A card heading in the desk's "<place>: <headline>" form, the place being cardPlace(district, town):
 * "#Chittorgarh #बेगूं: …" → "बेगूं: …", "#Sirohi: …" → "Sirohi: …".
 * - A leading tag run ending in ":" that starts with a place (a known one, the district or the town) is
 *   dropped; the place goes in front instead.
 * - Any other tag run (party, topic: "#Congress #Kota: …", "#BJP: …", "#ब्रेकिंग: …") is the story's own lead,
 *   kept by the server on purpose: it stays without its "#" signs and no place goes in front.
 * - A heading that already opens with its own place (any spelling) loses that word, never the prefix: "उदयपुर घूमने
 *   आई…" → "Udaipur: घूमने आई…" (D1); unless a postposition would then lead ("बूंदी के देई…"): then it is kept as it is.
 * - Idempotent: a place already in front (a known English place, the district, or the town as one word, as a
 *   saved card heading carries it) is replaced, never stacked; another lead already in front ("BJP: …", as
 *   such a heading is saved) keeps the heading as it is.
 * Hashtags later in the line stay. Never left blank by this.
 */
export function cardHeadlineText(headline: string, district?: string | null, town?: string | null, placeOverride?: string | null): string {
  const text = (headline ?? "").trim();
  // b9: the composer's decision (headingPlace.card) when the draft has one, so the card leads with line 1's place; null
  // there means nothing in front. Undefined: a draft from before b9, whose place is worked out from district and town.
  const place = placeOverride !== undefined ? (placeOverride ?? "").trim() : cardPlace(district, town);
  const isPlace = (word: string) => {
    const k = placeKey(word);
    return (
      KNOWN_PLACES.has(k) || KNOWN_TOWNS.has(placeMatchKey(word)) || (!!district && k === placeKey(district)) ||
      (!!town && placeMatchKey(word) === placeMatchKey(town)) || (!!place && placeMatchKey(word) === placeMatchKey(place))
    );
  };
  const run = text.match(LEADING_TAGS)?.[0];
  let bare = text;
  if (run) {
    const rest = text.slice(run.length).trim();
    if (!rest) return text;
    const first = run.trim().split(/\s+/)[0].replace(/^#/, "").replace(/[:：]$/, "");
    // The story's own lead ("#BJP: …"): its words stay, as text, and nothing goes in front
    const ownLead = `${run.replace(/#/g, "").replace(/\s*([:：])\s*$/, "$1").replace(/\s+/g, " ").trim()} ${rest}`;
    // R5 (owner, 23 Nov 2026): when line 1 leads with the composer's place before the desk's own run ("#Jaipur: #BJP: …"),
    // the card follows it: "Jaipur: BJP: …". Otherwise the story's own lead stays as text and nothing goes in front
    if (!isPlace(first)) return placeOverride ? `${place}: ${ownLead}` : ownLead;
    bare = rest;
  }
  if (!place) return bare;
  const lead = bare.match(LEADING_PLACE);
  const word = bare.match(ONE_WORD_LEAD);
  if (lead && isPlace(lead[1])) bare = bare.slice(lead[0].length).trim() || bare;
  else if (word && isPlace(word[1])) bare = bare.slice(word[0].length).trim() || bare;
  // A lead kept from a tag run and saved as text ("BJP: …", "ब्रेकिंग: …") still takes no place on reopening, unless the
  // composer's line 1 leads with its place (R5)
  else if (LEADING_LEAD.test(bare)) return placeOverride ? `${place}: ${bare}` : bare;
  // D1 (owner, 23 Nov 2026; the desk's own cards, 15–22 Nov): the card always leads with its place, and when the heading
  // already opens with that place the word goes, not the prefix ("उदयपुर घूमने आई…" → "Udaipur: घूमने आई…", "लाखेरी
  // पंचायत समिति…" → "लाखेरी: पंचायत समिति…"). Guard: if that leaves a postposition first ("बूंदी के देई…"), the word
  // stays and nothing goes in front. Spelling-tolerant ("बून्दी" is Bundi, "नैनवा" is नैनवां).
  const opening = openingPlaceLength(bare, [...namesOf(place), ...(placeKey(place) === placeKey(townTag(town)) ? [town ?? ""] : [])]);
  if (opening) {
    // R3: "जयपुर-दिल्ली हाईवे…": the word is part of a route, so it stays and nothing goes in front
    if (placeWordInCompound(bare, opening)) return bare;
    const rest = bare.slice(opening).replace(/^[\s,:：]+/u, "");
    if (!rest || cardKeepsPlaceWord(rest)) return bare;
    return `${place}: ${rest}`;
  }
  return `${place}: ${bare}`;
}

/** D1 guard: what follows the dropped place word opens with a postposition, so the word must stay */
export function cardKeepsPlaceWord(rest: string): boolean {
  return POSTPOSITION.test(rest.normalize("NFC").trim());
}

/**
 * The card's place as the composer decided it with line 1 (b9 headingPlace.card), or undefined to work it out from the
 * story's district and town as before: a draft from before b9, or one whose city is the desk's own tag in the copy.
 */
export function headingCardPlace(hp: HeadingPlace | null | undefined): string | null | undefined {
  if (!hp || hp.placement === "copy" || hp.placement === "none") return undefined;
  return hp.card;
}

/**
 * Q3 (owner, 23 Nov 2026): a card heading the desk saved is never rewritten. The draft's card_headline is the story's own
 * headline until someone saves the card; anything else there is what the desk saved, and it is shown exactly as saved.
 */
export function deskSavedHeading(saved: string | null | undefined, storyHeadline: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  return typeof storyHeadline === "string" && !!n(saved) && n(saved) !== n(storyHeadline);
}

/** The card heading for a draft: as the desk saved it (Q3), else line 1's place (b9), else its story's district and town */
export function draftCardHeadline(
  headline: string,
  d: { bodyText: string; story: { district?: string | null; town?: string | null; headline?: string | null }; handlePick?: { headingPlace?: HeadingPlace | null } | null },
): string {
  if (deskSavedHeading(headline, d.story.headline)) return headline.trim();
  return cardHeadlineText(headline, d.story.district, storyTown(d.story.town, d.bodyText, d.story.district), headingCardPlace(d.handlePick?.headingPlace));
}

/** The card heading for a queue row */
export function queueCardHeadline(item: Pick<QueueItem, "headline" | "bodyText" | "district" | "town" | "headingPlace">): string {
  return cardHeadlineText(item.headline, item.district, storyTown(item.town, item.bodyText, item.district), headingCardPlace(item.headingPlace));
}

/** A point without its closing punctuation, as the post joins them (core breaking/compose.ts trimPoint) */
const trimPoint = (p: string) => p.normalize("NFC").replace(/[\s।॥|.,;:!-]+$/u, "").replace(/\s+/g, " ").trim();
/** A point that trails off on purpose ("...", "…") keeps its dots */
const TRAILS_OFF = /(?:\.\.\.|…)$/u;
/**
 * Dots a reporter used to join or skip text, at the start or in the middle of a point ("समिति, ...और त्रिनिदाद"):
 * two or more dots, or "…", with a word right after. They never go on the card; the words around them stay.
 */
const INNER_DOTS = /\s*(?:\.{2,}|…)\s*(?=[\p{L}\p{N}])/gu;

/**
 * The story text on a desk-template card: one paragraph, the points joined with ", " as the desk's posts
 * join them (each point's closing punctuation dropped first), all of them, never cut. A point that ends in
 * "..." or "…" keeps its dots and the next one follows after a space; dots at the start or in the middle of a
 * point ("...और") are dropped. Takes the points, or the story body
 * with one point per line; a body that is already one paragraph comes back the same.
 */
export function cardBodyText(points: string | readonly string[]): string {
  const list = typeof points === "string" ? points.split(/\r?\n+/) : points;
  let out = "";
  let trailed = false;
  for (const raw of list) {
    const clean = (raw ?? "").normalize("NFC").replace(INNER_DOTS, " ").replace(/\s+/g, " ").trim();
    const keepDots = TRAILS_OFF.test(clean);
    const point = keepDots ? clean : trimPoint(clean);
    if (!point) continue;
    out = out ? `${out}${trailed ? " " : ", "}${point}` : point;
    trailed = keepDots;
  }
  return out;
}

/**
 * The story text for a card drawn from a queue row, as cardBodyText makes it: from the story's own points
 * (`storyBody`). Older servers don't send it: then the post's body without its "#Place #Town: headline" first
 * line, which is the points already joined (and maybe cut with "..." to fit the post).
 */
export function queueCardBody(item: Pick<QueueItem, "bodyText" | "storyBody">): string {
  if (typeof item.storyBody === "string") return cardBodyText(item.storyBody);
  const lines = (item.bodyText ?? "").split("\n");
  if (lines.length > 1 && isTaggedHeadLine(lines[0])) lines.shift();
  return cardBodyText(lines);
}

/** "#Place #Town: headline", the first line of a breaking post */
function isTaggedHeadLine(line: string): boolean {
  const tags = line.match(LEADING_TAGS)?.[0];
  if (!tags) return false;
  return /[:：]\s*$/u.test(tags) || LEADING_COLON.test(line.slice(tags.length));
}
