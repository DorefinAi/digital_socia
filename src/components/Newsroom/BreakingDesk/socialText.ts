import { FtpNewsItem, HandleEntry, HashtagRule, SocialPlatform } from "@/types/newsroom";

export const PLATFORM_LIMITS: Record<SocialPlatform, { text: number; hashtags: number; mentions: number }> = {
  "X (Twitter)": { text: 280, hashtags: 6, mentions: 10 },
  Instagram: { text: 2200, hashtags: 30, mentions: 20 },
  // Facebook allows far longer posts; this keeps captions readable in the feed
  Facebook: { text: 5000, hashtags: 30, mentions: 50 },
};

/** X's post limit, in weighted characters */
export const X_LIMIT = 280;

// twitter-text v3: code points 0-4351 (Latin, Devanagari and the other Indic scripts), 8192-8205,
// 8208-8223 and 8242-8247 weigh 1; everything else (emoji, CJK) weighs 2. Counted per code point after
// NFC, so every matra and halant counts ("क्षेत्र" is 7).
const isSingleWeight = (cp: number) =>
  cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);

export function countChars(text: string, platform: SocialPlatform): number {
  if (platform !== "X (Twitter)") return text.length;
  let total = 0;
  for (const ch of text.normalize("NFC")) {
    total += isSingleWeight(ch.codePointAt(0) ?? 0) ? 1 : 2;
  }
  return total;
}

/** The longest start of `text` that weighs at most `max` on X (where the timeline puts "Show more"). */
export function cutAtWeight(text: string, max: number): string {
  let total = 0;
  let out = "";
  for (const ch of text.normalize("NFC")) {
    total += isSingleWeight(ch.codePointAt(0) ?? 0) ? 1 : 2;
    if (total > max) break;
    out += ch;
  }
  return out;
}

export function composePostText(text: string, mentions: string[], hashtags: string[]): string {
  const tail = [mentions.join(" "), hashtags.join(" ")].filter(Boolean).join("\n");
  return [text.trim(), tail].filter(Boolean).join("\n\n");
}

/** Trim text to `max` characters, preferring whole sentences, then whole words. */
export function shortenToFit(text: string, max: number, platform: SocialPlatform): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (max <= 0) return "";
  if (countChars(clean, platform) <= max) return clean;

  const sentences = clean.match(/[^।.!?]+[।.!?]*/g) ?? [clean];
  let out = "";
  for (const sentence of sentences) {
    if (countChars((out + sentence).trim(), platform) > max) break;
    out += sentence;
  }
  if (out.trim()) return out.trim();

  const words = clean.split(" ");
  out = "";
  for (const word of words) {
    const next = out ? `${out} ${word}` : word;
    if (countChars(`${next}…`, platform) > max) break;
    out = next;
  }
  return out ? `${out}…` : "";
}

export interface TagSuggestion {
  value: string;
  reason: string;
  /** Proposed by the model rather than the directory; never pre-accepted */
  ai?: boolean;
}

export function suggestHashtags(item: FtpNewsItem, rules: HashtagRule[]): TagSuggestion[] {
  const rule = rules.find((r) => r.area.toLowerCase() === item.area.toLowerCase());
  const area = (rule?.hashtags ?? []).map((value) => ({ value, reason: `Rule: ${item.area}` }));
  return [
    { value: item.tag === "big_breaking" ? "#BigBreaking" : "#BreakingNews", reason: "FTP tag" },
    ...area,
    { value: "#Rajasthan", reason: "State" },
    { value: "#FirstIndiaNews", reason: "Channel" },
  ];
}

/** Directory matches come first and are trusted; model suggestions follow and need a click to accept. */
export function suggestMentions(item: FtpNewsItem, platform: SocialPlatform, directory: HandleEntry[]): TagSuggestion[] {
  // Facebook tagging uses the same handles as Instagram until the directory carries Page names
  const pick = (h: { x: string; instagram: string }) => (platform === "X (Twitter)" ? h.x : h.instagram);
  const known = item.people.flatMap((name) => {
    const entry = directory.find((h) => h.entity.toLowerCase() === name.toLowerCase());
    return entry ? [{ value: pick(entry), reason: `Directory: ${name}` }] : [];
  });
  const ai = (item.aiMentions ?? [])
    .filter((m) => !known.some((k) => k.value.toLowerCase() === pick(m).toLowerCase()))
    .map((m) => ({ value: pick(m), reason: `AI ${Math.round(m.confidence * 100)}%: ${m.entity}`, ai: true }));
  return [...known, ...ai];
}

/** Returns the first link-looking piece of text, or null. X posts must not contain one. */
export function findUrl(text: string): string | null {
  const match = text.match(/\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|org|net|co|news|ly|io|me|tv)\b(?:\/\S*)?/i);
  return match ? match[0] : null;
}

/** Accepts "tag", "#tag" or "@handle" typed by the editor and normalises it. */
export function normaliseTag(raw: string, prefix: "#" | "@"): string {
  const body = raw.trim().replace(/^[#@]+/, "").replace(/[^\p{L}\p{M}\p{N}_.]/gu, "");
  return body ? `${prefix}${body}` : "";
}
