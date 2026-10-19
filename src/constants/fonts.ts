import { Noto_Sans_Devanagari, Roboto, Roboto_Mono } from "next/font/google";

// The UI fonts, declared once. The card editor reuses Roboto and Noto from here, because a second
// next/font call for the same family gives it a second set of files and the browser downloads both.
// Only the mono face is preloaded: the others cover several subsets and styles, and a preload would
// fetch all of them, while unpreloaded faces download only for the characters a page actually shows.

/** Roboto across the whole UI. It has no Hindi letters, so Noto Sans Devanagari covers those. */
export const roboto = Roboto({ subsets: ["latin", "latin-ext"], style: ["normal", "italic"], display: "swap", preload: false, variable: "--font-roboto" });
export const robotoMono = Roboto_Mono({ subsets: ["latin"], display: "swap", variable: "--font-mono" });
/** Drawn to sit with Roboto. Latin is included for the Noto card font; the UI takes Latin from Roboto. */
export const notoDevanagari = Noto_Sans_Devanagari({ subsets: ["devanagari", "latin"], display: "swap", preload: false, variable: "--font-devanagari" });
