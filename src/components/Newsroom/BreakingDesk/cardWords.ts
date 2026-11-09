// The words a card is drawn with come from the story (its headline and its points), never from the X post.
// The post starts with place hashtags ("#Jodhpur #रावतभाटा: <headline>"); a card never does: it starts with the
// district's English name instead ("Jodhpur: <headline>"), never the town.

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
 * A card headline in the desk's "<District>: <headline>" form ("#Jaipur #डग: Fire" with district "Jaipur" →
 * "Jaipur: Fire"); no town is added.
 * - A leading tag run ending in ":" that starts with a place is dropped (the district replaces it).
 * - Any other tag run (party, topic: "#Congress #Kota: …", "#BJP: …", "#ब्रेकिंग: …") is the story's own lead,
 *   kept by the server on purpose: it stays without its "#" signs and no district goes in front
 *   ("Congress Kota: …").
 * - Idempotent: a known place already in front ("Jaipur: …", as a saved card headline carries it) is taken
 *   off first, so the district is not doubled and a changed one replaces it; a non-place lead already in front
 *   ("BJP: …", as such a headline is saved) keeps the headline as it is.
 * Hashtags later in the line stay. Never left blank by this.
 */
export function cardHeadlineText(headline: string, district?: string | null): string {
  const text = (headline ?? "").trim();
  const place = (district ?? "").trim();
  const run = text.match(LEADING_TAGS)?.[0];
  let bare = text;
  if (run) {
    const rest = text.slice(run.length).trim();
    if (!rest) return text;
    const first = run.trim().split(/\s+/)[0].replace(/^#/, "").replace(/[:：]$/, "");
    const placeRun = KNOWN_PLACES.has(placeKey(first)) || (!!place && placeKey(first) === placeKey(place));
    // The story's own lead ("#BJP: …"): its words stay, as text, and nothing goes in front
    if (!placeRun) return `${run.replace(/#/g, "").replace(/\s*([:：])\s*$/, "$1").replace(/\s+/g, " ").trim()} ${rest}`;
    bare = rest;
  }
  if (!place) return bare;
  const lead = bare.match(LEADING_PLACE);
  if (lead && (KNOWN_PLACES.has(placeKey(lead[1])) || placeKey(lead[1]) === placeKey(place))) bare = bare.slice(lead[0].length).trim() || bare;
  // A lead kept from a tag run and saved as text ("BJP: …", "ब्रेकिंग: …") still takes no district on reopening
  else if (LEADING_LEAD.test(bare)) return bare;
  return `${place}: ${bare}`;
}

/**
 * The story text for a card drawn from a queue row: the story's own points, one per line, when the queue
 * sends them (`storyBody`; older servers don't). Without it, the post's body without its "#Place #Town: headline"
 * first line: the points as the post joins them (commas, maybe cut with "..."), not split back into lines.
 */
export function queueCardBody(item: Pick<QueueItem, "bodyText" | "storyBody">): string {
  if (typeof item.storyBody === "string") return item.storyBody;
  const lines = (item.bodyText ?? "").split("\n");
  if (lines.length > 1 && isTaggedHeadLine(lines[0])) lines.shift();
  return lines.join("\n").trim();
}

/** "#Place #Town: headline", the first line of a breaking post */
function isTaggedHeadLine(line: string): boolean {
  const tags = line.match(LEADING_TAGS)?.[0];
  if (!tags) return false;
  return /[:：]\s*$/u.test(tags) || LEADING_COLON.test(line.slice(tags.length));
}
