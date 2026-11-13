// The maths behind drawing someone else's cursor over the Tweet box in watch mode (LiveCaret.tsx).
//
// A textarea can't say where character N sits on screen, so LiveCaret keeps an invisible mirror div with the
// same text, font, padding, line height and width, and asks a DOM Range on the mirror's single text node for
// the rectangles. The text is never split into spans, so Devanagari conjuncts and matras shape exactly as they
// do in the textarea. Everything here is pure (no DOM), for the node test runner (caretMirror.test.ts).

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How long the name flag stays after each change before it fades */
export const FLAG_SHOW_MS = 2000;

let segmenter: Intl.Segmenter | null | undefined;
const graphemes = (): Intl.Segmenter | null => {
  if (segmenter === undefined) segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  return segmenter;
};

/** Every grapheme boundary in `text`, from 0 to text.length */
export function graphemeBoundaries(text: string): number[] {
  const seg = graphemes();
  const out = [0];
  if (seg) {
    for (const s of seg.segment(text)) if (s.index > 0) out.push(s.index);
  } else {
    // No Segmenter: at least never split a surrogate pair
    for (let i = 1; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (!(c >= 0xdc00 && c <= 0xdfff)) out.push(i);
    }
  }
  if (out[out.length - 1] !== text.length) out.push(text.length);
  return out;
}

/**
 * The offset moved onto a grapheme boundary, so the caret never lands inside a conjunct such as "क्ष" or
 * between a consonant and its matra. `up` picks the boundary after, else the one before. Clamped to the text.
 */
export function snapToGrapheme(text: string, offset: number, up = false): number {
  const o = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? Math.floor(offset) : 0));
  const b = graphemeBoundaries(text);
  if (up) return b.find((x) => x >= o) ?? text.length;
  let best = 0;
  for (const x of b) {
    if (x > o) break;
    best = x;
  }
  return best;
}

/**
 * The holder's selection on this text: clamped, in order, and on grapheme boundaries (a range is widened to
 * whole clusters). `caret` is where the cursor is drawn: the selection's end, as the holder's box reports it.
 */
export function liveSelection(text: string, selStart: number, selEnd: number): { start: number; end: number; caret: number; collapsed: boolean } {
  const a = Math.min(selStart, selEnd);
  const z = Math.max(selStart, selEnd);
  if (a === z) {
    const at = snapToGrapheme(text, a);
    return { start: at, end: at, caret: at, collapsed: true };
  }
  const start = snapToGrapheme(text, a);
  const end = snapToGrapheme(text, z, true);
  // The cursor sits where the holder's selection ends (selEnd); after a backwards drag that is the start
  const caret = selEnd >= selStart ? end : start;
  return { start, end, caret, collapsed: start === end };
}

/**
 * The mirror's text. A textarea shows an empty last line after a trailing newline; a div doesn't, unless
 * something sits on it, so a zero-width space is added. Offsets into the text are unchanged.
 */
export const mirrorText = (text: string) => (text.endsWith("\n") || text === "" ? `${text}​` : text);

/** Computed-style properties the mirror copies from the textarea, so text wraps and shapes identically */
export const MIRROR_PROPS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "fontStretch",
  "fontFeatureSettings",
  "fontVariationSettings",
  "fontKerning",
  "fontOpticalSizing",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "textRendering",
  "tabSize",
  "direction",
  "wordBreak",
  "hyphens",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
] as const;

export type MirrorProp = (typeof MIRROR_PROPS)[number];

/**
 * The mirror's inline style from the textarea's computed style. `clientWidth` is the textarea's inner width
 * (padding included, scrollbar and border left out): the mirror is that wide with the same padding, so its
 * lines break where the textarea's do, scrollbar or not.
 */
export function mirrorStyle(computed: Partial<Record<MirrorProp, string>>, clientWidth: number): Record<string, string | number> {
  const style: Record<string, string | number> = {};
  for (const p of MIRROR_PROPS) {
    const v = computed[p];
    if (v) style[p] = v;
  }
  return {
    ...style,
    position: "absolute",
    top: 0,
    left: 0,
    boxSizing: "border-box",
    width: Math.max(0, clientWidth),
    border: 0,
    margin: 0,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    visibility: "hidden",
    pointerEvents: "none",
  };
}

