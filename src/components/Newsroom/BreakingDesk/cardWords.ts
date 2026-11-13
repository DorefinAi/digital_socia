// The words a card is drawn with come from the story (its headline and its points), never from the X post:
// the heading, then the points as one paragraph (cardBodyText).
// The post starts with place hashtags ("#Jodhpur #रावतभाटा: <headline>"); the card heading starts with the last
// of them without its "#" ("रावतभाटा: <headline>"): the town in Hindi, else the district's English name.

import type { QueueItem } from "@/lib/socia/types";

/** A run of leading hashtags that ends in ":" ("#Jodhpur #रावतभाटा: "); "#1 priority: …" is left alone */
const LEADING_TAGS = /^\s*(?:#[^\s:：]+\s*)+[:：]\s*/u;
const LEADING_COLON = /^[:：]\s*/u;
/** "Jaipur: " or "Sawai Madhopur : " at the start: 1-3 Latin words (hyphens allowed) and a colon */
/** Any short lead before a colon, in any script: "BJP: ", "Congress Kota: ", "ब्रेकिंग: " */
const LEADING_LEAD = /^\s*[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}_-]*(?:\s+[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}_-]*){0,2}\s*[:：]\s+/u;
const LEADING_PLACE = /^\s*([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,2})\s*[:：]\s*/;

/**
 * Places the server may give as stories.district (backend packages/core rajasthan.ts and the national places
 * in breaking/places.ts), compared without case, spaces or hyphens. A card headline saved with one of them
 * in front ("Jaipur: …") gets it replaced, never stacked ("Ajmer: Jaipur: …"), when the district changes.
 */
const KNOWN_PLACES = new Set(
  [
    "Ajmer", "Alwar", "Balotra", "Banswara", "Baran", "Barmer", "Beawar", "Bharatpur", "Bhilwara", "Bikaner", "Bundi",
    "Chittorgarh", "Churu", "Dausa", "Deeg", "Dholpur", "Didwana-Kuchaman", "Dungarpur", "Hanumangarh", "Jaipur",
    "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Khairthal-Tijara", "Kota", "Kotputli-Behror",
    "Nagaur", "Pali", "Phalodi", "Pratapgarh", "Rajsamand", "Salumbar", "Sawai Madhopur", "Sikar", "Sirohi",
    "Sri Ganganagar", "Tonk", "Udaipur",
    "Delhi", "Lucknow", "Varanasi", "Mumbai", "Kolkata", "Patna", "Bhopal", "Indore", "Chandigarh", "Ahmedabad",
    "Gandhinagar", "Noida", "Gurugram", "Agra", "Prayagraj", "Ayodhya", "Hyderabad", "Bengaluru", "Chennai", "Srinagar",
    "Jammu", "Dehradun", "Shimla", "Ranchi", "Mathura", "Bihar", "Uttar Pradesh", "Madhya Pradesh", "Punjab", "Haryana",
    "Gujarat", "Maharashtra", "West Bengal", "Karnataka", "Jammu Kashmir", "Uttarakhand", "Himachal Pradesh", "Kerala",
    "Tamil Nadu", "Assam", "Odisha", "Jharkhand", "Chhattisgarh", "Telangana", "Andhra Pradesh", "Pakistan", "China",
    "Nepal", "Bangladesh", "USA", "Russia", "Ukraine", "Israel", "Iran", "Afghanistan",
  ].map((p) => placeKey(p)),
);

function placeKey(place: string): string {
  return place.toLowerCase().replace(/[\s-]+/g, "");
}

/**
 * Rajasthan's districts' other spellings (backend packages/core rajasthan.ts: `hi` and every alias, Hindi and
 * English), keyed by placeKey of the English name, so a heading that already opens with its district in any of
 * them is recognised.
 */
