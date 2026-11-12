import {
  Amita,
  Anek_Devanagari,
  Baloo_2,
  Biryani,
  Eczar,
  Hind,
  Kalam,
  Khand,
  Martel,
  Modak,
  Mukta,
  Palanquin_Dark,
  Poppins,
  Rajdhani,
  Rozha_One,
  Sarpanch,
  Teko,
  Tiro_Devanagari_Hindi,
  Yatra_One,
} from "next/font/google";
import { notoDevanagari as noto, roboto } from "@/constants/fonts";
import { findFont } from "./fontMatch";

// Every card font covers Devanagari and Latin, since FTP stories arrive in Hindi with English names.
// preload is off: a font file downloads only when a card or the font menu first uses it.
// next/font reads these options at build time, so each call spells them out in full.

// Noto and Roboto are the UI fonts too, so they come from the shared declaration rather than a second copy
const mukta = Mukta({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "500", "700", "800"] });
const hind = Hind({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"] });
const poppins = Poppins({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700", "800"], style: ["normal", "italic"] });
const anek = Anek_Devanagari({ subsets: ["devanagari", "latin"], display: "swap", preload: false });
const baloo = Baloo_2({ subsets: ["devanagari", "latin"], display: "swap", preload: false });
const khand = Khand({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"] });
const teko = Teko({ subsets: ["devanagari", "latin"], display: "swap", preload: false });
const rajdhani = Rajdhani({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"] });
const sarpanch = Sarpanch({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700", "800"] });
const palanquin = Palanquin_Dark({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"] });
const biryani = Biryani({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "600", "700", "800"] });
const eczar = Eczar({ subsets: ["devanagari", "latin"], display: "swap", preload: false });
const martel = Martel({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "600", "700", "800"] });
const tiro = Tiro_Devanagari_Hindi({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: "400", style: ["normal", "italic"] });
const rozha = Rozha_One({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: "400" });
const yatra = Yatra_One({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: "400" });
const kalam = Kalam({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "700"] });
const amita = Amita({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: ["400", "700"] });
const modak = Modak({ subsets: ["devanagari", "latin"], display: "swap", preload: false, weight: "400" });

export type FontGroup = "Sans" | "Condensed" | "Serif" | "Display" | "Handwritten";

export interface TemplateFont {
  id: string;
  label: string;
  group: FontGroup;
  /** Resolved CSS family list, usable by canvas and CSS alike */
  family: string;
  weights: number[];
}

const VARIABLE = [400, 500, 600, 700, 800];

/**
 * Mangal (globals.css "SociaMangal": the installed face, else public/fonts) for Hindi; Latin letters and
 * digits fall through to a bold sans; Noto Sans covers Hindi if Mangal can't load.
 */
export const MANGAL_FAMILY = `"SociaMangal", Arial, "Helvetica Neue", ${noto.style.fontFamily}`;
/**
 * Mardoto Bold (globals.css "SociaMardoto", bundled in public/fonts, SIL OFL 1.1): the desk templates' card
 * face. It has Latin letters only, so Hindi falls back to Mangal, then the rest of Mangal's list.
 */
export const MARDOTO_FAMILY = `"SociaMardoto", ${MANGAL_FAMILY}`;
/** The desk templates' card face: headline, story, date and added text boxes */
export const ORG_CARD_FONT = "mardoto";
/** The desk templates' date face (the same face; kept apart so the date can change on its own) */
export const ORG_DATE_FONT = "mardoto";

export const TEMPLATE_FONTS: TemplateFont[] = [
  // First in the menu: the default on the desk's X templates (Mardoto ships bold only; Hindi is set in Mangal)
  { id: "mardoto", label: "Mardoto Bold", group: "Sans", family: MARDOTO_FAMILY, weights: [700] },
  // Mangal ships regular and bold only
  { id: "mangal", label: "Mangal", group: "Sans", family: MANGAL_FAMILY, weights: [400, 700] },
  { id: "noto", label: "Noto Sans", group: "Sans", family: noto.style.fontFamily, weights: [...VARIABLE, 900] },
  // Roboto has no Hindi letters; Noto Sans covers them in the same voice
  { id: "roboto", label: "Roboto", group: "Sans", family: `${roboto.style.fontFamily}, ${noto.style.fontFamily}`, weights: [...VARIABLE, 900] },
  { id: "mukta", label: "Mukta", group: "Sans", family: mukta.style.fontFamily, weights: [400, 500, 700, 800] },
  { id: "hind", label: "Hind", group: "Sans", family: hind.style.fontFamily, weights: [400, 500, 600, 700] },
  { id: "poppins", label: "Poppins", group: "Sans", family: poppins.style.fontFamily, weights: VARIABLE },
  { id: "anek", label: "Anek", group: "Sans", family: anek.style.fontFamily, weights: VARIABLE },
  { id: "palanquin", label: "Palanquin Dark", group: "Sans", family: palanquin.style.fontFamily, weights: [400, 500, 600, 700] },
  { id: "biryani", label: "Biryani", group: "Sans", family: biryani.style.fontFamily, weights: [400, 600, 700, 800] },
  { id: "khand", label: "Khand", group: "Condensed", family: khand.style.fontFamily, weights: [400, 500, 600, 700] },
  { id: "teko", label: "Teko", group: "Condensed", family: teko.style.fontFamily, weights: [400, 500, 600, 700] },
  { id: "rajdhani", label: "Rajdhani", group: "Condensed", family: rajdhani.style.fontFamily, weights: [400, 500, 600, 700] },
  { id: "sarpanch", label: "Sarpanch", group: "Condensed", family: sarpanch.style.fontFamily, weights: VARIABLE },
  { id: "martel", label: "Martel", group: "Serif", family: martel.style.fontFamily, weights: [400, 600, 700, 800] },
  { id: "eczar", label: "Eczar", group: "Serif", family: eczar.style.fontFamily, weights: VARIABLE },
  { id: "tiro", label: "Tiro Hindi", group: "Serif", family: tiro.style.fontFamily, weights: [400] },
  { id: "rozha", label: "Rozha One", group: "Display", family: rozha.style.fontFamily, weights: [400] },
  { id: "yatra", label: "Yatra One", group: "Display", family: yatra.style.fontFamily, weights: [400] },
  { id: "baloo", label: "Baloo", group: "Display", family: baloo.style.fontFamily, weights: VARIABLE },
  { id: "modak", label: "Modak", group: "Display", family: modak.style.fontFamily, weights: [400] },
  { id: "kalam", label: "Kalam", group: "Handwritten", family: kalam.style.fontFamily, weights: [400, 700] },
  { id: "amita", label: "Amita", group: "Handwritten", family: amita.style.fontFamily, weights: [400, 700] },
];

// Unset or unknown: Noto Sans, as before (Mardoto is the default only where a desk template sets it)
const FALLBACK_FONT = TEMPLATE_FONTS.find((f) => f.id === "noto") ?? TEMPLATE_FONTS[0];
// A font may be named by id ("mardoto") or by name ("Mardoto Bold", "Mardoto-Bold"); both resolve to the same face
export const fontById = (id: string | undefined) => findFont(TEMPLATE_FONTS, id, FALLBACK_FONT);

/** Nearest weight the font actually ships, so canvas never fakes a bold. */
export const nearestWeight = (font: TemplateFont, weight: number) =>
  font.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), font.weights[0]);
