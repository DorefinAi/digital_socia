// The card template switch button and the one starting design (storyThumbs.ts). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultOrgTemplate, nextOrgTemplate } from "./orgDefault";
import type { OrgCardTemplate } from "../../../../lib/socia/types";

const tpl = (slug: string, defaultFor: string[], width = 1080, height = 1080) => ({ slug, defaultFor, width, height }) as unknown as OrgCardTemplate;
// As on the live desk: the square BREAKING NEWS was the BIG Breaking default, the portrait बड़ी ख़बर the Breaking one
const breaking = tpl("breaking-square", ["big_breaking"]);
const big = tpl("badi-khabar", ["breaking"], 1080, 1350);

test("the switch moves to the next design and wraps round", () => {
  assert.equal(nextOrgTemplate([breaking, big], "breaking-square"), big);
  assert.equal(nextOrgTemplate([breaking, big], "badi-khabar"), breaking);
});
test("from your own background (no desk design) the switch goes to the first design", () => {
  assert.equal(nextOrgTemplate([breaking, big], "own"), breaking);
  assert.equal(nextOrgTemplate([breaking, big], null), breaking);
});
test("one design or none: no switch", () => {
  assert.equal(nextOrgTemplate([breaking], "breaking-square"), null);
  assert.equal(nextOrgTemplate([], null), null);
});
test("every story starts on the regular BREAKING NEWS square, whatever the default settings say", () => {
  assert.equal(defaultOrgTemplate([big, breaking]), breaking);
  // Renamed slug: still the square one
  const square = tpl("regular", []);
  assert.equal(defaultOrgTemplate([big, square]), square);
  assert.equal(defaultOrgTemplate([big]), big);
  assert.equal(defaultOrgTemplate([]), null);
});
