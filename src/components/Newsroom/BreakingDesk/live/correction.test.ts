// Unit checks for correction.ts (run by npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CORRECTION_MISSING,
  STORY_GONE,
  canCorrect,
  correctionBanner,
  correctionErrorText,
  correctionOpen,
  editedLabel,
  fixedByOther,
  isCorrecting,
  istClock,
  needsCheckDescription,
  runEditFlow,
  takenBack,
} from "./correction";

const mine = { userId: "u1", name: "Asha", until: "", mine: true };
const theirs = { ...mine, userId: "u2", name: "Ravi", mine: false };

test("istClock reads the time in IST, 24-hour", () => {
  assert.equal(istClock("2026-11-13T14:02:00Z"), "19:32");
  assert.equal(istClock("2026-11-13T18:45:00Z"), "00:15");
  assert.equal(istClock(null), "");
  assert.equal(istClock("not a date"), "");
});

test("Edit shows only when the server says the story can be fixed", () => {
  assert.equal(canCorrect({ canCorrect: true }), true);
  assert.equal(canCorrect({ canCorrect: false }), false);
  // An older server leaves the field out: no Edit
  assert.equal(canCorrect({}), false);
  assert.equal(canCorrect(null), false);
});

test("a posted draft held by this person is a correction; held by someone else, they are fixing it", () => {
  assert.equal(isCorrecting({ status: "published", claim: mine }), true);
  assert.equal(isCorrecting({ status: "published", claim: theirs }), false);
  assert.equal(isCorrecting({ status: "published", claim: null }), false);
  assert.equal(isCorrecting({ status: "claimed", claim: mine }), false);
  assert.equal(fixedByOther({ status: "published", claim: theirs }), "Ravi");
  assert.equal(fixedByOther({ status: "published", claim: mine }), null);
  assert.equal(fixedByOther({ status: "claimed", claim: theirs }), null);
});

test("fix mode needs Edit pressed and canCorrect true; an unusable hold from Edit is ended", () => {
  const held = { status: "published" as const, claim: mine };
  assert.deepEqual(correctionOpen({ ...held, canCorrect: true }, true), { fix: true, endHold: false });
  // Opened from a link, ?story= or the Posted list: read-only, and a hold of theirs is left alone
  assert.deepEqual(correctionOpen({ ...held, canCorrect: true }, false), { fix: false, endHold: false });
  // canCorrect missing (older server) or false: no fix mode, and the hold Edit took is ended
  assert.deepEqual(correctionOpen(held, true), { fix: false, endHold: true });
  assert.deepEqual(correctionOpen({ ...held, canCorrect: false }, true), { fix: false, endHold: true });
  // The draft didn't load, or the post was undone in between
  assert.deepEqual(correctionOpen(null, true), { fix: false, endHold: true });
  assert.deepEqual(correctionOpen({ status: "ready", claim: null, canCorrect: true }, true), { fix: false, endHold: true });
  assert.deepEqual(correctionOpen(null, false), { fix: false, endHold: false });
});

test("Edit leaves the open story, then takes the hold, then opens", async () => {
  const calls: string[] = [];
  const error = await runEditFlow({
    leave: async () => (calls.push("leave"), true),
    start: async () => (calls.push("start"), null),
    open: () => void calls.push("open"),
    abandon: async () => calls.push("abandon"),
  });
  assert.equal(error, null);
  assert.deepEqual(calls, ["leave", "start", "open"]);
});

test("staying on the open story takes no hold; a refused hold opens nothing", async () => {
  const calls: string[] = [];
  const steps = {
    start: async () => (calls.push("start"), null),
    open: () => void calls.push("open"),
    abandon: async () => calls.push("abandon"),
  };
  assert.equal(await runEditFlow({ ...steps, leave: async () => false }), null);
  assert.deepEqual(calls, []);
  const refused = await runEditFlow({ ...steps, leave: async () => true, start: async () => "Ravi is fixing this post." });
  assert.equal(refused, "Ravi is fixing this post.");
  assert.deepEqual(calls, []);
});

