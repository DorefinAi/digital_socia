// Line wrapping for canvas text, separate from drawing so it can be checked without a canvas.

const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** Split text into lines no wider than maxWidth. Words wrap at spaces; a word too long on its own breaks between letters (never inside a conjunct). */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      // Break the long word between graphemes (clusters keep a conjunct and its matras together)
      line = "";
      const parts = segmenter ? Array.from(segmenter.segment(word), (s) => s.segment) : Array.from(word);
      for (const g of parts) {
        if (line && measure(line + g) > maxWidth) {
          lines.push(line);
          line = g;
        } else line += g;
      }
    }
    lines.push(line);
  }
  return lines;
}
