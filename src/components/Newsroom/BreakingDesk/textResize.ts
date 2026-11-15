// Canva-style resizing for the card designer's text boxes (the headline and the extra text boxes; the desk
// template's one text box has its own in live/orgCanvas.ts setOrgBlock, with the same rules):
// - a left or right handle changes only the width: the words keep their size and re-wrap, the box keeps its top
//   edge and the opposite side, and its height follows the words;
// - a corner scales the box and the words together by how much wider or narrower it got, the opposite corner fixed;
// - text boxes have no top or bottom handle (their height always follows the words), so a height-only change is
//   ignored.
// Pure, so the rules can be tested without a canvas: the caller measures the words with `heightOf`.

import type { CardLayout, CardTextLayer } from "@/types/newsroom";
import type { BoxHandle, FrameBox } from "./ResizeFrame";

/** The handles a text box offers: four corners and the left and right sides */
export const TEXT_HANDLES: readonly BoxHandle[] = ["e", "w", "nw", "ne", "se", "sw"];

export type TextResizeKind = "side" | "corner" | "height";

/** What a handle does to a text box */
export const textResizeKind = (handle: BoxHandle): TextResizeKind => (handle.length === 2 ? "corner" : handle === "e" || handle === "w" ? "side" : "height");

/** Size control ranges (PostEditor): an extra text box in px on a 1080 frame, the headline as a share of its base size */
export const LAYER_SIZE = { min: 16, max: 240 };
export const HEADLINE_SCALE = { min: 0.5, max: 1.8 };

/**
 * The words' size after a drag from `size`: a side keeps it, a corner scales it by how much wider or narrower the
 * box got. A corner keeps it within `range`, widened to take in `size` itself (an older box may sit outside it).
 */
export function resizedTextSize(size: number, handle: BoxHandle, startW: number, newW: number, range: { min: number; max: number }): number {
  if (textResizeKind(handle) !== "corner" || startW <= 0) return size;
  return Math.max(Math.min(range.min, size), Math.min(Math.max(range.max, size), size * (newW / startW)));
}

/** Top of a text box whose height follows its words: a top corner keeps the bottom edge, every other handle the top. */
export function anchoredTop(start: FrameBox, handle: BoxHandle, h: number): number {
  return handle === "nw" || handle === "ne" ? start.y + start.h - h : start.y;
}

interface Card {
  W: number;
  H: number;
  /** Canvas px per px on a 1080 frame */
  u: number;
}

/**
 * An extra text box after dragging `handle` from `start` to `box` (both as drawn, canvas px). `fittedPx` is the size
 * its words are drawn at now (an older box with a height set by hand may have shrunk them); `heightOf` measures the
 * box as drawn (canvas px) for a layer, or null when it has no words. The result has no height: it follows the words.
 */
export function resizeLayer(layer: CardTextLayer, handle: BoxHandle, start: FrameBox, box: FrameBox, card: Card, fittedPx: number, heightOf: (l: CardTextLayer) => number | null): CardTextLayer {
  if (textResizeKind(handle) === "height") return layer;
  const size = resizedTextSize(fittedPx / card.u, handle, start.w, box.w, LAYER_SIZE);
  const next: CardTextLayer = { ...layer, size, width: box.w / card.W, x: (box.x + box.w / 2) / card.W, height: undefined };
  const h = heightOf(next) ?? start.h * (size / (fittedPx / card.u));
  const top = anchoredTop(start, handle, h);
  return { ...next, y: (top + h / 2) / card.H };
}

/**
 * The headline after dragging `handle` from `start` to `box` (canvas px). Its box is set by hand from now on, with
 * the height its words take (`heightOf` measures that, insets included, for a layout; null when there are no words).
 * `area` is the headline's column (textWidth is a share of it) and base size (fontScale multiplies it).
 */
export function resizeHeadline(
  layout: CardLayout,
  handle: BoxHandle,
  start: FrameBox,
  box: FrameBox,
  card: Card,
  area: { width: number; baseSize: number },
  fittedPx: number,
  heightOf: (l: CardLayout) => number | null,
): CardLayout {
  if (textResizeKind(handle) === "height" || area.baseSize <= 0) return layout;
  const fitted = fittedPx / area.baseSize;
  const fontScale = resizedTextSize(fitted, handle, start.w, box.w, HEADLINE_SCALE);
  const next: CardLayout = { ...layout, fontScale, textWidth: box.w / (area.width || card.W), textX: (box.x + box.w / 2) / card.W };
  const measured = heightOf(next);
  // A pixel to spare, so the words fit their box and are never shrunk to fit it; never under cardRender's MIN_BOX.h
  // (36, written out so this file stays free of the renderer for its tests)
  const h = Math.max(36 * card.u, measured === null ? start.h * (fontScale / fitted) : measured + 1);
  const top = anchoredTop(start, handle, h);
  return { ...next, textY: (top + h / 2) / card.H, textHeight: h / card.H };
}
