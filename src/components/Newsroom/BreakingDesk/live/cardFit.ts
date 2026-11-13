// How the words sit in a desk template's red box, shared by the editor's card (orgCanvas.ts, drawn by
// cardRender.ts), the X background card and the list thumbnails (backgroundCard.ts), so all three match the
// desk's own posts: heading and story one block of text at one size, one empty line between them, the block
// as large as the box allows, centred across it and up and down in it (cardBlockTop).
//
// Measured on the desk's 153 posted BREAKING NEWS cards of 12-13 Nov 2026 against Socia's drawing of the same
// stories (dev-docs/breaking-cards-desk-vs-socia-2026-11-13.pdf): with the Hindi in Noto Sans Devanagari Bold
// (the desk's face) the desk's lines are 1.38 sizes apart, and the room below picks the same line count as the
// desk on 92 of 107 measurable cards, the block's top at the desk's height (median 0 px off).

/**
 * Which way cards are drawn. Part of every drawn card's cache key (useBackgroundCard, storyThumbs), so a
 * card drawn and uploaded the earlier way is drawn and sent again once. Raise it whenever the drawing changes
 * (3: Mardoto Bold became the cards' face). Not raised for the Noto Hindi and the centred block, on purpose: a
 * card already drawn stays as it was; only cards drawn from now on (new stories) take the new look.
 */
export const CARD_DRAW_VERSION = 3;

/** Line pitch for heading and story alike, in font sizes (the desk's posts, measured in Noto Sans Devanagari Bold) */
export const CARD_LINE = 1.38;
/** Space between the heading's last line and the story's first, in lines: one empty line */
export const CARD_GAP_LINES = 1;
/** Inside the template's box: share of its width on each side */
export const CARD_PAD_X = 0.034;
/**
 * How far the room for the block of lines reaches past the box's top and bottom edges, in font sizes. Only
 * the lines' empty leading hangs over (the letters stay in the red panel, at any size, since the hang shrinks
 * with the type). Fitted to the desk's posts (see the top of this file).
 */
export const CARD_HANG_TOP = 0.15;
export const CARD_HANG_BOTTOM = 0.45;
/** Drawing versions 2-3: lines 1.49 sizes apart, the room hanging this far, the block at the room's top */
export const V3_CARD_LINE = 1.49;
export const V3_CARD_HANG_TOP = 0.315;
/** Sizes are tried in half pixels, so the block gets as close to the box as the line breaks allow */
const STEP = 0.5;

/** Before the desk-post fit (drawing version 1): share of the box on each side, block centred in the box */
export const LEGACY_CARD_LINE = 1.38;
export const LEGACY_CARD_PAD_X = 0.03;
export const LEGACY_CARD_PAD_Y = 0.03;

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The area the heading and story are laid out in at `size`, in card px, from the template's box in card px:
 * the column across (CARD_PAD_X each side), and down the box plus the hang above and below at that size.
 * The block is centred up and down in it (cardBlockTop). Size 0 gives the column over the box itself.
 */
export function cardTextArea(box: PxRect, size = 0): PxRect {
  const padX = box.w * CARD_PAD_X;
  const top = CARD_HANG_TOP * size;
  return { x: box.x + padX, y: box.y - top, w: box.w - padX * 2, h: box.h + top + CARD_HANG_BOTTOM * size };
}

/**
 * Top of the block of lines (heading, gap, story) `blockH` tall in `area` (cardTextArea at the block's size):
 * centred up and down, as the desk centres the words in the red panel. A block that fills the area (or is cut
 * to it) starts at its top.
 */
export function cardBlockTop(area: PxRect, blockH: number): number {
  return area.y + Math.max(0, (area.h - blockH) / 2);
}

/** The area the words were laid out in before the desk-post fit (LEGACY_*), for cards made then */
export function legacyTextArea(box: PxRect): PxRect {
  const padX = box.w * LEGACY_CARD_PAD_X;
  const padY = box.h * LEGACY_CARD_PAD_Y;
  return { x: box.x + padX, y: box.y + padY, w: box.w - padX * 2, h: box.h - padY * 2 };
}

/**
 * The largest size from `minPx` to `maxPx` (half pixels) whose block, as `heightAt` measures it, is no taller
 * than `room` (a number, or the room at that size). Line breaks make height jump, not grow smoothly, so every candidate is measured (a binary search
 * could step over a size that fits). Null when not even `minPx` fits.
 */
export function largestFit(minPx: number, maxPx: number, room: number | ((size: number) => number), heightAt: (size: number) => number): number | null {
  const lo = Math.max(6, Math.min(minPx, maxPx));
  const hi = Math.max(lo, minPx, maxPx);
  const roomAt = typeof room === "number" ? () => room : room;
  for (let size = hi; size >= lo; size -= STEP) if (heightAt(size) <= roomAt(size)) return size;
  return null;
}
