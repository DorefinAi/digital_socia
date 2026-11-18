// Unit checks for pollEqual.ts (run by npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerKey, focusRefreshDelay, sameAsShown, FOCUS_JITTER_MS } from "./pollEqual";

test("the same data reads the same; any change does not", () => {
  const a = answerKey({ items: [{ id: "d1", headline: "x" }], truncated: false });
  assert.equal(a, answerKey({ items: [{ id: "d1", headline: "x" }], truncated: false }));
  assert.notEqual(a, answerKey({ items: [{ id: "d1", headline: "y" }], truncated: false }));
  assert.notEqual(answerKey([]), answerKey(null));
});

test("an answer that cannot be turned into a string is never the same", () => {
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  assert.equal(answerKey(loop), null);
  assert.equal(answerKey(undefined), null);
  assert.equal(sameAsShown({ key: "k", json: null, ok: true }, "k", null), false);
});

test("an unchanged answer is skipped only while it shows without an error, for the same key", () => {
  const json = answerKey({ n: 1 });
  assert.equal(sameAsShown(null, "k", json), false);
  assert.equal(sameAsShown({ key: "k", json, ok: true }, "k", json), true);
  // An error is on screen: the good answer must clear it even though the data reads the same
  assert.equal(sameAsShown({ key: "k", json, ok: false }, "k", json), false);
  // A different day or view
  assert.equal(sameAsShown({ key: "k", json, ok: true }, "k2", json), false);
  assert.equal(sameAsShown({ key: "k", json, ok: true }, "k", answerKey({ n: 2 })), false);
});

test("a focus right after an answer is skipped; otherwise it waits a spread-out moment", () => {
  assert.equal(focusRefreshDelay(10_000, 12_000, 5000), null);
  assert.equal(focusRefreshDelay(10_000, 12_500, 5000, () => 0), 0);
  assert.equal(focusRefreshDelay(null, 0, 5000, () => 0.5), FOCUS_JITTER_MS / 2);
  const most = focusRefreshDelay(null, 0, 5000, () => 0.9999);
  assert.ok(most !== null && most < FOCUS_JITTER_MS);
});
