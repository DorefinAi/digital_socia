// After Copy & Mark Posted the studio opens the next free story by itself (desk fixes point 5). The pick skips
// stories held by someone else (polled queue data), stories someone has open in edit mode right now (live
// presence) and stories that can't be worked (posted, rejected, sending...). When the claim on the picked story
// still fails (someone took it in the last seconds), LiveEditor moves on to the next one instead of opening it
// in watch mode; opening a story by hand keeps watch mode. With none left the editor closes to the desk.

import { othersEditingNow } from "@/lib/socia/live";
import type { FtpNewsItem } from "@/types/newsroom";
import { advanceCandidates, freeForAdvance } from "../deskRules";
import { isLiveItem } from "./LiveDesk";

/** Drafts opened by auto-advance, each with the ids still to try after it, in order */
const advancing = new Map<string, readonly string[]>();

/** Whether this story, as the desk last saw it, may be opened by auto-advance */
export function freeStory(n: FtpNewsItem, editedByOthers: ReadonlySet<string> = othersEditingNow()): boolean {
  return freeForAdvance(n.id, isLiveItem(n) ? n.live : null, editedByOthers);
}

/** Opens the first of `candidates` that is free now, marking it as auto-advance with the rest to fall back on */
function takeFirst(candidates: readonly FtpNewsItem[]): FtpNewsItem | undefined {
  const [next, ...rest] = candidates;
  if (!next) return undefined;
  advancing.set(
    next.id,
    rest.map((s) => s.id),
  );
  return next;
}

/** The story to open after `postedId` was posted (or none: back to the desk), marked as auto-advance */
export function beginAdvance(order: readonly FtpNewsItem[], postedId: string): FtpNewsItem | undefined {
  const editing = othersEditingNow();
  return takeFirst(advanceCandidates(order, postedId, (n) => !freeStory(n, editing)));
}

/** Whether auto-advance opened this story (read without using it up, so a re-run effect still sees it) */
export const hasAdvanceIntent = (id: string) => advancing.has(id);
/** The editor opened the story by auto-advance and took the claim (or gave up on it) */
export const dropAdvanceIntent = (id: string) => void advancing.delete(id);

/**
 * The claim on a story auto-advance opened failed: the next story to try from those left, as the desk sees them
 * now (`order`), marked as auto-advance in turn. Undefined: none left, back to the desk.
 */
export function advancePast(id: string, order: readonly FtpNewsItem[]): FtpNewsItem | undefined {
  const left = advancing.get(id) ?? [];
  advancing.delete(id);
  const byId = new Map(order.map((n) => [n.id, n]));
  const editing = othersEditingNow();
  const candidates = left.flatMap((sid) => {
    const n = byId.get(sid);
    return n && freeStory(n, editing) ? [n] : [];
  });
  return takeFirst(candidates);
}
