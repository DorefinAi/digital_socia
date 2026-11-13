// Unit checks for the card's face (cardFace.ts) and heading (cardWords.ts). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CARD_FACES, CARD_FACE_SAMPLE } from "./cardFace";
import { cardBodyText, cardHeadlineText } from "./cardWords";

test("the card's font stack starts with Mardoto for Latin and Noto Sans Devanagari for Hindi", () => {
  assert.ok(CARD_FACES.startsWith(`"SociaMardoto", "SociaNotoDevanagari"`));
  // templateFonts.ts (next/font, not loadable here) builds the desk templates' face on CARD_FACES
  const fonts = readFileSync(new URL("./templateFonts.ts", import.meta.url), "utf8");
  assert.match(fonts, /export const MARDOTO_FAMILY = `\$\{CARD_FACES\}, /);
  // The sample loads both faces: Hindi letters and Latin
  assert.match(CARD_FACE_SAMPLE, /[ऀ-ॿ]/u);
  assert.match(CARD_FACE_SAMPLE, /[A-Za-z]/);
  // globals.css serves the bundled Noto file for Devanagari only
  const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
  const face = css.slice(css.indexOf(`font-family: "SociaNotoDevanagari"`));
  assert.match(face, /url\("\/fonts\/NotoSansDevanagari-Bold\.ttf"\)/);
  assert.match(face.slice(0, face.indexOf("}")), /unicode-range: U\+0900-097F/);
});

test("a heading that opens with its own place, in Hindi or English, gets no place in front (as on the desk's posts)", () => {
  // 13 Nov 12:19: the desk's card reads "अलवर के हल्दीना गांव में दर्दनाक हादसा", not "Alwar: अलवर के …"
  assert.equal(cardHeadlineText("अलवर के हल्दीना गांव में दर्दनाक हादसा", "Alwar", null), "अलवर के हल्दीना गांव में दर्दनाक हादसा");
  assert.equal(cardHeadlineText("जयपुर रेंज IG राहुल प्रकाश के निर्देशन में बड़ी कार्रवाई", "Jaipur", null), "जयपुर रेंज IG राहुल प्रकाश के निर्देशन में बड़ी कार्रवाई");
  // A Hindi spelling the district list gives as an alias
  assert.equal(cardHeadlineText("बाडमेर में तेज बारिश", "Barmer", null), "बाडमेर में तेज बारिश");
  // A shorter English spelling the backend also knows for the district
  assert.equal(cardHeadlineText("Kotputli में हाईवे जाम", "Kotputli-Behror", null), "Kotputli में हाईवे जाम");
  // The town, and the district in English
  assert.equal(cardHeadlineText("निवाई में तालाबी भूमि पर अवैध निर्माण", "Tonk", "निवाई"), "निवाई में तालाबी भूमि पर अवैध निर्माण");
  assert.equal(cardHeadlineText("Jaipur में मेट्रो का काम तेज", "Jaipur", null), "Jaipur में मेट्रो का काम तेज");
  // A card heading saved before, with the place doubled, loses the extra one on reopening
  assert.equal(cardHeadlineText("Alwar: अलवर के हल्दीना गांव में दर्दनाक हादसा", "Alwar", null), "अलवर के हल्दीना गांव में दर्दनाक हादसा");
});

test("a heading that does not open with its place still gets it in front, and a longer word is not mistaken for it", () => {
  assert.equal(cardHeadlineText("भामटसर में गैस टैंकर में रिसाव", "Bikaner", null), "Bikaner: भामटसर में गैस टैंकर में रिसाव");
  assert.equal(cardHeadlineText("#Bikaner: भामटसर में गैस टैंकर में रिसाव", "Bikaner", null), "Bikaner: भामटसर में गैस टैंकर में रिसाव");
  // "कोटपूतली" starts with "कोटा"'s letters only partly, and "Kotar" is not "Kota"
  assert.equal(cardHeadlineText("कोटड़ी में हादसा", "Kota", null), "Kota: कोटड़ी में हादसा");
  assert.equal(cardHeadlineText("Kotar village flooded", "Kota", null), "Kota: Kotar village flooded");
  // The story's own lead stays, with nothing in front
  assert.equal(cardHeadlineText("#BJP: प्रदेश कार्यकारिणी की बैठक", "Jaipur", null), "BJP: प्रदेश कार्यकारिणी की बैठक");
});


test("the card's story drops a reporter's joining dots at the start or middle of a point", () => {
  // "समिति, ...और त्रिनिदाद" in the source: the dots never go on the card, the words stay
  assert.equal(
    cardBodyText(["भगवान महावीर विकलांग सहायता समिति", "...और त्रिनिदाद सरकार के सहयोग से सेंटर की हुई शुरुआत"]),
    "भगवान महावीर विकलांग सहायता समिति, और त्रिनिदाद सरकार के सहयोग से सेंटर की हुई शुरुआत",
  );
  assert.equal(cardBodyText(["जयपुर फुट … और विकलांग सहायता"]), "जयपुर फुट और विकलांग सहायता");
  assert.equal(cardBodyText(["कार्यक्रम....उद्घाटन हुआ"]), "कार्यक्रम उद्घाटन हुआ");
});

test("the card's story keeps decimals, and a point that trails off keeps its dots", () => {
  assert.equal(cardBodyText(["1.39 करोड़ रुपए का बजट", "5.06 लाख"]), "1.39 करोड़ रुपए का बजट, 5.06 लाख");
  assert.equal(cardBodyText(["अब सवाल ये कि...", "विभाग के दावे सही"]), "अब सवाल ये कि... विभाग के दावे सही");
});
