// Unit checks for reporterLabel.ts. Run with the repo's "npm test".
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeLine, reporterWithDistrict } from "./reporterLabel";

test("reporter with the story's district, name exactly as in the file", () => {
  assert.equal(reporterWithDistrict("BHANWAR", "Rajsamand"), "BHANWAR (Rajsamand)");
  assert.equal(reporterWithDistrict("  BHANWAR ", " Rajsamand "), "BHANWAR (Rajsamand)");
  assert.equal(reporterWithDistrict("Bhanwar", "Rajsamand"), "Bhanwar (Rajsamand)");
});

test("no district: the name alone; no reporter: nothing", () => {
  assert.equal(reporterWithDistrict("BHANWAR", null), "BHANWAR");
  assert.equal(reporterWithDistrict("BHANWAR", "none"), "BHANWAR");
  assert.equal(reporterWithDistrict(null, "Rajsamand"), "");
  assert.equal(reporterWithDistrict("  ", "Rajsamand"), "");
  assert.equal(reporterWithDistrict(undefined, undefined), "");
});

test("place line: district and town, whichever are there", () => {
  assert.equal(placeLine("Rajsamand", "रेलमगरा"), "Rajsamand · रेलमगरा");
  assert.equal(placeLine(null, "रेलमगरा"), "रेलमगरा");
  assert.equal(placeLine("Rajsamand", ""), "Rajsamand");
  assert.equal(placeLine(undefined, null), "");
});
