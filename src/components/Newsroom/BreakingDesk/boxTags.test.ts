import { test } from "node:test";
import assert from "node:assert/strict";
import { notInText, replaceToken, tokenAtCaret } from "./tagSearch";

test("finds the @ word at the caret", () => {
  assert.deepEqual(tokenAtCaret("hello @raj", 10), { prefix: "@", start: 6, end: 10, query: "raj" });
  assert.deepEqual(tokenAtCaret("#जय", 3), { prefix: "#", start: 0, end: 3, query: "जय" });
});
test("no list for a lone sign, a mid-word sign, or after a space", () => {
  assert.equal(tokenAtCaret("hi @", 4), null);
  assert.equal(tokenAtCaret("mail@raj", 8), null);
  assert.equal(tokenAtCaret("@raj ", 5), null);
});
test("replaces only the typed word and adds a space", () => {
  const tag = tokenAtCaret("a #raj b", 6)!;
  assert.deepEqual(replaceToken("a #raj b", tag, "#Rajasthan"), { text: "a #Rajasthan b", caret: 13 });
  const end = tokenAtCaret("go @cm", 6)!;
  assert.deepEqual(replaceToken("go @cm", end, "@CMOfficeRaj"), { text: "go @CMOfficeRaj ", caret: 16 });
});
test("a caret inside the word replaces the whole word", () => {
  const tag = tokenAtCaret("x #raj y", 5)!;
  assert.deepEqual(tag, { prefix: "#", start: 2, end: 6, query: "ra" });
  assert.deepEqual(replaceToken("x #raj y", tag, "#Rajasthan"), { text: "x #Rajasthan y", caret: 13 });
  // The caret lands after the space: no word there, so the list stays closed
  assert.equal(tokenAtCaret("x #Rajasthan y", 13), null);
});
test("a Hindi tag already in the post is skipped", () => {
  const items = [{ value: "#जयपुर", name: "", nameHi: null, source: "directory" }, { value: "#जोधपुर", name: "", nameHi: null, source: "directory" }] as never;
  assert.deepEqual(notInText(items, "खबर #जयपुर").map((i: { value: string }) => i.value), ["#जोधपुर"]);
});
test("skips tags already in the post", () => {
  const items = [{ value: "#Jaipur", name: "", nameHi: null, source: "directory" }, { value: "#Jodhpur", name: "", nameHi: null, source: "directory" }] as never;
  assert.deepEqual(notInText(items, "news #jaipur #jo").map((i: { value: string }) => i.value), ["#Jodhpur"]);
});
