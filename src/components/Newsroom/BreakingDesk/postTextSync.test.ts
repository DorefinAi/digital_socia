// Unit checks for postTextSync.ts. Run with Node 22+ (type stripping) and the resolver that accepts
// extensionless TypeScript imports:
//   node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs --test src/components/Newsroom/BreakingDesk/postTextSync.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { putText, takeTyped, typedAhead, type BoxText } from "./postTextSync";

const start: BoxText = { text: "Jaipur", nonce: 0 };

test("typing on the current text is taken and keeps the nonce", () => {
  const next = takeTyped(start, "Jaipur rain", 0);
  assert.deepEqual(next, { text: "Jaipur rain", nonce: 0 });
});

test("typing that matches the editor's text changes nothing (same object, no re-render)", () => {
  assert.equal(takeTyped(start, "Jaipur", 0), start);
});

test("the editor putting text bumps the nonce, even for the same words", () => {
  assert.deepEqual(putText(start, "Undo"), { text: "Undo", nonce: 1 });
  assert.deepEqual(putText(start, "Jaipur"), { text: "Jaipur", nonce: 1 });
});

test("a late hand-up typed before the editor put text is dropped (story switch, undo, picker)", () => {
  const switched = putText(start, "Next story");
  assert.equal(takeTyped(switched, "Jaipur rai", 0), switched);
});

test("updates applied in either order end on the editor's text when it was put last", () => {
  // React may replay a deferred hand-up before a story switch queued after it: the switch still wins
  const replayed = putText(takeTyped(start, "Jaipur ra", 0), "Next story");
  assert.deepEqual(replayed, { text: "Next story", nonce: 1 });
  // Typing after the switch rides on the new nonce
  assert.deepEqual(takeTyped(replayed, "Next story!", 1), { text: "Next story!", nonce: 1 });
});

test("Devanagari typing is handed up whole, code units untouched", () => {
  const hindi = "जयपुर में बारिश";
  assert.deepEqual(takeTyped(start, hindi, 0), { text: hindi, nonce: 0 });
});

test("typedAhead says when an action must hand the typing up first", () => {
  assert.equal(typedAhead("abc", "abc"), false);
  assert.equal(typedAhead("abcd", "abc"), true);
  assert.equal(typedAhead("", "abc"), true);
});
