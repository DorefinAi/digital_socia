import { FtpNewsItem, SocialPlatform } from "@/types/newsroom";
import { AREA_HASHTAGS, PEOPLE_HANDLES } from "@/data/ftpNewsData";

export const PLATFORM_LIMITS: Record<SocialPlatform, { text: number; hashtags: number; mentions: number }> = {
  "X (Twitter)": { text: 280, hashtags: 6, mentions: 10 },
  Instagram: { text: 2200, hashtags: 30, mentions: 20 },
};

// X counts most Latin and Indic scripts as 1 and everything else (emoji, CJK) as 2.
const isSingleWeight = (cp: number) =>
  cp <= 4351 || (cp >= 8192 && cp <= 8205) || (cp >= 8208 && cp <= 8223) || (cp >= 8242 && cp <= 8247);

export function countChars(text: string, platform: SocialPlatform): number {
  if (platform === "Instagram") return text.length;
  let total = 0;
  for (const ch of text.normalize("NFC")) {
    total += isSingleWeight(ch.codePointAt(0) ?? 0) ? 1 : 2;
  }
  return total;
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
}

export function suggestHashtags(item: FtpNewsItem): TagSuggestion[] {
  const area = (AREA_HASHTAGS[item.area] ?? []).map((value) => ({ value, reason: `Area: ${item.area}` }));
  return [
    { value: item.tag === "big_breaking" ? "#BigBreaking" : "#BreakingNews", reason: "FTP tag" },
    ...area,
    { value: "#Rajasthan", reason: "State" },
    { value: "#FirstIndiaNews", reason: "Channel" },
  ];
}

export function suggestMentions(item: FtpNewsItem, platform: SocialPlatform): TagSuggestion[] {
  return item.people
    .filter((name) => PEOPLE_HANDLES[name])
    .map((name) => ({
      value: platform === "Instagram" ? PEOPLE_HANDLES[name].instagram : PEOPLE_HANDLES[name].x,
      reason: name,
    }));
}

/** Accepts "tag", "#tag" or "@handle" typed by the editor and normalises it. */
export function normaliseTag(raw: string, prefix: "#" | "@"): string {
  const body = raw.trim().replace(/^[#@]+/, "").replace(/[^\p{L}\p{M}\p{N}_.]/gu, "");
  return body ? `${prefix}${body}` : "";
}
