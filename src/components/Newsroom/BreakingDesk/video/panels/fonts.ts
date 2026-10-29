import { TEMPLATE_FONTS } from "../../templateFonts";

export interface StudioFont {
  label: string;
  /** What goes in TextStyle.font: a CSS family list, usable by canvas and CSS alike */
  family: string;
  weights: number[];
}

// Mangal is the Windows Hindi face the desk's graphics team already uses; Nirmala UI and Noto stand in where
// it is not installed. The rest are the card editor's web fonts (all cover Devanagari and Latin).
export const STUDIO_FONTS: StudioFont[] = [
  { label: "Mangal", family: "Mangal", weights: [400, 700] },
  ...TEMPLATE_FONTS.map((f) => ({ label: f.label, family: f.family, weights: f.weights })),
];

export const fontLabel = (family: string) => STUDIO_FONTS.find((f) => f.family === family)?.label ?? family.split(",")[0].replace(/['"]/g, "");

/** CSS family list for showing a TextStyle.font in the DOM, with Hindi fallbacks */
export const cssFamily = (family: string) => `${family}, 'Nirmala UI', var(--font-devanagari), sans-serif`;
