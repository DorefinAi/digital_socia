// Unit checks for paging.ts. Run with the repo's resolver (see package.json "test"):
//   node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs --test src/components/Newsroom/BreakingDesk/phase1/paging.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPage, PAGE_SIZE, pageCount, pageOf, pageRange, rangeLabel } from "./paging";

test("pages hold 50 rows", () => {
  assert.equal(PAGE_SIZE, 50);
});

test("page count: at least one page, rounded up", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(1), 1);
  assert.equal(pageCount(50), 1);
  assert.equal(pageCount(51), 2);
  assert.equal(pageCount(560), 12);
  assert.equal(pageCount(-3), 1);
});

test("clamp keeps the page inside the list", () => {
  assert.equal(clampPage(0, 560), 0);
  assert.equal(clampPage(11, 560), 11);
  assert.equal(clampPage(12, 560), 11);
  assert.equal(clampPage(-1, 560), 0);
  assert.equal(clampPage(3, 0), 0);
  assert.equal(clampPage(Number.NaN, 100), 0);
  // The last row of page 2 posted: 100 rows become 99 (still two pages), then 50 (one page)
  assert.equal(clampPage(1, 99), 1);
  assert.equal(clampPage(1, 50), 0);
});

test("pageOf: the page a row sits on", () => {
  assert.equal(pageOf(0), 0);
  assert.equal(pageOf(49), 0);
  assert.equal(pageOf(50), 1);
  assert.equal(pageOf(559), 11);
  assert.equal(pageOf(-1), 0);
});

test("pageRange: the rows a page shows", () => {
  assert.deepEqual(pageRange(0, 560), { start: 0, end: 50 });
  assert.deepEqual(pageRange(11, 560), { start: 550, end: 560 });
  assert.deepEqual(pageRange(99, 560), { start: 550, end: 560 });
  assert.deepEqual(pageRange(0, 0), { start: 0, end: 0 });
  assert.deepEqual(pageRange(0, 7, 5), { start: 0, end: 5 });
  assert.deepEqual(pageRange(1, 7, 5), { start: 5, end: 7 });
});

test("range label under the list", () => {
  assert.equal(rangeLabel(0, 560), "1–50 of 560");
  assert.equal(rangeLabel(1, 560), "51–100 of 560");
  assert.equal(rangeLabel(11, 560), "551–560 of 560");
  assert.equal(rangeLabel(0, 12), "1–12 of 12");
  assert.equal(rangeLabel(0, 0), "0 of 0");
});

test("every row is on exactly one page", () => {
  const total = 137;
  const seen: number[] = [];
  for (let p = 0; p < pageCount(total); p++) {
    const { start, end } = pageRange(p, total);
    for (let i = start; i < end; i++) {
      assert.equal(pageOf(i), p);
      seen.push(i);
    }
  }
  assert.deepEqual(seen, Array.from({ length: total }, (_, i) => i));
});
