// Unit checks for cardFit.ts against a real desk post: the 1080 × 1080 BREAKING NEWS card the desk posted on X
// at 08:24 IST on 13 Nov 2026 (dev-docs/breaking_news_cards/20261113_0824_2121074188870209764_1.jpg).
// The repo has no test runner; run with Node 22+ (type stripping) and a resolver that accepts extensionless
// TypeScript imports, as srt.test.ts:
//   node --import <register-ts-resolve.mjs> --test src/components/Newsroom/BreakingDesk/live/cardFit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_GAP_LINES, CARD_LINE, cardBlockTop, cardTextArea, largestFit, legacyTextArea } from "./cardFit";

// Advance widths at 100 px of every word on that card in the card face (Mardoto Bold for Latin letters and
// digits, Noto Sans Devanagari Bold for Hindi: cardFace.ts), measured in Chrome
const WIDTHS: Record<string, number> = {
  space: 24.902, "Jaipur:": 313.037, "अधिशाषी": 381.1, "अधिकारी": 369.4, "सुमेर": 183.1, "सिंह": 159.8,
  "मीणा": 204.4, "APO": 200.928, "नगर": 167.3, "पालिका": 306.5, "मण्डावर": 308.1, "(दौसा)": 259.161, "से": 73.8,
  "किया": 205.3, "कार्यमुक्त,": 385.963, "प्रशासनिक": 414.5, "कारणों": 266.3, "आदेशों": 276.1, "की": 112.4,
  "प्रतीक्षा": 261.9, "में": 65.2, "निदेशालय": 389.7, "मुख्यालय,": 381.463, "निदेशक": 306, "प्रतीक": 235.9,
  "चन्द्रशेखर": 365.9, "ने": 61.5, "जारी": 181.5, "किए": 173.1, "आदेश,": 271.163, "को": 112.4, "उपस्थिति": 350.6,
  "देने": 117.7, "के": 83, "निर्देश": 223,
};

const HEADLINE = "Jaipur: अधिशाषी अधिकारी सुमेर सिंह मीणा APO";
const BODY =
  "नगर पालिका मण्डावर (दौसा) से किया कार्यमुक्त, प्रशासनिक कारणों से आदेशों की प्रतीक्षा में निदेशालय किया मुख्यालय, निदेशक प्रतीक चन्द्रशेखर ने जारी किए आदेश, सुमेर सिंह मीणा को निदेशालय में उपस्थिति देने के निर्देश";

/** Greedy word wrap, as backgroundCard.wrap and cardRender.layoutLines do it */
function wrap(text: string, size: number, width: number): string[] {
  const k = size / 100;
  const lines: string[] = [];
  let line = "";
  let lineW = 0;
  for (const word of text.split(" ")) {
    const w = WIDTHS[word] * k;
    const next = line ? lineW + WIDTHS.space * k + w : w;
    if (line && next > width) {
      lines.push(line);
      line = word;
      lineW = w;
    } else {
      line = line ? `${line} ${word}` : word;
      lineW = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// The template's box on the 1080 square (org-card-seed.ts breaking-square), in px
const BOX = { x: 0.057 * 1080, y: 0.295 * 1080, w: 0.893 * 1080, h: 0.545 * 1080 };

test("the text area hangs over the box top and bottom in step with the type, with a narrow margin at the sides", () => {
  const none = cardTextArea(BOX);
  assert.equal(none.y, BOX.y);
  assert.equal(none.h, BOX.h);
  const a = cardTextArea(BOX, 48);
  const small = cardTextArea(BOX, 18);
  assert.ok(a.y < small.y && small.y < BOX.y);
  assert.ok(a.y + a.h > small.y + small.h && small.y + small.h > BOX.y + BOX.h);
  assert.ok(a.x > BOX.x && a.x + a.w < BOX.x + BOX.w);
  assert.ok(Math.abs(a.x + a.w / 2 - (BOX.x + BOX.w / 2)) < 1e-9);
  // Before the desk-post fit: 3% padding all round
  const old = legacyTextArea(BOX);
  assert.ok(Math.abs(old.y - (BOX.y + BOX.h * 0.03)) < 1e-9 && Math.abs(old.w - BOX.w * 0.94) < 1e-9);
});

test("the 08:24 story fits as on the desk's post: the desk's size, the same heading lines and line count, centred", () => {
  const column = cardTextArea(BOX);
  const at = (size: number) => {
    const head = wrap(HEADLINE, size, column.w);
    const body = wrap(BODY, size, column.w);
    return { head, body, height: (head.length + CARD_GAP_LINES + body.length) * size * CARD_LINE };
  };
  const size = largestFit(18, 72, (px) => cardTextArea(BOX, px).h, (px) => at(px).height);
  // The post: head bars 68 px apart, lines 1.38 sizes apart, so a 49.4 px face
  assert.equal(size, 49.5);
  assert.ok(Math.abs(49.5 * CARD_LINE - 68) < 1, `pitch ${49.5 * CARD_LINE}`);
  const { head, body, height } = at(49.5);
  // Two heading lines, one empty line, five story lines, as on the post
  assert.deepEqual(head, ["Jaipur: अधिशाषी अधिकारी सुमेर सिंह मीणा", "APO"]);
  assert.equal(body.length, 5);
  // As on the post, the block sits in the middle of the room: as much space above as below
  const area = cardTextArea(BOX, 49.5);
  const top = cardBlockTop(area, height);
  assert.ok(Math.abs(top - area.y - (area.y + area.h - (top + height))) < 1e-9);
});

test("cardBlockTop centres a block up and down, and a block that fills (or overfills) the area starts at its top", () => {
  const area = { x: 0, y: 100, w: 500, h: 400 };
  assert.equal(cardBlockTop(area, 200), 200);
  assert.equal(cardBlockTop(area, 400), 100);
  assert.equal(cardBlockTop(area, 450), 100);
});

test("largestFit takes the largest half-pixel size that fits, or null", () => {
  assert.equal(largestFit(10, 20, 100, (s) => s * 6), 16.5);
  assert.equal(largestFit(10, 20, 10, (s) => s * 6), null);
});
