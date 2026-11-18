// How many rows the FTP feed beside the editor draws. A day can hold hundreds of stories, and every row (with its
// card thumbnail) is drawn again whenever the list changes, so it shows a page of them and "Show more" adds a page.
// Pure, so it is tested without a browser.

import { PAGE_SIZE, pageOf } from "./phase1/paging";

/**
 * Rows to draw out of `total`: `limit` (one page to start, a page more per "Show more"), and always through the
 * page holding the open story at `currentIndex` (-1: not in the list), so it is never hidden below the cut.
 */
export function feedRowsShown(limit: number, total: number, currentIndex: number, size = PAGE_SIZE): number {
  const throughCurrent = currentIndex >= 0 ? (pageOf(currentIndex, size) + 1) * size : 0;
  return Math.min(Math.max(0, total), Math.max(size, limit, throughCurrent));
}
