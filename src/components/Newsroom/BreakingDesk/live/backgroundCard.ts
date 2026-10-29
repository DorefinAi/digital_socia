// Draws an X card on the operator's own background (contract: first-india-card-contract.md §2):
// today's date in the date slot, then inside the box the headline (bold) and the whole story body,
// centred, at one font size shrunk from fontMaxPx to fontMinPx until both fit. Pure canvas, no React.

import type { CardTemplateLayout, UserCardTemplate } from "@/lib/socia/types";
import { fontById } from "../templateFonts";

/** Mangal is the Hindi face the cards use; Noto Sans Devanagari stands in where Mangal is not installed. */
const family = () => `Mangal, ${fontById("noto").family}, "Nirmala UI", sans-serif`;
const LINE_HEIGHT = 1.4;
/** Space between the headline and the body, in lines */
const GAP = 0.45;

export interface DrawnCard {
  blob: Blob;
  /** Object URL of `blob`; revoke it when the card is replaced */
  url: string;
  width: number;
  height: number;
  fontPx: number;
  /** True when even the smallest size could not fit the whole body, so its end was cut */
  cut: boolean;
}

/** Today in India, in the layout's date format ("Date:DD/MM/YYYY" → "Date:28/10/2026"). */
export function istDate(format: string, now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return format.replace("YYYY", parts.year).replace("MM", parts.month).replace("DD", parts.day);
}

const NOT_LOADED = "Your X background didn't load. Check the Templates tab, or try again.";

/**
 * Loads the background with the session cookie (fetch, credentials included) and decodes it from a local
 * blob URL. Works through the /socia-api proxy and against the API directly, and a blob URL never taints
 * the canvas, so the card can always be exported.
 */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  let blob: Blob;
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    blob = await res.blob();
  } catch {
    throw new Error(NOT_LOADED);
  }
  const local = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(NOT_LOADED));
      image.src = local;
    });
  } finally {
    // A decoded image keeps drawing after its URL is released
    URL.revokeObjectURL(local);
  }
}

/** Waits for the Hindi faces so the first draw is not measured on a fallback font. */
export async function fontsReady() {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = "क ख A 1";
  await Promise.all([
    document.fonts.load(`700 40px ${family()}`, sample),
    document.fonts.load(`400 40px ${family()}`, sample),
  ]).catch(() => undefined);
  await document.fonts.ready;
}

const graphemes = (text: string): string[] =>
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? Array.from(new Intl.Segmenter("hi", { granularity: "grapheme" }).segment(text), (s) => s.segment)
    : Array.from(text);

/** Wraps by words; a word wider than the line is split between letters (never inside a Devanagari letter). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }
      let piece = "";
      for (const g of graphemes(word)) {
        if (piece && ctx.measureText(piece + g).width > maxWidth) {
          lines.push(piece);
          piece = "";
        }
        piece += g;
      }
      line = piece;
    }
    if (line) lines.push(line);
  }
  return lines;
}

interface Fitted {
  size: number;
  headline: string[];
  body: string[];
  height: number;
  cut: boolean;
}

const ELLIPSIS = "…";

/** The line shortened (by whole letters) until it fits `maxWidth` with "…" on the end. Uses the current ctx.font. */
function withEllipsis(ctx: CanvasRenderingContext2D, line: string, maxWidth: number): string {
  let letters = graphemes(line.replace(/[\s.।,]+$/, ""));
  while (letters.length && ctx.measureText(letters.join("") + ELLIPSIS).width > maxWidth) letters = letters.slice(0, -1);
  return `${letters.join("").replace(/[\s.।,]+$/, "")}${ELLIPSIS}`;
}

