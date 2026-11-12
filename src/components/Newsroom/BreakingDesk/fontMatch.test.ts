// Unit checks for fontMatch.ts (run by npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { findFont } from "./fontMatch";

// The menu's first entries as templateFonts.ts lists them
const FONTS = [
  { id: "mardoto", label: "Mardoto Bold" },
  { id: "mangal", label: "Mangal" },
  { id: "noto", label: "Noto Sans" },
  { id: "palanquin", label: "Palanquin Dark" },
];
const noto = FONTS[2];
const find = (id: string | undefined) => findFont(FONTS, id, noto).id;

test("Mardoto is found by its id and by the names a server may send", () => {
  for (const name of ["mardoto", "Mardoto", "Mardoto Bold", "Mardoto-Bold", "mardoto_bold", "MARDOTO BOLD", " Mardoto Bold "]) assert.equal(find(name), "mardoto", name);
});

test("other fonts by id or label; unset, empty and unknown names fall back to Noto Sans", () => {
  assert.equal(find("mangal"), "mangal");
  assert.equal(find("Palanquin Dark"), "palanquin");
  assert.equal(find("noto-sans"), "noto");
  assert.equal(find(undefined), "noto");
  assert.equal(find(""), "noto");
  assert.equal(find("Bold"), "noto");
  assert.equal(find("Comic Sans"), "noto");
});
