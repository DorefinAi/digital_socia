// Unit checks (run by npm test): GET /x/queue URL building with fields=list, and joining a 50-row inbox head.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueueItem, QueueResponse } from "./types";
import { mergeQueueHead, queuePath, type QueueDay } from "./queueDay";

const cap = { used: 0, limit: 800 } as unknown as QueueResponse["cap"];
const story = (id: string) => ({ id }) as unknown as QueueItem;
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `s${from + i}`);
const ids = (r: { items: QueueItem[] }) => r.items.map((i) => i.id);
const params = (path: string) => new URL(path, "http://x").searchParams;

test("fields=list goes on the query only when asked for", () => {
  const slim = params(queuePath("inbox", 50, { day: "2026-11-18" }, "t|s9", "list"));
  assert.equal(slim.get("view"), "inbox");
  assert.equal(slim.get("limit"), "50");
  assert.equal(slim.get("day"), "2026-11-18");
  assert.equal(slim.get("before"), "t|s9");
  assert.equal(slim.get("fields"), "list");
  assert.ok(queuePath("inbox", 50).startsWith("/x/queue?"));
  assert.equal(params(queuePath("inbox", 200)).has("fields"), false);
  assert.equal(params(queuePath("posted", 200, { big: true })).has("fields"), false);
  assert.equal(params(queuePath("posted", 200, { big: true })).get("big"), "true");
});

test("unset filters are left out", () => {
  const p = params(queuePath("inbox", 100, { district: "", big: undefined, needsCheck: false }));
  assert.deepEqual([...p.keys()].sort(), ["limit", "needsCheck", "view"]);
});

test("a 50-row head joins the held day: new stories on top, the rest kept in order", () => {
  // The day held 300 stories s0..s299 (newest first); 3 new ones arrived and s10 was posted
  const held: QueueDay = { cap, items: range(0, 300).map(story), nextCursor: null, truncated: false };
  const now = ["n0", "n1", "n2", ...range(0, 300).filter((id) => id !== "s10")];
  const head: QueueResponse = { cap, items: now.slice(0, 50).map(story), nextCursor: `t|${now[49]}` };
  const merged = mergeQueueHead(head, held);
  assert.ok(merged);
  assert.deepEqual(ids(merged), now);
  assert.equal(merged.nextCursor, null);
  assert.equal(merged.truncated, false);
});

test("more than 50 new stories in one tick: the head can't be joined, so the day is read again", () => {
  const held: QueueDay = { cap, items: range(0, 100).map(story), nextCursor: null, truncated: false };
  const head: QueueResponse = { cap, items: range(1000, 1050).map(story), nextCursor: "t|s1049" };
  assert.equal(mergeQueueHead(head, held), null);
});

test("a day of 50 or fewer: the head is the whole day", () => {
  const held: QueueDay = { cap, items: range(0, 60).map(story), nextCursor: null, truncated: true };
  const head: QueueResponse = { cap, items: range(0, 40).map(story), nextCursor: null };
  const merged = mergeQueueHead(head, held);
  assert.ok(merged);
  assert.deepEqual(ids(merged), range(0, 40));
  assert.equal(merged.truncated, false);
});
