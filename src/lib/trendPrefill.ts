// A trend handed from the Web Scraper to a platform's editor, for platforms without a Socia backend yet.
// It travels in the URL as ?prefill=<base64url JSON>, so the target page can open its editor on it after a reload too.

export interface TrendPrefill {
  headline: string;
  /** "Why trending": the matching headlines */
  text: string;
  district: string;
  /** Link to the source article or search */
  source: string;
}

export const PREFILL_PARAM = "prefill";

/** The whole ?prefill= value stays under this many characters; the text is shortened to fit. */
const MAX_PARAM = 2000;

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Cuts at a word boundary and marks the cut. */
function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - 1));
  const space = cut.lastIndexOf(" ");
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`;
}

/** The ?prefill= value for a trend, shortened so the URL stays small (Devanagari text is 3 bytes a letter). */
export function encodePrefill(p: TrendPrefill): string {
  // Short keys keep the payload small; readPrefill takes both
  const pack = (q: TrendPrefill) => toBase64Url(JSON.stringify({ h: q.headline, t: q.text, d: q.district, s: q.source }));
  let q: TrendPrefill = { ...p, source: p.source.length > 500 ? "" : p.source };
  let out = pack(q);
  // Shrink the longest free text first: the why-trending lines, then the headline
  for (let i = 0; out.length > MAX_PARAM && i < 12; i++) {
    const ratio = MAX_PARAM / out.length;
    if (q.text.length > 40) q = { ...q, text: shorten(q.text, Math.floor(q.text.length * ratio * 0.95)) };
    else q = { ...q, text: "", headline: shorten(q.headline, Math.floor(q.headline.length * ratio * 0.95)) };
    out = pack(q);
  }
  return out;
}

export function prefillHref(path: string, p: TrendPrefill): string {
  return `${path}?${PREFILL_PARAM}=${encodePrefill(p)}`;
}

/** The prefill in these search params, or null when there is none or it is not ours. */
export function readPrefill(params: { get: (name: string) => string | null }): TrendPrefill | null {
  const raw = params.get(PREFILL_PARAM);
  if (!raw) return null;
  try {
    // Older links carried the JSON itself; newer ones carry it as base64url
    const json = raw.trimStart().startsWith("{") ? raw : fromBase64Url(raw);
    const v = JSON.parse(json) as Record<string, unknown>;
    const str = (...xs: unknown[]) => {
      const x = xs.find((y) => typeof y === "string");
      return typeof x === "string" ? x.slice(0, 2000) : "";
    };
    const p = { headline: str(v.h, v.headline), text: str(v.t, v.text), district: str(v.d, v.district), source: str(v.s, v.source) };
    // Only web links are shown as the source
    if (p.source && !/^https?:\/\//i.test(p.source)) p.source = "";
    return p.headline ? p : null;
  } catch {
    return null;
  }
}
