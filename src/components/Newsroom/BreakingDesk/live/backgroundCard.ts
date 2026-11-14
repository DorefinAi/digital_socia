// Draws an X card on the operator's own background (contract: first-india-card-contract.md §2):
// today's date in the date slot, then inside the box the headline (bold) and the whole story body as one
// block, each line centred across the box and the block centred up and down in it (cardFit), at one font
// size shrunk from fontMaxPx to fontMinPx until both fit. Pure canvas, no React.

import type { DrawableCardTemplate, OrgCardTemplateLayout } from "@/lib/socia/types";
import { MARDOTO_FAMILY } from "../templateFonts";
import { CARD_FACE_SAMPLE } from "../cardFace";
import { cardBodyText } from "../cardWords";
import { CARD_GAP_LINES, CARD_LINE, type PxRect, cardBlockTop, cardTextArea, largestFit } from "./cardFit";
import { fitDate } from "./cardDate";
import { cardJpeg, fitCard } from "./cardImage";
import { isTainted } from "./rgbPng";

/**
 * Mardoto Bold is the cards' face (globals.css "SociaMardoto"); it has no Hindi letters, so those come from
 * Noto Sans Devanagari Bold ("SociaNotoDevanagari", bundled), as on the desk's posted cards (cardFace.ts).
 */
const family = () => `${MARDOTO_FAMILY}, "Nirmala UI", sans-serif`;
// Line pitch and the gap are cardFit's, shared with the editor's card (orgCanvas.ts)
const LINE_HEIGHT = CARD_LINE;
const GAP = CARD_GAP_LINES;

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

const NOT_LOADED = "Your X background didn't load. Check Post Studio → Templates, or try again.";

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

/** The date tag's face (Mardoto Bold), at `px` */
const dateFont = (px: number) => `700 ${px}px ${MARDOTO_FAMILY}`;

/**
 * Waits for Mardoto, the Hindi face (the sample has Hindi letters, so the Noto file is fetched) and the date's
 * face, so the first draw is not measured on a fallback font.
 */
