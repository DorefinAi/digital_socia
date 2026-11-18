// Page math for phase 1's long lists (a day can hold hundreds of stories). Pages are 0-based here; the controls
// show them 1-based. Pure, so the desk's page jumps (keyboard moves, the story after Copy & Mark Posted) are
// tested without a browser.

/** Rows per page on the New and Posted lists */
export const PAGE_SIZE = 50;

/** How many pages `total` rows need; an empty list still has one (empty) page */
export const pageCount = (total: number, size = PAGE_SIZE) => Math.max(1, Math.ceil(Math.max(0, total) / size));

/** `page` kept inside the list, e.g. after posting the last row of the last page */
export const clampPage = (page: number, total: number, size = PAGE_SIZE) => Math.min(Math.max(0, Math.floor(page) || 0), pageCount(total, size) - 1);

/** The page a row at `index` (in the whole list) sits on; a missing row (-1) counts as the first page */
export const pageOf = (index: number, size = PAGE_SIZE) => (index > 0 ? Math.floor(index / size) : 0);

/** The rows `page` shows: [start, end) in the whole list, with the page clamped first */
export function pageRange(page: number, total: number, size = PAGE_SIZE): { start: number; end: number } {
  const p = clampPage(page, total, size);
  const start = p * size;
  return { start, end: Math.min(Math.max(0, total), start + size) };
}

/** "1–50 of 560" under the list; "0 of 0" when it is empty */
export function rangeLabel(page: number, total: number, size = PAGE_SIZE): string {
  if (total <= 0) return "0 of 0";
  const { start, end } = pageRange(page, total, size);
  return `${start + 1}–${end} of ${total}`;
}