const DISTRICT_NAMES = new Map<string, readonly string[]>(
  ([
    ["Ajmer", ["अजमेर"]],
    ["Alwar", ["अलवर"]],
    ["Balotra", ["बालोतरा"]],
    ["Banswara", ["बांसवाड़ा", "बांसवाडा"]],
    ["Baran", ["बारां"]],
    ["Barmer", ["बाड़मेर", "बाडमेर"]],
    ["Beawar", ["ब्यावर"]],
    ["Bharatpur", ["भरतपुर"]],
    ["Bhilwara", ["भीलवाड़ा", "भीलवाडा"]],
    ["Bikaner", ["बीकानेर"]],
    ["Bundi", ["बूंदी", "बूँदी"]],
    ["Chittorgarh", ["चित्तौड़गढ़", "Chittaurgarh", "Chittor", "चित्तौड़"]],
    ["Churu", ["चूरू"]],
    ["Dausa", ["दौसा"]],
    ["Deeg", ["डीग"]],
    ["Dholpur", ["धौलपुर"]],
    ["Didwana-Kuchaman", ["डीडवाना-कुचामन", "Didwana", "Kuchaman", "डीडवाना", "कुचामन"]],
    ["Dungarpur", ["डूंगरपुर"]],
    ["Hanumangarh", ["हनुमानगढ़"]],
    ["Jaipur", ["जयपुर"]],
    ["Jaisalmer", ["जैसलमेर"]],
    ["Jalore", ["जालोर", "Jalor", "जालौर"]],
    ["Jhalawar", ["झालावाड़", "झालावाड"]],
    ["Jhunjhunu", ["झुंझुनूं", "Jhunjhunun", "झुंझुनू"]],
    ["Jodhpur", ["जोधपुर"]],
    ["Karauli", ["करौली"]],
    ["Khairthal-Tijara", ["खैरथल-तिजारा", "Khairthal", "Tijara", "खैरथल", "तिजारा"]],
    ["Kota", ["कोटा"]],
    ["Kotputli-Behror", ["कोटपूतली-बहरोड़", "Kotputli", "Behror", "कोटपूतली", "बहरोड़"]],
    ["Nagaur", ["नागौर"]],
    ["Pali", ["पाली"]],
    ["Phalodi", ["फलोदी"]],
    ["Pratapgarh", ["प्रतापगढ़"]],
    ["Rajsamand", ["राजसमंद"]],
    ["Salumbar", ["सलूंबर", "Salumber", "सलूम्बर"]],
    ["Sawai Madhopur", ["सवाई माधोपुर"]],
    ["Sikar", ["सीकर"]],
    ["Sirohi", ["सिरोही"]],
    ["Sri Ganganagar", ["श्रीगंगानगर", "Ganganagar", "Shri Ganganagar", "गंगानगर"]],
    ["Tonk", ["टोंक"]],
    ["Udaipur", ["उदयपुर"]],
  ] as const).map(([en, hi]) => [placeKey(en), hi]),
);

/**
 * True when the heading opens with one of `names` as a word of its own ("अलवर के हल्दीना गांव में…",
 * "जयपुर रेंज IG…"): the place is already the heading's first word, so the desk sets no "Place:" in front.
 */
function opensWithPlace(text: string, names: readonly string[]): boolean {
  const t = text.normalize("NFC").toLowerCase();
  return names.some((n) => {
    const name = n.normalize("NFC").trim().toLowerCase();
    if (!name || !t.startsWith(name)) return false;
    const next = t.slice(name.length);
    return next === "" || /^[^\p{L}\p{M}\p{N}_]/u.test(next);
  });
}

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
  return townTag(town) || (district ?? "").trim();
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
 * - A heading that already opens with its own place as a word (the district in English or Hindi, or the town:
 *   "अलवर के हल्दीना गांव में…") gets nothing in front, so the place is never said twice.
 * - Idempotent: a place already in front (a known English place, the district, or the town as one word, as a
 *   saved card heading carries it) is replaced, never stacked; another lead already in front ("BJP: …", as
 *   such a heading is saved) keeps the heading as it is.
 * Hashtags later in the line stay. Never left blank by this.
 */
export function cardHeadlineText(headline: string, district?: string | null, town?: string | null): string {
  const text = (headline ?? "").trim();
  const place = cardPlace(district, town);
  const isPlace = (word: string) => {
    const k = placeKey(word);
    return KNOWN_PLACES.has(k) || (!!district && k === placeKey(district)) || (!!town && k === placeKey(townTag(town)));
  };
  const run = text.match(LEADING_TAGS)?.[0];
  let bare = text;
  if (run) {
    const rest = text.slice(run.length).trim();
    if (!rest) return text;
    const first = run.trim().split(/\s+/)[0].replace(/^#/, "").replace(/[:：]$/, "");
    // The story's own lead ("#BJP: …"): its words stay, as text, and nothing goes in front
    if (!isPlace(first)) return `${run.replace(/#/g, "").replace(/\s*([:：])\s*$/, "$1").replace(/\s+/g, " ").trim()} ${rest}`;
    bare = rest;
  }
  if (!place) return bare;
  const lead = bare.match(LEADING_PLACE);
  const word = bare.match(ONE_WORD_LEAD);
  if (lead && isPlace(lead[1])) bare = bare.slice(lead[0].length).trim() || bare;
  else if (word && isPlace(word[1])) bare = bare.slice(word[0].length).trim() || bare;
  // A lead kept from a tag run and saved as text ("BJP: …", "ब्रेकिंग: …") still takes no place on reopening
  else if (LEADING_LEAD.test(bare)) return bare;
  // The heading already opens with its own place ("अलवर के हल्दीना…"): as the desk's posts, no "Alwar: " in front
  const own = [district ?? "", ...(DISTRICT_NAMES.get(placeKey(district ?? "")) ?? []), town ?? "", townTag(town)];
  if (opensWithPlace(bare, own)) return bare;
  return `${place}: ${bare}`;
}

/** The card heading for a draft: its story's district and town */
export function draftCardHeadline(headline: string, d: { bodyText: string; story: { district?: string | null; town?: string | null } }): string {
  return cardHeadlineText(headline, d.story.district, storyTown(d.story.town, d.bodyText, d.story.district));
}

/** The card heading for a queue row */
export function queueCardHeadline(item: Pick<QueueItem, "headline" | "bodyText" | "district" | "town">): string {
  return cardHeadlineText(item.headline, item.district, storyTown(item.town, item.bodyText, item.district));
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
