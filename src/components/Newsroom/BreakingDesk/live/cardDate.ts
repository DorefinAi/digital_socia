// The date in a desk template's yellow date tag, shared by the editor's card (orgCanvas.ts) and the X
// background card and thumbnails (backgroundCard.ts), so both place it alike.
//
// Measured on a real BREAKING NEWS post ("Date:09/11/2026" in a 455 × 56 px tag): Mardoto Bold at the
// tag's height (cap height about 0.7 of it), the capitals' middle 3.5% of the tag's height above the
// tag's middle, the ink starting 3.7% of the tag's width in from its left end and ending 2.3% short of
// its right end.

import type { PxRect } from "./cardFit";

/** Font size against the tag's height */
const SIZE_H = 1;
/** Ink margins inside the tag, as shares of its width (the right one with half a pixel to spare) */
const INK_LEFT = 0.037;
const INK_RIGHT = 0.022;
/** How far the capitals' middle sits above the tag's middle, as a share of the tag's height */
const CAP_RAISE = 0.035;
/** Letters and digits only: "/" and ":" reach above or below the capitals */
const NOT_ALNUM = /[^\p{L}\p{N}]/gu;

export interface DateFit {
  /** Font size in card px */
  size: number;
  /** Where the text starts (textAlign "left"), in card px */
  originX: number;
  /** Alphabetic baseline, in card px */
  baseline: number;
  /** The line's advance width, in card px */
  advance: number;
  /** The line's centre for textBaseline "middle", in card px (cardRender draws text boxes that way) */
  middleY: number;
}

/**
 * Sizes and places `text` in the date tag `slot` (card px). `fontAt(px)` is the CSS font to measure in.
 * Starts at the tag's height and steps down a pixel at a time while the ink is wider than the tag allows.
 * Leaves ctx.font set to the fitted size; textAlign and textBaseline are restored.
 */
export function fitDate(ctx: CanvasRenderingContext2D, text: string, slot: PxRect, fontAt: (px: number) => string): DateFit {
  const { textAlign, textBaseline } = ctx;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const maxInk = slot.w * (1 - INK_LEFT - INK_RIGHT);
  let size = Math.max(8, slot.h * SIZE_H);
  ctx.font = fontAt(size);
  let m = ctx.measureText(text);
  while (size > 8 && m.actualBoundingBoxLeft + m.actualBoundingBoxRight > maxInk) {
    size -= 1;
    ctx.font = fontAt(size);
    m = ctx.measureText(text);
  }
  // Ink starts actualBoundingBoxLeft before the origin (negative: after it)
  const originX = slot.x + slot.w * INK_LEFT + m.actualBoundingBoxLeft;
  // Capitals and digits share one height; their middle goes CAP_RAISE above the tag's middle
  const capTop = ctx.measureText(text.replace(NOT_ALNUM, "") || text).actualBoundingBoxAscent;
  const baseline = slot.y + slot.h * (0.5 - CAP_RAISE) + capTop / 2;
  ctx.textBaseline = "middle";
  const fromMiddle = ctx.measureText(text).actualBoundingBoxAscent;
  ctx.textAlign = textAlign;
  ctx.textBaseline = textBaseline;
  // The whole line's ink top is m.actualBoundingBoxAscent above the baseline and fromMiddle above the middle line
  return { size, originX, baseline, advance: m.width, middleY: baseline - m.actualBoundingBoxAscent + fromMiddle };
}
