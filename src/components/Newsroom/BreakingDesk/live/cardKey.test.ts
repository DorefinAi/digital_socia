// Unit checks for cardKey.ts (run by npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawableCardTemplate } from "@/lib/socia/types";
import { backgroundCardKey, keyScope } from "./cardKey";

const template = { backgroundUrl: "/files/bg.png", updatedAt: "2026-11-12T10:00:00Z", width: 1080, height: 1080, layout: { date: null } } as unknown as DrawableCardTemplate;

test("a drawing's key gives back the draft it was drawn for", () => {
  const key = backgroundCardKey("draft-42", template, "Date:12/11/2026", "हेडलाइन", "story");
  assert.equal(keyScope(key), "draft-42");
  assert.notEqual(keyScope(backgroundCardKey("draft-7", template, null, "a", "b")), "draft-42");
});

test("keyScope reads nothing from keys it did not make", () => {
  assert.equal(keyScope(""), null);
  assert.equal(keyScope("not json"), null);
  assert.equal(keyScope(JSON.stringify({ scope: "x" })), null);
  assert.equal(keyScope(JSON.stringify([3])), null);
});