/**
 * Screen rectangles from the mirror into the overlay's own coordinates: relative to the mirror's top-left,
 * moved up and left by the textarea's scroll, and kept only where they show inside the visible box (clipped
 * at its edges, empty ones dropped).
 */
export function toBoxRects(rects: readonly Rect[], mirrorOrigin: { left: number; top: number }, scroll: { top: number; left: number }, box: { width: number; height: number }): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    const left = r.left - mirrorOrigin.left - scroll.left;
    const top = r.top - mirrorOrigin.top - scroll.top;
    const x0 = Math.max(0, left);
    const y0 = Math.max(0, top);
    const x1 = Math.min(box.width, left + r.width);
    const y1 = Math.min(box.height, top + r.height);
    if (x1 - x0 > 0.5 && y1 - y0 > 0.5) out.push({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 });
  }
  return out;
}

/**
 * Where the caret goes, from what a Range could measure: the collapsed range's own rectangle when the
 * browser gives one, else the left edge of the character after it, else the right edge of the one before (a
 * collapsed range at a line's start or end sometimes has no rectangle). At a soft wrap the collapsed range
 * reports the end of the line above, but a textarea draws its cursor at the start of the next line, so the
 * character after wins when it sits on a lower line.
 */
export function caretRect(m: { collapsed?: Rect | null; next?: Rect | null; prev?: Rect | null }): Rect | null {
  const wrapped = !!m.collapsed && !!m.next && m.next.height > 0 && m.next.top >= m.collapsed.top + m.collapsed.height / 2;
  if (m.collapsed && m.collapsed.height > 0 && !wrapped) return { left: m.collapsed.left, top: m.collapsed.top, width: 0, height: m.collapsed.height };
  if (m.next && m.next.height > 0) return { left: m.next.left, top: m.next.top, width: 0, height: m.next.height };
  if (m.prev && m.prev.height > 0) return { left: m.prev.left + m.prev.width, top: m.prev.top, width: 0, height: m.prev.height };
  return null;
}

/**
 * The caret in box coordinates, or null when it is scrolled out of view. Unlike toBoxRects a caret has no
 * width, so only its height is checked against the box.
 */
export function caretInBox(caret: Rect, mirrorOrigin: { left: number; top: number }, scroll: { top: number; left: number }, box: { width: number; height: number }): Rect | null {
  const left = Math.min(Math.max(0, caret.left - mirrorOrigin.left - scroll.left), Math.max(0, box.width - 2));
  const top = caret.top - mirrorOrigin.top - scroll.top;
  if (top + caret.height <= 0 || top >= box.height) return null;
  const y0 = Math.max(0, top);
  return { left, top: y0, width: 2, height: Math.min(box.height, top + caret.height) - y0 };
}

/**
 * The name flag beside the caret: above it, left edge on the caret, kept inside the box; below the caret when
 * there is no room above (the first visible line).
 */
export function flagPosition(caret: Rect, box: { width: number }, flag: { width: number; height: number }): { left: number; top: number; below: boolean } {
  const left = Math.max(0, Math.min(caret.left, box.width - flag.width));
  const below = caret.top - flag.height < 0;
  return { left, top: below ? caret.top + caret.height : caret.top - flag.height, below };
}

/** After the watcher scrolls the box themselves, the overlay leaves their scroll alone for this long */
export const USER_SCROLL_QUIET_MS = 3000;

/**
 * Whether to scroll the watcher's box to the holder's caret: only when the caret is out of view, the watcher
 * hasn't scrolled for USER_SCROLL_QUIET_MS, and the caret just got there (moved to another line, or was in
 * view before). A caret that stays on one line out of view is left alone, so a watcher reading elsewhere
 * isn't pulled back with every keystroke.
 */
export function shouldFollowCaret(m: { line: number; lastLine: number | null; visible: boolean; wasVisible: boolean; sinceUserScroll: number }): boolean {
  if (m.visible || m.sinceUserScroll < USER_SCROLL_QUIET_MS) return false;
  return m.lastLine === null || Math.abs(m.line - m.lastLine) > 1 || m.wasVisible;
}

/** Whether a caret (content coordinates, unscrolled) is wholly inside the box's visible band */
export const caretVisible = (top: number, height: number, scrollTop: number, clientHeight: number) => top >= scrollTop - 1 && top + height <= scrollTop + clientHeight + 1;

