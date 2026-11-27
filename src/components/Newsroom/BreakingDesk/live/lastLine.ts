// The card's last-line rule (owner, 27 Nov 2026): a block of words that runs over two or more lines never ends on a line
// of one or two words. Shared by every place the card's words are wrapped (cardRender.layoutLines, orgCanvas.lineCount,
// backgroundCard.wrap), so the size the card is fitted at and the words it draws always agree.

/** The fewest words the last line of a wrapped block may carry */
export const LAST_LINE_MIN_WORDS = 3;
/** How far the column may narrow to give the last line its words: down to this share of its width */
export const LAST_LINE_MIN_WIDTH = 0.85;
/** Narrowing steps between the full width and LAST_LINE_MIN_WIDTH of it */
const STEPS = 30;

/** Greedy wrapping of word widths at `width`: the number of words on each line (as every card wrapper does it) */
export function wrapCounts(widths: readonly number[], space: number, width: number): number[] {
  const counts: number[] = [];
  let line = 0;
  let n = 0;
  for (const w of widths) {
    if (n && line + space + w > width) {
      counts.push(n);
      line = w;
      n = 1;
    } else {
      line += (n ? space : 0) + w;
      n += 1;
    }
  }
  if (n) counts.push(n);
  return counts;
}

/** Whether wrapping at `width` leaves a last line of too few words over two or more lines */
const shortLast = (counts: readonly number[]) => counts.length >= 2 && counts.at(-1)! < LAST_LINE_MIN_WORDS;

/**
 * The width to wrap one paragraph at: `width` itself, unless that leaves its last line with fewer than LAST_LINE_MIN_WORDS
 * words over two or more lines; then the widest narrower column, in small steps down to LAST_LINE_MIN_WIDTH of it, whose
 * last line has enough words. None does (or the paragraph has too few words for it): `width`, as before.
 */
export function lastLineWidth(widths: readonly number[], space: number, width: number): number {
  if (widths.length <= LAST_LINE_MIN_WORDS || !(width > 0)) return width;
  if (!shortLast(wrapCounts(widths, space, width))) return width;
  const step = (width * (1 - LAST_LINE_MIN_WIDTH)) / STEPS;
  for (let k = 1; k <= STEPS; k++) {
    const w = width - k * step;
    // A word wider than the column would stick out: stop narrowing there
    if (widths.some((x) => x > w)) break;
    if (!shortLast(wrapCounts(widths, space, w))) return w;
  }
  return width;
}
