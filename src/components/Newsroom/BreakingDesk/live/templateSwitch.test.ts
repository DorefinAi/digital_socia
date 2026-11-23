// The card template switch button and the one starting design (storyThumbs.ts). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultOrgTemplate, nextOrgTemplate } from "./orgDefault";
import type { OrgCardTemplate } from "../../../../lib/socia/types";

const tpl = (slug: string, defaultFor: string[]) => ({ slug, defaultFor }) as unknown as OrgCardTemplate;
const breaking = tpl("breaking-news", ["breaking"]);
const big = tpl("badi-khabar", ["big_breaking"]);

test("the switch moves to the next design and wraps round", () => {
  assert.equal(nextOrgTemplate([breaking, big], "breaking-news"), big);
  assert.equal(nextOrgTemplate([breaking, big], "badi-khabar"), breaking);
});
test("from your own background (no desk design) the switch goes to the first design", () => {
  assert.equal(nextOrgTemplate([breaking, big], "own"), breaking);
  assert.equal(nextOrgTemplate([breaking, big], null), breaking);
});
test("one design or none: no switch", () => {
  assert.equal(nextOrgTemplate([breaking], "breaking-news"), null);
  assert.equal(nextOrgTemplate([], null), null);
});
test("every story starts on the Breaking design, whatever its tag", () => {
  assert.equal(defaultOrgTemplate([big, breaking]), breaking);
  assert.equal(defaultOrgTemplate([big]), big);
  assert.equal(defaultOrgTemplate([]), null);
});
