// The @ / # lookup under the tag pickers: what is searched, the arrow keys, and which results are shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { moveHighlight, searchTerm, usableResults } from "./tagSearch";

test("searches what was typed without its leading @ or #", () => {
  assert.equal(searchTerm("@jaipur"), "jaipur");
  assert.equal(searchTerm("  ##Jai "), "Jai");
  assert.equal(searchTerm("रमेश  मीणा"), "रमेश मीणा");
  assert.equal(searchTerm("@"), "");
  assert.equal(searchTerm(""), "");
  assert.equal(searchTerm(undefined), "");
  assert.equal(searchTerm("x".repeat(101)), "");
  assert.equal(searchTerm("जय".normalize("NFD")), "जय".normalize("NFC"));
});

test("arrow keys wrap; no rows, no highlight", () => {
  assert.equal(moveHighlight(-1, 3, "ArrowDown"), 0);
  assert.equal(moveHighlight(2, 3, "ArrowDown"), 0);
  assert.equal(moveHighlight(0, 3, "ArrowUp"), 2);
  assert.equal(moveHighlight(-1, 3, "ArrowUp"), 2);
  assert.equal(moveHighlight(1, 3, "ArrowUp"), 0);
  assert.equal(moveHighlight(0, 0, "ArrowDown"), -1);
});

test("shows only well-formed results of the picker's kind, each once", () => {
  const items = [
    { value: "@JaipurPolice", name: "Jaipur police", nameHi: null, source: "file" },
    { value: "@jaipurpolice", name: "dup", nameHi: null, source: "directory" },
    { value: "#Jaipur", name: "Jaipur", nameHi: "जयपुर", source: "places" },
    { value: "@", name: "", nameHi: null, source: "file" },
    null,
    { name: "no value" },
  ];
  assert.deepEqual(usableResults(items, "@").map((r) => r.value), ["@JaipurPolice"]);
  assert.deepEqual(usableResults(items, "#").map((r) => r.value), ["#Jaipur"]);
  assert.deepEqual(usableResults({ items }, "@"), []);
  assert.deepEqual(usableResults(undefined, "#"), []);
});
