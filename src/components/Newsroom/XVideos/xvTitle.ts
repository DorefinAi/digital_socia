// Pure helpers for the X Videos desk: the title line ("<Hindi headline> | <Place> News"), the "Start with" prefix,
// the hashtag and handle block (#FINVideo always first, then the channel's brand tag), and the checks against X's
// video limits. No React here, so `node --test` runs them (xvTitle.test.ts). Imports stay relative for that reason.

import { X_LIMIT, countChars, cutAtWeight } from "../BreakingDesk/socialText";

/** Every video post carries this tag, first */
export const FIN_VIDEO_TAG = "#FINVideo";
export const RAJASTHAN_BRAND_TAG = "#RajasthanWithFirstIndia";
export const INDIA_BRAND_TAG = "#FirstIndiaNews";

/** The desk's standard video prefixes; a clip can add its own ("Jaipur Fire:") */
export const STANDARD_PREFIXES = ["VIDEO:", "Viral Video:"] as const;

/** X's limits for a video post (ordinary account): 2 min 20 s, 512 MB, MP4 or MOV */
export const X_VIDEO_LIMITS = { seconds: 140, bytes: 512 * 1024 * 1024, formats: ["mp4", "mov"] } as const;

/** "2:18" for 138 s; "1:02:05" past an hour */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** "00:42" for the transcript and player clock (minutes:seconds, both padded) */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "48 MB" */
export function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

// " | Rajasthan News" (or "| Jaipur News", "|India News") at the end of a line
const LABEL_TAIL = /\s*\|\s*([^|]*?\bNews)\s*$/u;

/** The channel label a title ends with ("Rajasthan News"), or null */
export function labelOf(line: string): string | null {
  return line.match(LABEL_TAIL)?.[1]?.trim() || null;
}

/** The title without its " | … News" ending */
export function stripLabel(line: string): string {
  return line.replace(LABEL_TAIL, "").trimEnd();
}

/** The title ending in " | <label>", replacing any label it had; null takes the label off */
export function applyLabel(line: string, label: string | null): string {
  const body = stripLabel(line).trim();
  return label ? `${body} | ${label}` : body;
}

/** The prefix a title starts with, out of `prefixes` (longest first, so "Viral Video:" beats "VIDEO:"), or null */
export function prefixOf(line: string, prefixes: readonly string[]): string | null {
  const t = line.trimStart().toLowerCase();
  return [...prefixes].sort((a, b) => b.length - a.length).find((p) => t.startsWith(p.toLowerCase())) ?? null;
}

/** The title starting with `prefix` (replacing any of `prefixes` it had); null takes the prefix off */
export function applyPrefix(line: string, prefix: string | null, prefixes: readonly string[]): string {
  const had = prefixOf(line, prefixes);
  const body = (had ? line.trimStart().slice(had.length) : line).trim();
  return prefix ? `${prefix} ${body}` : body;
}

/**
 * The title line as the desk writes it: "<prefix> <headline> | <label>", e.g.
 * "Jaipur Fire: अजमेर रोड पर भीषण आग | Jaipur News". The headline's own label or prefix is replaced, never doubled.
 */
export function buildTitle(headline: string, label: string | null, prefix: string | null = null, prefixes: readonly string[] = []): string {
  const all = prefix && !prefixes.includes(prefix) ? [...prefixes, prefix] : prefixes;
  return applyLabel(applyPrefix(headline.replace(/\s+/g, " ").trim(), prefix, all), label);
}

/**
 * The brand tag a channel label sets, as the composer does: "India News" is national (#FirstIndiaNews); any other
 * label ("Rajasthan News", "Jaipur News"…) is the Rajasthan channel; no label, no brand tag.
 */
export function brandTagFor(label: string | null): string | null {
  if (!label) return null;
  return /^india\s+news$/i.test(label.trim()) ? INDIA_BRAND_TAG : RAJASTHAN_BRAND_TAG;
}

const BRAND_TAGS = [RAJASTHAN_BRAND_TAG, INDIA_BRAND_TAG].map((t) => t.toLowerCase());

