// Reading one IST day of the queue page by page, and keeping that day fresh cheaply: pure helpers with no
// imports but types, so queueDay.test.ts runs them under plain node. The server sorts newest first by
// (time, id) and hands back `nextCursor` (the last row's "<time>|<id>"), passed as `before` for the next page.

import type { QueueResponse } from "./types";

/** The server's largest page (a bigger `limit` is refused: "querystring/limit must be <= 200") */
export const QUEUE_PAGE_MAX = 200;
/** Pages read for one day at most: 2,000 stories, well over a busy day's files */
export const QUEUE_DAY_PAGES = 10;

/** A whole day's answer. `truncated`: the page cap was reached and older stories of the day were left out. */
export interface QueueDay extends QueueResponse {
  truncated: boolean;
}

/** One page: newest first, or older than `before` (a nextCursor) */
export type QueuePageReader = (before: string | undefined, signal?: AbortSignal) => Promise<QueueResponse>;

const abortError = (signal: AbortSignal) => (signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));

/**
 * Every page of the day, joined: follows nextCursor until there is none, a page brings nothing new (a cursor
 * that does not move), or `maxPages` were read (then `truncated` if the server still had more).
 */
export async function readQueueDay(readPage: QueuePageReader, signal?: AbortSignal, maxPages = QUEUE_DAY_PAGES): Promise<QueueDay> {
  let page = await readPage(undefined, signal);
  const items = [...page.items];
  const seen = new Set(items.map((i) => i.id));
  let pages = 1;
  while (page.nextCursor) {
    if (pages >= maxPages) return { ...page, items, nextCursor: null, truncated: true };
    if (signal?.aborted) throw abortError(signal);
    page = await readPage(page.nextCursor, signal);
    pages += 1;
    const fresh = page.items.filter((i) => !seen.has(i.id));
    if (!fresh.length) break;
    for (const i of fresh) seen.add(i.id);
    items.push(...fresh);
  }
  return { ...page, items, nextCursor: null, truncated: false };
}

/** The inbox as the desk reads it: with a day, every page of it (readQueueDay); without one, the first page only */
export async function readQueueView(readPage: QueuePageReader, hasDay: boolean, signal?: AbortSignal, maxPages = QUEUE_DAY_PAGES): Promise<QueueDay> {
  if (!hasDay) return { ...(await readPage(undefined, signal)), truncated: false };
  return readQueueDay(readPage, signal, maxPages);
}

/**
 * The day kept fresh from its first page only: `head` (the newest page, as the server has it now) replaces
 * the newest part of the cached day, and the cached stories older than the head's last story follow, in the
 * server's order. Stories posted or rejected inside the head's span drop out with it. Null when the head
 * cannot be joined to the cache (its last story is not cached, e.g. more than a page arrived): read the day again.
 */
export function mergeQueueHead(head: QueueResponse, cached: QueueDay): QueueDay | null {
  // A head with no next page is the whole day
  if (!head.nextCursor) return { ...head, nextCursor: null, truncated: false };
  const last = head.items[head.items.length - 1];
  const at = last ? cached.items.findIndex((i) => i.id === last.id) : -1;
  if (at < 0) return null;
  const inHead = new Set(head.items.map((i) => i.id));
  return { ...head, items: [...head.items, ...cached.items.slice(at + 1).filter((i) => !inHead.has(i.id))], nextCursor: null, truncated: cached.truncated };
}
