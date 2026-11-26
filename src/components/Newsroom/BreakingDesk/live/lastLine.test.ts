// The card's last-line rule (owner, 27 Nov 2026): never a last line of one or two words. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LAST_LINE_MIN_WIDTH, LAST_LINE_MIN_WORDS, lastLineWidth, wrapCounts } from "./lastLine";

const SPACE = 10;
const words = (n: number, w = 50) => Array.from({ length: n }, () => w);

test("a last line of one or two words: the column narrows until it carries three", () => {
  // 7 words of 50 at 340: 5 + 2 (the last line is two words); narrowed, 4 + 3
  assert.deepEqual(wrapCounts(words(7), SPACE, 340), [5, 2]);
  const w = lastLineWidth(words(7), SPACE, 340);
  assert.ok(w < 340 && w >= 340 * LAST_LINE_MIN_WIDTH, `${w}`);
  assert.deepEqual(wrapCounts(words(7), SPACE, w), [4, 3]);
  // 6 + 1 at 360: a fix would need the column under 85% (4 per line), so it is left as it was
  assert.deepEqual(wrapCounts(words(7), SPACE, 360), [6, 1]);
  assert.equal(lastLineWidth(words(7), SPACE, 360), 360);
});

test("a card that already ends on three words or more is unchanged", () => {
  assert.equal(lastLineWidth(words(9), SPACE, 340), 340); // 6 + 3
  assert.equal(lastLineWidth(words(5), SPACE, 340), 340); // one line
});

test("a block that cannot be fixed within 85% stays as it was", () => {
  // 13 words at 340: 6 + 6 + 1; at 85% (289) still 5 + 5 + 3? check the rule only returns a width that works, else 340
  const w = lastLineWidth(words(13), SPACE, 340);
  const counts = wrapCounts(words(13), SPACE, w);
  assert.ok(w === 340 || counts.at(-1)! >= LAST_LINE_MIN_WORDS);
  // Two long words and one short: no narrower column within 85% gives three on the last line
  const stuck = [160, 160, 20];
  assert.equal(lastLineWidth(stuck, SPACE, 340), 340);
});

test("never narrows past a word wider than the column", () => {
  const wide = [330, 50, 50, 50, 50, 50, 50, 50];
  assert.equal(lastLineWidth(wide, SPACE, 340), 340);
});
