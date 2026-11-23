// The card's copy of the spelling-tolerant place matcher must agree with the backend's (packages/core place-match.ts) on
// the shared case list (b9 B4/B6). Run with npm test. The backend checkout is ../backend next to this one, or
// SOCIA_BACKEND_DIR; without either the shared list is skipped and the local cases below still run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openingPlaceLength, placeMatchKey } from "./cardWords";

const backend = process.env.SOCIA_BACKEND_DIR ?? fileURLToPath(new URL("../../../../../backend", import.meta.url));
const shared = join(backend, "packages/core/test/fixtures/place-match-cases.json");

test("the shared place-match cases give the backend's answers", { skip: !existsSync(shared) && `no backend checkout at ${backend}` }, () => {
  const { cases } = JSON.parse(readFileSync(shared, "utf8")) as { cases: { headline: string; names: string[]; length: number }[] };
  assert.ok(cases.length >= 10);
  for (const c of cases) assert.equal(openingPlaceLength(c.headline, c.names), c.length, `${c.headline} / ${c.names.join(" | ")}`);
});

test("spelling variants match: nasal, half nasal, nukta, vowel length, joiners, spacing", () => {
  assert.equal(placeMatchKey("नैनवा"), placeMatchKey("नैनवां"));
  assert.equal(placeMatchKey("बून्दी"), placeMatchKey("बूंदी"));
  assert.equal(placeMatchKey("बड़ी सादड़ी"), placeMatchKey("बड़ीसादड़ी"));
  assert.equal(placeMatchKey("बड़ी‌सादड़ी"), placeMatchKey("बड़ीसादड़ी"));
  assert.equal(openingPlaceLength("नैनवा में मेला", ["नैनवां"]), 5);
  assert.equal(openingPlaceLength("जयपुरिया अस्पताल", ["जयपुर"]), 0);
});