function fitText(ctx: CanvasRenderingContext2D, headline: string, body: string, layout: CardTemplateLayout, boxW: number, boxH: number): Fitted {
  const max = Math.max(6, layout.fontMinPx, layout.fontMaxPx);
  const min = Math.max(6, Math.min(layout.fontMinPx, layout.fontMaxPx));
  const measure = (size: number) => {
    ctx.font = `700 ${size}px ${family()}`;
    const h = wrap(ctx, headline, boxW);
    ctx.font = `400 ${size}px ${family()}`;
    const b = wrap(ctx, body, boxW);
    const lines = h.length + b.length + (h.length && b.length ? GAP : 0);
    return { size, headline: h, body: b, height: lines * size * LINE_HEIGHT, cut: false };
  };
  // Largest whole size that fits, by halving the range (a handful of wraps instead of one per pixel)
  const top = measure(max);
  if (top.height <= boxH) return top;
  let lo = min;
  let hi = max - 1;
  let best: Fitted | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const f = measure(mid);
    if (f.height <= boxH) {
      best = f;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (best) return best;

  // Even the smallest size is too tall: keep as much as fits, headline first, and end on "…"
  const f = measure(min);
  const lineH = min * LINE_HEIGHT;
  const rows = Math.max(1, Math.floor(boxH / lineH + 1e-6));
  if (f.headline.length >= rows) {
    // The headline alone fills the box: cut it, and the body goes
    const kept = f.headline.slice(0, rows);
    ctx.font = `700 ${min}px ${family()}`;
    kept[kept.length - 1] = withEllipsis(ctx, kept[kept.length - 1], boxW);
    return { ...f, headline: kept, body: [], height: kept.length * lineH, cut: true };
  }
  const room = Math.floor((boxH - (f.headline.length + (f.headline.length ? GAP : 0)) * lineH) / lineH + 1e-6);
  const kept = f.body.slice(0, Math.max(0, room));
  if (kept.length) {
    ctx.font = `400 ${min}px ${family()}`;
    kept[kept.length - 1] = withEllipsis(ctx, kept[kept.length - 1], boxW);
  }
  const lines = f.headline.length + kept.length + (f.headline.length && kept.length ? GAP : 0);
  return { ...f, body: kept, height: lines * lineH, cut: true };
}

type Encoded = { blob: Blob } | { error: "tainted" | "failed" | "too_big" };

function toBlob(canvas: HTMLCanvasElement): Promise<Encoded> {
  return new Promise((resolve) => {
    try {
      // null here means the browser could not encode it (too large for memory, or out of memory)
      canvas.toBlob((blob) => resolve(blob ? { blob } : { error: "failed" }), "image/png");
    } catch {
      // A tainted canvas (background from another origin) refuses to export
      resolve({ error: "tainted" });
    }
  });
}

/** X takes card images up to 5 MB; a busy photo background is stepped down until it fits. */
async function encode(canvas: HTMLCanvasElement, maxBytes: number): Promise<Encoded> {
  let last: Encoded = { error: "too_big" };
  for (const scale of [1, 0.8, 0.65, 0.5]) {
    let source = canvas;
    if (scale < 1) {
      source = document.createElement("canvas");
      source.width = Math.round(canvas.width * scale);
      source.height = Math.round(canvas.height * scale);
      source.getContext("2d")?.drawImage(canvas, 0, 0, source.width, source.height);
    }
    const out = await toBlob(source);
    if ("error" in out) {
      // Tainted stays tainted; a failed encode may still work smaller
      if (out.error === "tainted") return out;
      last = out;
      continue;
    }
    if (out.blob.size <= maxBytes) return out;
    last = { error: "too_big" };
  }
  return last;
}

const ENCODE_ERRORS: Record<"tainted" | "failed" | "too_big", string> = {
  tainted: "The browser couldn't export the card from your background. Replace the background in Templates, or design the card here instead.",
  failed: "The browser ran out of memory making the card image. Close other tabs and try again, or use a smaller background in Templates.",
  too_big: "The card is over 5 MB even at half size. Use a simpler or smaller background in Templates, or design the card here instead.",
};

export interface CardWords {
  headline: string;
  body: string;
  /** Defaults to now */
  date?: Date;
}

/**
 * Paints the words onto a background already drawn at W × H: the date in its slot, then the headline and
 * body in the box. Synchronous, so the Templates tab can repaint its sample on every drag frame.
 */
export function paintCardText(ctx: CanvasRenderingContext2D, layout: CardTemplateLayout, words: CardWords, W: number, H: number): { fontPx: number; cut: boolean } {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Date: one line, as large as the slot allows
  const d = layout.date;
  const dateText = istDate(d.format, words.date);
  const slotW = d.w * W;
  const slotH = d.h * H;
  let dateSize = Math.floor(slotH * 0.72);
  ctx.font = `700 ${dateSize}px ${family()}`;
  while (dateSize > 8 && ctx.measureText(dateText).width > slotW * 0.94) {
    dateSize -= 1;
    ctx.font = `700 ${dateSize}px ${family()}`;
  }
  ctx.fillStyle = d.color;
  ctx.fillText(dateText, d.x * W + slotW / 2, d.y * H + slotH / 2);

  // Box: headline then body, centred, one size for both
  const b = layout.box;
  const padX = b.w * W * 0.04;
  const padY = b.h * H * 0.04;
  const boxW = b.w * W - padX * 2;
  const boxH = b.h * H - padY * 2;
  const headline = words.headline.replace(/\*\*/g, "").trim();
  const body = words.body.trim();
  const fit = fitText(ctx, headline, body, layout, boxW, boxH);
  const lineH = fit.size * LINE_HEIGHT;
  const cx = b.x * W + (b.w * W) / 2;
  let y = b.y * H + padY + (boxH - fit.height) / 2 + lineH / 2;
  ctx.font = `700 ${fit.size}px ${family()}`;
  ctx.fillStyle = layout.headline.color;
  for (const line of fit.headline) {
    ctx.fillText(line, cx, y);
    y += lineH;
  }
  if (fit.headline.length && fit.body.length) y += GAP * lineH;
  ctx.font = `400 ${fit.size}px ${family()}`;
  ctx.fillStyle = layout.body.color;
  for (const line of fit.body) {
    ctx.fillText(line, cx, y);
    y += lineH;
  }
  return { fontPx: fit.size, cut: fit.cut };
}

/** Draws the card at the background's own size and returns it as a PNG ready to upload. */
export async function drawBackgroundCard(template: UserCardTemplate, backgroundUrl: string, words: CardWords, maxBytes: number): Promise<DrawnCard> {
  const [image] = await Promise.all([loadImage(backgroundUrl), fontsReady()]);
  const W = image.naturalWidth || template.width;
  const H = image.naturalHeight || template.height;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw cards.");
  ctx.drawImage(image, 0, 0, W, H);
  const fit = paintCardText(ctx, template.layout, words, W, H);

  const out = await encode(canvas, maxBytes);
  if ("error" in out) throw new Error(ENCODE_ERRORS[out.error]);
  const { blob } = out;
  return { blob, url: URL.createObjectURL(blob), width: W, height: H, fontPx: fit.fontPx, cut: fit.cut };
}