/** "#jaipur fire" → "#JaipurFire"-ish clean tag: one leading # / @, no spaces or punctuation X would cut at */
export function cleanTag(raw: string, prefix: "#" | "@"): string {
  const body = raw.normalize("NFC").trim().replace(/^[#@]+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "");
  return body ? `${prefix}${body}` : "";
}

/**
 * The tag line under the title: #FINVideo first, then the brand tag, then the other hashtags in order, then the
 * handles. Each tag once (any case); a second brand tag that disagrees with the label is dropped.
 */
export function assembleTagBlock(hashtags: readonly string[], mentions: readonly string[], brand: string | null): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (t: string) => {
    const k = t.toLowerCase();
    if (!t || t.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  add(FIN_VIDEO_TAG);
  if (brand) add(brand);
  for (const h of hashtags) {
    if (BRAND_TAGS.includes(h.toLowerCase()) && brand && h.toLowerCase() !== brand.toLowerCase()) continue;
    add(h);
  }
  for (const m of mentions) add(m);
  return out.join(" ");
}

/** The post exactly as it is copied: the title, a blank line, the tag block */
export function composeTweet(title: string, tagBlock: string): string {
  return [title.trim(), tagBlock.trim()].filter(Boolean).join("\n\n");
}

/** X's weighted length of the post */
export const tweetLength = (text: string) => countChars(text, "X (Twitter)");

/**
 * The title cut so the whole post fits in 280: the label is kept, the headline loses words from its end and gets
 * "…". Returns the title unchanged when it already fits.
 */
export function fitTitle(title: string, tagBlock: string, limit = X_LIMIT): string {
  if (tweetLength(composeTweet(title, tagBlock)) <= limit) return title;
  const label = labelOf(title);
  const tail = label ? ` | ${label}` : "";
  const room = limit - tweetLength(composeTweet(`…${tail}`, tagBlock));
  if (room <= 0) return title;
  const head = cutAtWeight(stripLabel(title), room);
  // Back to the last whole word, when there is one
  const cut = head.includes(" ") ? head.slice(0, head.lastIndexOf(" ")) : head;
  return `${cut.trimEnd()}…${tail}`;
}

export type ClipIssue =
  | { code: "too_long"; seconds: number; limit: number }
  | { code: "too_big"; bytes: number; limit: number }
  | { code: "format"; ext: string };

/** What stops a clip going up on X as it is: length (after the trim), size, format. Empty when it can go. */
export function checkClip(clip: { fileName: string; duration: number; size: number }, trim?: { start: number; end: number }): ClipIssue[] {
  const out: ClipIssue[] = [];
  const seconds = trim ? Math.max(0, trim.end - trim.start) : clip.duration;
  if (seconds > X_VIDEO_LIMITS.seconds) out.push({ code: "too_long", seconds, limit: X_VIDEO_LIMITS.seconds });
  // A trim cuts the size roughly in proportion
  const bytes = trim && clip.duration > 0 ? Math.round((clip.size * seconds) / clip.duration) : clip.size;
  if (bytes > X_VIDEO_LIMITS.bytes) out.push({ code: "too_big", bytes, limit: X_VIDEO_LIMITS.bytes });
  const ext = clip.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!(X_VIDEO_LIMITS.formats as readonly string[]).includes(ext)) out.push({ code: "format", ext });
  return out;
}

/** One issue in the desk's words: "3:42, over X's 2:20, trim" */
export function issueLabel(issue: ClipIssue): string {
  if (issue.code === "too_long") return `${fmtDuration(issue.seconds)}, over X's ${fmtDuration(issue.limit)}, trim`;
  if (issue.code === "too_big") return `${fmtSize(issue.bytes)}, over X's ${fmtSize(issue.limit)}`;
  return `.${issue.ext} file, X takes MP4 or MOV`;
}

/** The transcript line playing at `time`: the last line that started at or before it (-1 before the first) */
export function lineAt(lines: readonly { at: number }[], time: number): number {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].at <= time + 0.05) found = i;
    else break;
  }
  return found;
}
