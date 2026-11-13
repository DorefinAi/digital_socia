// The desk templates' card face, kept apart from templateFonts.ts (which loads next/font) so tests can read it.
//
// Mardoto Bold (globals.css "SociaMardoto") has Latin letters and digits only; the Hindi letters come from Noto
// Sans Devanagari Bold (globals.css "SociaNotoDevanagari", bundled), the face the desk's own posted cards show.
// Mardoto stays first: the browser takes each letter from the first face that has it.

export const CARD_FACES = `"SociaMardoto", "SociaNotoDevanagari"`;

/** Latin, digits and Hindi: loading this sample fetches both card faces before anything is measured */
export const CARD_FACE_SAMPLE = "क ख A 1";
