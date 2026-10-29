// Text clips and captions on the canvas: wrapping inside the box, alignment, outline, background.
// Layouts are measured once per clip/style/frame size (and again when fonts finish loading), so a
// steady frame does no measuring and builds no strings.

import type { CaptionClip, CaptionStyle, TextClip, TextStyle } from "../model";
import { fontStack, fontsVersion } from "./fonts";
import { wrapLines } from "./wrap";

export { wrapLines };

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface TextLayout {
  font: string;
  px: number;
  lineHeight: number;
  lines: string[];
  widths: number[];
  maxWidth: number;
}

interface Cached extends TextLayout {
  text: string;
  style: TextStyle;
  wrapWidth: number;
  H: number;
  version: number;
}

const cache = new WeakMap<TextClip | CaptionClip, Cached>();

/** Line height as a multiple of the size: Devanagari needs room for matras above and below */
export const LINE_HEIGHT = 1.38;

/** Px at the project height of 1080, scaled to the frame height H */
export function textPx(style: TextStyle, H: number): number {
  return Math.max(1, (style.size * H) / 1080);
}

export function fontString(style: TextStyle, px: number): string {
  return `${style.weight} ${Math.round(px * 100) / 100}px ${fontStack(style.font)}`;
}

/** Horizontal room a background leaves around the text */
const padX = (px: number) => px * 0.35;
const padY = (px: number) => px * 0.12;

function layout(ctx: Ctx, key: TextClip | CaptionClip, text: string, style: TextStyle, wrapWidth: number, H: number): TextLayout {
  const v = fontsVersion();
  const hit = cache.get(key);
  if (hit && hit.text === text && hit.style === style && hit.wrapWidth === wrapWidth && hit.H === H && hit.version === v) return hit;
  const px = textPx(style, H);
  const font = fontString(style, px);
  ctx.font = font;
  const measure = (s: string) => ctx.measureText(s).width;
  const lines = wrapLines(measure, text, Math.max(px, wrapWidth));
  const widths = lines.map(measure);
  const entry: Cached = { text, style, wrapWidth, H, version: v, font, px, lineHeight: px * LINE_HEIGHT, lines, widths, maxWidth: Math.max(0, ...widths) };
  cache.set(key, entry);
  return entry;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function strokeAndFill(ctx: Ctx, style: TextStyle, line: string, x: number, y: number, scale: number) {
  if (style.outlineColor && style.outlineWidth > 0) {
    ctx.strokeStyle = style.outlineColor;
    // The stroke straddles the outline, so twice the width shows the requested width outside the letters
    ctx.lineWidth = style.outlineWidth * scale * 2;
    ctx.strokeText(line, x, y);
  }
  ctx.fillStyle = style.color;
  ctx.fillText(line, x, y);
}

/**
 * Draw a text clip centred on (0, 0) of the current transform, inside a box boxW x boxH (frame px).
 * The text block is centred vertically in the box; a background is one rounded panel behind it.
 */
export function drawTextClip(ctx: Ctx, clip: TextClip, boxW: number, boxH: number, H: number): void {
  const style = clip.style;
  const px = textPx(style, H);
  const inset = style.background ? padX(px) : 0;
  const lay = layout(ctx, clip, clip.text, style, boxW - inset * 2, H);
  if (lay.lines.length === 0) return;
  const blockH = lay.lines.length * lay.lineHeight;
  const top = -blockH / 2;
  ctx.font = lay.font;
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  const ax = style.align === "left" ? -boxW / 2 + inset : style.align === "right" ? boxW / 2 - inset : 0;
  if (style.background) {
    const w = lay.maxWidth + inset * 2;
    const x = style.align === "left" ? -boxW / 2 : style.align === "right" ? boxW / 2 - w : -w / 2;
    ctx.fillStyle = style.background;
    roundRect(ctx, x, top - padY(px), w, blockH + padY(px) * 2, px * 0.18);
  }
  for (let i = 0; i < lay.lines.length; i++) {
    const line = lay.lines[i];
    if (line) strokeAndFill(ctx, style, line, ax, top + lay.lineHeight * (i + 0.5), H / 1080);
  }
}

/**
 * Draw one caption line set in the frame's own coordinates: 90% of the width, centred, its last line
 * resting `style.bottom` of the height above the bottom edge. Each line gets its own background strip.
 */
export function drawCaption(ctx: Ctx, clip: CaptionClip, style: CaptionStyle, W: number, H: number): void {
  if (!clip.text.trim()) return;
  const px = textPx(style, H);
  const inset = style.background ? padX(px) : 0;
  const boxW = W * 0.9;
  const lay = layout(ctx, clip, clip.text, style, boxW - inset * 2, H);
  const n = lay.lines.length;
  const bottom = H * (1 - style.bottom);
  ctx.font = lay.font;
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  const left = (W - boxW) / 2;
  const ax = style.align === "left" ? left + inset : style.align === "right" ? left + boxW - inset : W / 2;
  for (let i = 0; i < n; i++) {
    const line = lay.lines[i];
    if (!line) continue;
    const cy = bottom - lay.lineHeight * (n - i - 0.5);
    if (style.background) {
      const w = lay.widths[i] + inset * 2;
      const x = style.align === "left" ? left : style.align === "right" ? left + boxW - w : (W - w) / 2;
      ctx.fillStyle = style.background;
      roundRect(ctx, x, cy - lay.lineHeight / 2, w, lay.lineHeight, px * 0.12);
    }
    strokeAndFill(ctx, style, line, ax, cy, H / 1080);
  }
}

/** Measured size of a text clip's block in frame px (for "fit box to text" in the inspector) */
export function measureTextClip(ctx: Ctx, clip: TextClip, boxW: number, H: number): { width: number; height: number } {
  const px = textPx(clip.style, H);
  const inset = clip.style.background ? padX(px) : 0;
  const lay = layout(ctx, clip, clip.text, clip.style, boxW - inset * 2, H);
  return { width: lay.maxWidth + inset * 2, height: lay.lines.length * lay.lineHeight + (clip.style.background ? padY(px) * 2 : 0) };
}
