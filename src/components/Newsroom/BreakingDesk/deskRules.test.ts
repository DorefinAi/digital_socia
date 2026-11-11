// Unit checks for deskRules.ts. The repo has no test runner; run with Node 22+ (type stripping) and the resolver
// that accepts extensionless TypeScript imports:
//   node --import ./src/components/Newsroom/BreakingDesk/video/timeline/__checks__/resolve-ts.mjs --test src/components/Newsroom/BreakingDesk/deskRules.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { adjacentStory, ageTone, counterTone, dayChipLabel, dayKey, isDayKey, istDay, steppedTextSize, storyAfterPosted, textSizePreset, workableOrder } from "./deskRules";

const now = Date.parse("2026-11-11T07:13:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("age dot: green under 5 minutes, amber under 30, grey after", () => {
  assert.equal(ageTone(ago(0), now), "fresh");
  assert.equal(ageTone(ago(299_999), now), "fresh");
  assert.equal(ageTone(ago(300_000), now), "recent");
  assert.equal(ageTone(ago(1_799_999), now), "recent");
  assert.equal(ageTone(ago(1_800_000), now), "old");
});

test("X counter: amber from 260, red at 280 and over", () => {
  assert.equal(counterTone(259, 280, true), "success");
  assert.equal(counterTone(260, 280, true), "warning");
  assert.equal(counterTone(279, 280, true), "warning");
  assert.equal(counterTone(280, 280, true), "error");
  assert.equal(counterTone(281, 280, true), "error");
  // Other platforms warn at 90% of their limit
  assert.equal(counterTone(1979, 2200, false), "success");
  assert.equal(counterTone(1980, 2200, false), "warning");
});

test("date chip reads 11th Nov, with 1st, 2nd, 3rd and the teens as th", () => {
  assert.equal(dayChipLabel("2026-11-11"), "11th Nov");
  assert.equal(dayChipLabel("2026-11-01"), "1st Nov");
  assert.equal(dayChipLabel("2026-11-02"), "2nd Nov");
  assert.equal(dayChipLabel("2026-11-03"), "3rd Nov");
  assert.equal(dayChipLabel("2026-11-12"), "12th Nov");
  assert.equal(dayChipLabel("2026-11-13"), "13th Nov");
  assert.equal(dayChipLabel("2026-11-21"), "21st Nov");
  assert.equal(dayChipLabel("2026-11-22"), "22nd Nov");
  assert.equal(dayChipLabel("2026-11-23"), "23rd Nov");
  assert.equal(dayChipLabel("2026-09-30"), "30th Sep");
  assert.equal(dayChipLabel("not a day"), "not a day");
  assert.equal(dayChipLabel("2026-02-30"), "2026-02-30");
});

test("days are India days whatever the browser's zone, and bad times give none", () => {
  // 18:29 UTC is 23:59 IST; 18:30 UTC is midnight IST, the next day
  assert.equal(istDay("2026-11-10T18:29:00Z"), "2026-11-10");
  assert.equal(istDay("2026-11-10T18:30:00Z"), "2026-11-11");
  assert.equal(istDay(Date.parse("2026-11-11T07:13:00Z")), "2026-11-11");
  assert.equal(istDay("not a time"), null);
  assert.equal(istDay(""), null);
});

test("day keys: only real calendar days in YYYY-MM-DD", () => {
  assert.equal(isDayKey("2026-11-09"), true);
  assert.equal(isDayKey("2028-02-29"), true);
  assert.equal(isDayKey("2026-02-29"), false);
  assert.equal(isDayKey("2026-13-01"), false);
  assert.equal(isDayKey("2026-1-9"), false);
  assert.equal(isDayKey(""), false);
  assert.equal(dayKey(2026, 11, 9), "2026-11-09");
});

test("prev / next walk the queue's own order without wrapping", () => {
  const order = [{ id: "third" }, { id: "first" }, { id: "second" }];
  assert.equal(adjacentStory(order, "first", -1)?.id, "third");
  assert.equal(adjacentStory(order, "first", 1)?.id, "second");
  assert.equal(adjacentStory(order, "third", -1), undefined);
  assert.equal(adjacentStory(order, "second", 1), undefined);
  assert.equal(adjacentStory(order, "not listed", 1), undefined);
});

test("after Copy & Mark Posted: the next story, the one before at the end, none when it was the last", () => {
  const order = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(storyAfterPosted(order, "a")?.id, "b");
  assert.equal(storyAfterPosted(order, "b")?.id, "c");
  assert.equal(storyAfterPosted(order, "c")?.id, "b");
  assert.equal(storyAfterPosted([{ id: "a" }], "a"), undefined);
  assert.equal(storyAfterPosted(order, "gone"), undefined);
});

test("text size steps 10% within bounds, and S / M / L presets", () => {
  assert.equal(steppedTextSize(1, 1, 0.5, 1.8, 0.01), 1.1);
  assert.equal(steppedTextSize(1, -1, 0.5, 1.8, 0.01), 0.9);
  assert.equal(steppedTextSize(1.8, 1, 0.5, 1.8, 0.01), 1.8);
  assert.equal(steppedTextSize(0.5, -1, 0.5, 1.8, 0.01), 0.5);
  assert.deepEqual((["S", "M", "L"] as const).map((p) => textSizePreset(p, 0.5, 1.8)), [0.8, 1, 1.2]);
  assert.deepEqual((["S", "M", "L"] as const).map((p) => textSizePreset(p, 16, 240)), [32, 48, 72]);
});

test("prev / next and the story after posting step over stories someone else holds", () => {
  const order = [{ id: "a" }, { id: "held" }, { id: "b" }, { id: "c" }];
  const held = (s: { id: string }) => s.id === "held";
  assert.equal(adjacentStory(workableOrder(order, "a", held), "a", 1)?.id, "b");
  assert.equal(adjacentStory(workableOrder(order, "b", held), "b", -1)?.id, "a");
  assert.equal(storyAfterPosted(workableOrder(order, "a", held), "a")?.id, "b");
  // The open story stays in the order even if it reads as held
  assert.equal(adjacentStory(workableOrder(order, "held", held), "held", 1)?.id, "b");
  assert.equal(storyAfterPosted(workableOrder([{ id: "a" }, { id: "held" }], "a", held), "a"), undefined);
});
