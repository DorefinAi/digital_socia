// How the words sit in a desk template's red box, shared by the editor's card (orgCanvas.ts, drawn by
// cardRender.ts), the X background card and the list thumbnails (backgroundCard.ts), so all three match the
// desk's own posts: heading and story the same size, one empty line between them, the block as large as
// the box allows and centred in it.

/** Line pitch for heading and story alike, in font sizes */
export const CARD_LINE = 1.38;
/** Space between the heading's last line and the story's first, in lines: one empty line */
export const CARD_GAP_LINES = 1;
/** Inside the template's box: share of its width on each side, and of its height top and bottom */
export const CARD_PAD_X = 0.03;
export const CARD_PAD_Y = 0.03;
/** Sizes are tried in half pixels, so the block gets as close to the box as the line breaks allow */
const STEP = 0.5;

/**
 * The largest size from `minPx` to `maxPx` (half pixels) whose block, as `heightAt` measures it, is no taller
 * than `room`. Line breaks make height jump, not grow smoothly, so every candidate is measured (a binary search
 * could step over a size that fits). Null when not even `minPx` fits.
 */
export function largestFit(minPx: number, maxPx: number, room: number, heightAt: (size: number) => number): number | null {
  const lo = Math.max(6, Math.min(minPx, maxPx));
  const hi = Math.max(lo, minPx, maxPx);
  for (let size = hi; size >= lo; size -= STEP) if (heightAt(size) <= room) return size;
  return null;
}
