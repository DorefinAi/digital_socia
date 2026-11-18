// Unit checks for the FTP feed's row count beside the editor (feedRows.ts). Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { feedRowsShown } from "./feedRows";

test("a short list shows every row", () => {
  assert.equal(feedRowsShown(50, 0, -1), 0);
  assert.equal(feedRowsShown(50, 12, 3), 12);
  assert.equal(feedRowsShown(50, 50, 49), 50);
});

test("a long list starts at one page and grows a page per Show more", () => {
  assert.equal(feedRowsShown(50, 572, -1), 50);
  assert.equal(feedRowsShown(100, 572, -1), 100);
  assert.equal(feedRowsShown(600, 572, -1), 572);
});

test("the open story's page is always drawn", () => {
  assert.equal(feedRowsShown(50, 572, 0), 50);
  assert.equal(feedRowsShown(50, 572, 50), 100);
  assert.equal(feedRowsShown(50, 572, 120), 150);
  assert.equal(feedRowsShown(50, 572, 571), 572);
  // Shown further already: the open story doesn't shrink it
  assert.equal(feedRowsShown(200, 572, 10), 200);
});

test("a limit under a page still shows a page", () => {
  assert.equal(feedRowsShown(0, 572, -1), 50);
  assert.equal(feedRowsShown(10, 30, -1), 30, "never past the list");
});
