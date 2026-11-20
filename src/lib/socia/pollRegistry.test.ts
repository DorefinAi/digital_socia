// Unit checks for pollRegistry.ts and the hidden-tab refresh rule in liveCore.ts (run by npm test): a server push
// of "queue.changed" refreshes the queue pollers by key, also while the tab is hidden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPollRegistry, QUEUE_POLL_KEYS } from "./pollRegistry";
import { backgroundRefresh, QUEUE_EVENTS, refreshesLists } from "./liveCore";

test("nudges the pollers under the given key prefixes, and only those", () => {
  const reg = createPollRegistry();
  const hits: string[] = [];
  reg.add("inbox{}", () => hits.push("inbox"));
  reg.add("inbox-today2026-11-20", () => hits.push("today"));
  reg.add("counts", () => hits.push("counts"));
  reg.add("facets-inbox", () => hits.push("facets"));
  reg.add("rejected-counts", () => hits.push("rejected-counts"));
  reg.add("posted{}", () => hits.push("posted"));
  reg.add("card-template", () => hits.push("template"));
  assert.equal(reg.nudge(QUEUE_POLL_KEYS), 4);
  assert.deepEqual(hits.sort(), ["counts", "facets", "inbox", "today"]);
});

test("a removed poller is not nudged; two pollers on one key are both nudged, and removed one by one", () => {
  const reg = createPollRegistry();
  let a = 0;
  let b = 0;
  const offA = reg.add("counts", () => a++);
  const offB = reg.add("counts", () => b++);
  reg.nudge(["counts"]);
  offA();
  reg.nudge(["counts"]);
  assert.deepEqual([a, b], [1, 2]);
  offB();
  offB();
  assert.equal(reg.nudge(["counts"]), 0);
});

test("one poller that throws does not stop the others; an empty prefix matches nothing", () => {
  const reg = createPollRegistry();
  let ran = 0;
  reg.add("inbox", () => {
    throw new Error("boom");
  });
  reg.add("inbox-today", () => ran++);
  assert.equal(reg.nudge(["inbox"]), 2);
  assert.equal(ran, 1);
  assert.equal(reg.nudge([""]), 0);
  assert.equal(reg.nudge([]), 0);
});

test("a poller removed while the nudge runs does not break it", () => {
  const reg = createPollRegistry();
  let second = 0;
  let off: () => void = () => undefined;
  reg.add("inbox", () => off());
  off = reg.add("inbox-today", () => second++);
  reg.nudge(["inbox"]);
  // It was in the list when the nudge began, so it still reads once; it is gone after
  assert.equal(second, 1);
  reg.nudge(["inbox"]);
  assert.equal(second, 1);
});

test("queue.changed is a queue event that refreshes the lists (visible tabs through the gate)", () => {
  assert.ok((QUEUE_EVENTS as readonly string[]).includes("queue.changed"));
  assert.equal(refreshesLists("queue.changed", {}), true);
});

test("a hidden tab refreshes the queue directly on queue.changed, resync and a new stream; a visible tab never does", () => {
  for (const e of ["queue.changed", "resync", "hello"]) {
    assert.equal(backgroundRefresh(e, false), true, e);
    assert.equal(backgroundRefresh(e, true), false, e);
  }
  // The other queue events wait for the tab to be shown (its focus refresh catches up)
  for (const e of ["story.arrived", "draft.updated", "draft.claimed", "presence.list", "edit.state"]) assert.equal(backgroundRefresh(e, false), false, e);
});
