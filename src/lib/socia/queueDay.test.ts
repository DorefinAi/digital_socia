// Unit checks for queueDay.ts (run by npm test): the paging api.fetchQueueDay does, on a stand-in server.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueueItem, QueueResponse } from "./types";
import { mergeQueueHead, QUEUE_DAY_PAGES, readQueueDay, readQueueView, type QueueDay } from "./queueDay";

const cap = { used: 0, limit: 800 } as unknown as QueueResponse["cap"];
const story = (id: string) => ({ id }) as unknown as QueueItem;
const ids = (r: { items: QueueItem[] }) => r.items.map((i) => i.id);

/** A server holding `all` (newest first), `size` per page, cursor = last id of the page */
function server(all: string[], size: number) {
  const calls: (string | undefined)[] = [];
  const read = async (before: string | undefined, signal?: AbortSignal): Promise<QueueResponse> => {
    calls.push(before);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const from = before ? all.indexOf(before) + 1 : 0;
    const page = all.slice(from, from + size);
    return { cap, items: page.map(story), nextCursor: page.length === size && from + size < all.length ? page[page.length - 1] : null };
  };
  return { read, calls };
}
const range = (n: number, prefix = "s") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

test("follows nextCursor page by page and joins the day in the server's order", async () => {
  const { read, calls } = server(range(7), 3);
  const day = await readQueueDay(read);
  assert.deepEqual(ids(day), range(7));
  assert.deepEqual(calls, [undefined, "s2", "s5"]);
  assert.equal(day.nextCursor, null);
  assert.equal(day.truncated, false);
});

test("stops when a page brings nothing new (a cursor that does not move)", async () => {
  let n = 0;
  const day = await readQueueDay(async () => ({ cap, items: [story("a"), story("b")], nextCursor: `c${n++}` }));
  assert.deepEqual(ids(day), ["a", "b"]);
  assert.equal(n, 2);
  assert.equal(day.truncated, false);
});

test("stops at the page cap and says the day was cut", async () => {
  const { read, calls } = server(range(50), 2);
  const day = await readQueueDay(read, undefined, 3);
  assert.equal(calls.length, 3);
  assert.equal(day.items.length, 6);
  assert.equal(day.truncated, true);
  assert.equal(QUEUE_DAY_PAGES, 10);
  // Exactly at the cap with nothing more: not cut
  const exact = server(range(6), 2);
  assert.equal((await readQueueDay(exact.read, undefined, 3)).truncated, false);
});

test("an aborted read stops before asking for the next page", async () => {
  const controller = new AbortController();
  const { read, calls } = server(range(10), 2);
  const slowFirst = async (before: string | undefined, signal?: AbortSignal) => {
    const page = await read(before, signal);
    controller.abort();
    return page;
  };
  await assert.rejects(readQueueDay(slowFirst, controller.signal));
  assert.equal(calls.length, 1);
});

test("the first page joins the held day: new stories on top, gone ones dropped, older ones kept", () => {
  const held: QueueDay = { cap, items: ["d", "c", "b", "a", "z", "y"].map(story), nextCursor: null, truncated: false };
  // New "e" arrived, "c" was posted; the page ends at "a"
  const head: QueueResponse = { cap, items: ["e", "d", "b", "a"].map(story), nextCursor: "a" };
  assert.deepEqual(ids(mergeQueueHead(head, held)!), ["e", "d", "b", "a", "z", "y"]);
  // A head with no next page is the whole day
  assert.deepEqual(ids(mergeQueueHead({ cap, items: [story("e")], nextCursor: null }, held)!), ["e"]);
  // The head's last story is not held (more than a page arrived): read the day again
  assert.equal(mergeQueueHead({ cap, items: ["q", "p"].map(story), nextCursor: "p" }, held), null);
  // A cut day stays marked as cut
  assert.equal(mergeQueueHead(head, { ...held, truncated: true })!.truncated, true);
});

test("without a day only the first page is read; with one, every page", async () => {
  const undated = server(range(7), 3);
  const one = await readQueueView(undated.read, false);
  assert.deepEqual(ids(one), ["s0", "s1", "s2"]);
  assert.equal(one.truncated, false);
  assert.deepEqual(undated.calls, [undefined]);
  const dated = server(range(7), 3);
  assert.equal((await readQueueView(dated.read, true)).items.length, 7);
});

test("a read aborted before it starts rejects without a second page", async () => {
  const controller = new AbortController();
  controller.abort();
  const { read, calls } = server(range(10), 2);
  await assert.rejects(readQueueView(read, true, controller.signal), (err: Error) => err.name === "AbortError");
  assert.equal(calls.length, 1);
});
