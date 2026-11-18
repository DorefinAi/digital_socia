// The desk list's own search, and when to offer the server's story search beside it. Pure (type imports only), so
// listSearch.test.ts runs it under plain node. Inbox rows come slim (fields=list: no post text or body), so the
// list matches what every row carries; the story text is searched by GET /search/stories ("Search all stories").

import type { FtpNewsItem } from "../../../types/newsroom";
import type { QueueItem } from "../../../lib/socia/types";

/** The server's story search needs this many characters (Header/useStorySearch STORY_SEARCH_MIN) */
const SERVER_SEARCH_MIN = 2;
/** From this length the server search is offered even while the list has hits */
const SERVER_SEARCH_OFFER = 3;

const liveRow = (n: FtpNewsItem): QueueItem | null => ("live" in n ? (n as FtpNewsItem & { live: QueueItem }).live : null);

/**
 * Whether a row matches the list search `q` (already trimmed and lower-cased; "" matches all): its headline,
 * district and town, file path and slug, link name and category. Never the post text or body.
 */
export function storyMatchesSearch(n: FtpNewsItem, q: string): boolean {
  if (!q) return true;
  const live = liveRow(n);
  const fields = [n.headline, n.area, n.ftpPath, live?.town, live?.sourcePath, live?.linkSlug, live?.category];
  return fields.some((f) => typeof f === "string" && f.toLowerCase().includes(q));
}

/** Offer "Search all stories" under the search box: from 3 characters, or sooner when the list found nothing */
export function offerServerSearch(q: string, listHits: number): boolean {
  const n = Array.from(q.trim()).length;
  return n >= SERVER_SEARCH_OFFER || (n >= SERVER_SEARCH_MIN && listHits === 0);
}

/** The list's rows by their link name, so a server search result can open the row it names */
export function rowsByLinkSlug(rows: readonly FtpNewsItem[]): Map<string, FtpNewsItem> {
  const out = new Map<string, FtpNewsItem>();
  for (const n of rows) {
    const slug = liveRow(n)?.linkSlug;
    if (slug && !out.has(slug)) out.set(slug, n);
  }
  return out;
}
