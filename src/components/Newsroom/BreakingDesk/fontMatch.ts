// Finding a card font by what a layout or the server calls it: its id ("mardoto") or its name ("Mardoto Bold",
// "Mardoto-Bold", "mardoto_bold"). Pure, so fontMatch.test.ts runs it under plain node (templateFonts.ts loads
// next/font and can't be).

/** Lower case, without spaces, dashes or underscores, and without a trailing "bold" */
export const fontKey = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, "").replace(/bold$/, "");

/** The font `id` names (exactly by id first, then loosely by id or label), else `fallback`; unset gives `fallback`. */
export function findFont<T extends { id: string; label: string }>(fonts: readonly T[], id: string | undefined, fallback: T): T {
  if (!id) return fallback;
  const exact = fonts.find((f) => f.id === id);
  if (exact) return exact;
  const key = fontKey(id);
  if (!key) return fallback;
  return fonts.find((f) => f.id === key || fontKey(f.label) === key) ?? fallback;
}