test("a failed switch after the hold ends it at once, so nobody is left 'editing'", async () => {
  const held = new Set<string>();
  const error = await runEditFlow({
    leave: async () => true,
    start: async () => (held.add("d1"), null),
    open: () => {
      throw new Error("switch failed");
    },
    abandon: async () => held.delete("d1"),
  });
  assert.equal(error, "The story didn't open for editing. Try again.");
  assert.equal(held.size, 0);
});

test("Done tells an undone post from other failures", () => {
  assert.equal(takenBack("invalid_state", null), true);
  assert.equal(takenBack("lease_lost", "ready"), true);
  // Still posted: the hold only ran out
  assert.equal(takenBack("lease_lost", "published"), false);
  assert.equal(takenBack("lease_lost", null), false);
  assert.equal(takenBack("post_invalid", "ready"), false);
});

test("editedLabel says who fixed it and when", () => {
  assert.equal(editedLabel({ at: "2026-11-13T14:10:00Z", by: { id: "u1", name: "Asha" } }), "Edited by Asha at 19:40");
  assert.equal(editedLabel({ at: "2026-11-13T14:10:00Z", by: null }), "Edited at 19:40");
  assert.equal(editedLabel(null), null);
  assert.equal(editedLabel(undefined), null);
});

test("the banner names the poster, from the correction record or the posted mark", () => {
  const tail = " Fixing it here doesn't post again: copy the fixed text and edit or replace the tweet on X.";
  const correction = { postedAt: "2026-11-13T14:02:00Z", postedBy: { id: "u1", name: "Asha" }, correctedAt: null, correctedBy: null };
  assert.equal(correctionBanner({ correction }), `Already posted at 19:32 by Asha.${tail}`);
  assert.equal(correctionBanner({ correction: null, posted: { at: "2026-11-13T14:02:00Z", by: { id: "u2", name: "Ravi" }, undoUntil: "" } }), `Already posted at 19:32 by Ravi.${tail}`);
  assert.equal(correctionBanner({ correction: { ...correction, postedBy: null } }), `Already posted at 19:32.${tail}`);
  assert.equal(correctionBanner({}), `Already posted.${tail}`);
});

test("correction errors read as sentences; only a 404 without a code means no corrections on the server", () => {
  assert.equal(correctionErrorText(404, "not_found", "Not found"), STORY_GONE);
  assert.equal(correctionErrorText(404, "server", "The server answered 404."), CORRECTION_MISSING);
  assert.equal(correctionErrorText(404, null, null), CORRECTION_MISSING);
  assert.equal(correctionErrorText(403, "forbidden", "Only the person who posted it or an admin can edit a posted story."), "Only the person who posted it or an admin can edit a posted story.");
  assert.equal(correctionErrorText(409, "too_late", "This post is from yesterday and can't be edited."), "This post is from yesterday and can't be edited.");
  assert.equal(correctionErrorText(409, "too_late", ""), "This post is from yesterday and can't be edited.");
  assert.equal(correctionErrorText(409, "held_by_other", "Held", "Ravi"), "Ravi is fixing this post.");
  assert.equal(correctionErrorText(409, "held_by_other", null), "Someone else is fixing this post.");
  assert.equal(correctionErrorText(null, null, null), "The story didn't open for editing. Try again.");
});

test("needs-check reasons read as label and hint", () => {
  const label = (c: string) => ({ a: "No district, check", b: "No headline" })[c] ?? c;
  const hint = (c: string) => (c === "a" ? "Add a #District tag." : null);
  assert.equal(needsCheckDescription(["a", "b"], label, hint), "Needs a check: No district, check. Add a #District tag. No headline.");
  assert.equal(needsCheckDescription([], label, hint), "");
});