export async function fontsReady() {
  if (typeof document === "undefined" || !document.fonts) return;
  const sample = CARD_FACE_SAMPLE;
  await Promise.all([
    document.fonts.load(`700 40px ${family()}`, sample),
    document.fonts.load(`400 40px ${family()}`, sample),
    document.fonts.load(dateFont(40), "Date:0123456789/"),
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
    // Widths add up word by word, as cardRender.ts lays out the editor's card, so both break lines alike
    const space = ctx.measureText(" ").width;
    let line = "";
    let lineW = 0;
    for (const word of words) {
      const w = ctx.measureText(word).width;
      const nextW = line ? lineW + space + w : w;
      if (nextW <= maxWidth) {
        line = line ? `${line} ${word}` : word;
        lineW = nextW;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      lineW = 0;
      if (w <= maxWidth) {
        line = word;
        lineW = w;
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
      lineW = ctx.measureText(piece).width;
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

/** `box` is the template's box in card px; the words wrap in its column and may hang over it (cardFit.cardTextArea) */
function fitText(ctx: CanvasRenderingContext2D, headline: string, body: string, layout: OrgCardTemplateLayout, box: PxRect): Fitted {
  const boxW = cardTextArea(box).w;
  const max = Math.max(6, layout.fontMinPx, layout.fontMaxPx);
  const min = Math.max(6, Math.min(layout.fontMinPx, layout.fontMaxPx));
  const measure = (size: number) => {
    ctx.font = `700 ${size}px ${family()}`;
    const h = wrap(ctx, headline, boxW);
    ctx.font = `700 ${size}px ${family()}`;
    const b = wrap(ctx, body, boxW);
    const lines = h.length + b.length + (h.length && b.length ? GAP : 0);
    return { size, headline: h, body: b, height: lines * size * LINE_HEIGHT, cut: false };
  };
  // The largest size that fits, in half pixels, exactly as the editor's card (cardFit.largestFit)
  const size = largestFit(min, max, (px) => cardTextArea(box, px).h, (px) => measure(px).height);
  const best = size === null ? null : measure(size);
  if (best) return best;

  // Even the smallest size is too tall: keep as much as fits, headline first, and end on "…"
  const f = measure(min);
  const boxH = cardTextArea(box, min).h;
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
    ctx.font = `700 ${min}px ${family()}`;
    kept[kept.length - 1] = withEllipsis(ctx, kept[kept.length - 1], boxW);
  }
  const lines = f.headline.length + kept.length + (f.headline.length && kept.length ? GAP : 0);
  return { ...f, body: kept, height: lines * lineH, cut: true };
}

/** X takes card images up to 5 MB; a busy photo background is stepped down until it fits. JPEG (cardImage.ts). */
async function encode(canvas: HTMLCanvasElement, maxBytes: number) {
  return fitCard((scale) => cardJpeg(canvas, scale), maxBytes, isTainted);
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
 * Paints the words onto a background already drawn at W × H: the date in its slot (none when the layout
 * has `date: null`), then the headline and body in the box. Synchronous, so the Templates tab can repaint
 * its sample on every drag frame.
 */
export function paintCardText(ctx: CanvasRenderingContext2D, layout: OrgCardTemplateLayout, words: CardWords, W: number, H: number): { fontPx: number; cut: boolean } {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Date: Mardoto Bold in its tag, sized and placed by cardDate.fitDate, as orgCanvas places the editor's date
  const d = layout.date;
  if (d) {
    const dateText = istDate(d.format, words.date);
    const at = fitDate(ctx, dateText, { x: d.x * W, y: d.y * H, w: d.w * W, h: d.h * H }, dateFont);
    ctx.font = dateFont(at.size);
    ctx.fillStyle = d.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(dateText, at.originX, at.baseline);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  // Box: headline then body as one block, centred across and up and down in the text area (cardFit), one size for both
  const b = layout.box;
  const box = { x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H };
  const headline = words.headline.replace(/\*\*/g, "").trim();
  // The points as one paragraph, as on the editor's card and the desk's posts
  const body = cardBodyText(words.body);
  const fit = fitText(ctx, headline, body, layout, box);
  const area = cardTextArea(box, fit.size);
  const lineH = fit.size * LINE_HEIGHT;
  const cx = area.x + area.w / 2;
  let y = cardBlockTop(area, fit.height) + lineH / 2;
  ctx.font = `700 ${fit.size}px ${family()}`;
  ctx.fillStyle = layout.headline.color;
  for (const line of fit.headline) {
    ctx.fillText(line, cx, y);
    y += lineH;
  }
  if (fit.headline.length && fit.body.length) y += GAP * lineH;
  ctx.font = `700 ${fit.size}px ${family()}`;
  ctx.fillStyle = layout.body.color;
  for (const line of fit.body) {
    ctx.fillText(line, cx, y);
    y += lineH;
  }
  return { fontPx: fit.size, cut: fit.cut };
}

/**
 * Draws the card at the template's own size (the background's, when the template gives none) and returns
 * it as a JPEG (no alpha channel; cardImage.ts) ready to upload.
 */
export async function drawBackgroundCard(template: DrawableCardTemplate, backgroundUrl: string, words: CardWords, maxBytes: number): Promise<DrawnCard> {
  const [image] = await Promise.all([loadImage(backgroundUrl), fontsReady()]);
  const W = template.width > 0 ? template.width : image.naturalWidth;
  const H = template.height > 0 ? template.height : image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  // Opaque: the card goes out as RGB, never with an alpha channel
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser can't draw cards.");
  ctx.drawImage(image, 0, 0, W, H);
  const fit = paintCardText(ctx, template.layout, words, W, H);

  const out = await encode(canvas, maxBytes);
  if ("error" in out) throw new Error(ENCODE_ERRORS[out.error]);
  const { blob } = out;
  return { blob, url: URL.createObjectURL(blob), width: W, height: H, fontPx: fit.fontPx, cut: fit.cut };
}
