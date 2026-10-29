// Font stacks for canvas text and the wait that makes the first frame use them. Canvas shapes
// Devanagari itself (conjuncts, matras) as long as the face is loaded before drawing; a face that
// is still loading draws in the fallback and does not repaint, hence ensureFonts().

import { notoDevanagari } from "@/constants/fonts";
import type { Project } from "../model";

/** Noto Sans Devanagari from next/font (its generated family name), then system Hindi faces */
const FALLBACK = `${notoDevanagari.style.fontFamily}, "Nirmala UI", "Kohinoor Devanagari", sans-serif`;

const stacks = new Map<string, string>();

/** CSS font-family list for a style's font name: the chosen face first, Noto Devanagari behind it */
export function fontStack(font: string): string {
  let s = stacks.get(font);
  if (s === undefined) {
    const name = font.trim();
    // A name already written as a family list (contains a comma or quotes) is used as given
    const first = !name ? "" : /[,'"]/.test(name) ? name : `"${name}"`;
    s = first ? `${first}, ${FALLBACK}` : FALLBACK;
    stacks.set(font, s);
  }
  return s;
}

let version = 0;
const listeners = new Set<() => void>();

/** Bumps whenever a face finishes loading, so measured text layouts know to re-measure */
export function fontsVersion(): number {
  return version;
}

/** Call fn whenever new faces become available; returns an unsubscribe */
export function onFontsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const SAMPLE = "अआक्षत्रज्ञ श्री हिंदी Aa1";
const requested = new Set<string>();

/**
 * Load every face the project's text and captions use (each weight in use), Noto Sans Devanagari
 * included. Resolves when loading has settled (faces that are not installed resolve as missing).
 * Export must await this before its first frame; the preview awaits it and redraws.
 */
export async function ensureFonts(project: Project): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const wanted: string[] = [];
  const add = (font: string, weight: number) => {
    const key = `${weight} 40px ${fontStack(font)}`;
    if (!requested.has(key)) wanted.push(key);
  };
  add(project.captionStyle.font, project.captionStyle.weight);
  for (const tr of project.tracks) for (const c of tr.clips) if (c.type === "text") add(c.style.font, c.style.weight);
  if (wanted.length === 0) {
    await document.fonts.ready;
    return;
  }
  const results = await Promise.all(wanted.map((key) => document.fonts.load(key, SAMPLE).then((faces) => faces.length, () => 0)));
  for (const key of wanted) requested.add(key);
  await document.fonts.ready;
  if (results.some((n) => n > 0)) {
    version++;
    for (const fn of listeners) fn();
  }
}
