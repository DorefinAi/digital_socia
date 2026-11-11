// Unit checks for cardFit.ts against a real desk post: the 1080 × 1080 BREAKING NEWS card of the Dag story.
// The repo has no test runner; run with Node 22+ (type stripping) and a resolver that accepts extensionless
// TypeScript imports, as srt.test.ts:
//   node --import <register-ts-resolve.mjs> --test src/components/Newsroom/BreakingDesk/live/cardFit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_GAP_LINES, CARD_LINE, cardTextArea, largestFit, legacyTextArea } from "./cardFit";

// Advance widths at 100 px of every word on that card in bold Mangal (Latin comma and space from Arial, as
// the card's font stack falls through), measured in Chrome
const WIDTHS: Record<string, number> = {
  space: 27.783, "डग:": 157.813, "विद्युत": 282.91, "विभाग": 260.059, "की": 104.297, "बड़ी": 140.82, "लापरवाही,": 400.635,
  "बड़ा": 140.82, "हादसा": 237.402, "टला": 156.543, "डग": 124.512, "कस्बे": 195.605, "के": 78.223, "नाई": 148.633,
  "मोहल्ले": 284.375, "में": 73.047, "देर": 104.297, "रात": 139.453, "तार": 139.453, "टूटने": 182.617, "से": 73.047,
  "मची": 169.531, "अफरा": 229.395, "तफरी,": 245.459, "गनीमत": 303.125, "रही": 127.734, "चलते": 209.961, "आवाजाही": 376.074,
  "नहीं": 148.633, "थी,": 124.268, "वरना": 200.684, "दो": 83.496, "घंटे": 125.195, "पहले": 187.793, "सैकड़ों": 232.129,
  "लोग": 168.848, "कर": 125.098, "रहे": 101.66, "थे": 70.41, "आतिशबाजी,": 493.701, "लोगों": 194.922, "ने": 67.773,
  "बदलने": 258.203, "अपील": 237.305,
};
/** Head bar's top above the line's middle (textBaseline "middle"), in font sizes: bold Mangal's क */
const BAR_ABOVE_MIDDLE = 0.3642;

const HEADLINE = "डग: विद्युत विभाग की बड़ी लापरवाही, बड़ा हादसा टला";
const BODY = "डग कस्बे के नाई मोहल्ले में देर रात विद्युत तार टूटने से मची अफरा तफरी, गनीमत रही रात के चलते आवाजाही नहीं थी, वरना दो घंटे पहले सैकड़ों लोग कर रहे थे आतिशबाजी, लोगों ने की विद्युत विभाग से तार बदलने की अपील";

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
const BOX = { x: 0.085 * 1080, y: 0.285 * 1080, w: 0.83 * 1080, h: 0.56 * 1080 };

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

test("the Dag story fits as on the desk's post: 48 px, heading at the top, lines 71.5 px apart", () => {
  const column = cardTextArea(BOX);
  const at = (size: number) => {
    const head = wrap(HEADLINE, size, column.w);
    const body = wrap(BODY, size, column.w);
    return { head, body, height: (head.length + CARD_GAP_LINES + body.length) * size * CARD_LINE };
  };
  const size = largestFit(18, 72, (px) => cardTextArea(BOX, px).h, (px) => at(px).height);
  assert.equal(size, 48);
  const a = cardTextArea(BOX, 48);
  const { head, body } = at(48);
  const pitch = 48 * CARD_LINE;
  // The post: head bars 71.5 px apart, the first at y = 311
  assert.ok(Math.abs(pitch - 71.5) < 0.3, `pitch ${pitch}`);
  const firstBar = a.y + pitch / 2 - BAR_ABOVE_MIDDLE * 48;
  assert.ok(Math.abs(firstBar - 311) < 1.5, `first head bar at ${firstBar}`);
  // Two heading lines, one empty line, six story lines, as on the post
  assert.deepEqual(head, ["डग: विद्युत विभाग की बड़ी लापरवाही, बड़ा", "हादसा टला"]);
  assert.equal(body.length, 6);
  // Mangal is wider than the post's face in places, so "तार" and "रात" move down a line; from "पहले" on
  // the story breaks exactly as on the post
  assert.deepEqual(body.slice(3), ["पहले सैकड़ों लोग कर रहे थे आतिशबाजी,", "लोगों ने की विद्युत विभाग से तार बदलने की", "अपील"]);
});

test("largestFit takes the largest half-pixel size that fits, or null", () => {
  assert.equal(largestFit(10, 20, 100, (s) => s * 6), 16.5);
  assert.equal(largestFit(10, 20, 10, (s) => s * 6), null);
});
