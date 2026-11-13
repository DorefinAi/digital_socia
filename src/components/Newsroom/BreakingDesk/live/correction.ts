// Fixing a story after it was posted (phase 1): the words the desk shows around it and the decisions the editor
// makes about the correction hold. Pure, so they are unit-checked (correction.test.ts). Socia never posts the
// fix: the desk edits or replaces the tweet on X by hand.

import type { DraftCorrection, DraftView, PostCorrected, QueueItem } from "@/lib/socia/types";

const IST_CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "19:32" in IST, 24-hour, whatever the browser's own time zone; "" for a date it can't read */
export function istClock(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "" : IST_CLOCK.format(t);
}

/** Whether a Posted row offers Edit. Only a server that says so: one without corrections leaves the field out. */
export const canCorrect = (item: Pick<QueueItem, "canCorrect"> | null | undefined): boolean => item?.canCorrect === true;

/** The open draft is a posted story held for a fix by this person */
export const isCorrecting = (draft: Pick<DraftView, "status" | "claim">): boolean => draft.status === "published" && !!draft.claim?.mine;

/** A posted story someone else holds for a fix: viewers see "<Name> is fixing this post" */
export const fixedByOther = (draft: Pick<DraftView, "status" | "claim">): string | null =>
  draft.status === "published" && draft.claim && !draft.claim.mine ? draft.claim.name : null;

/**
 * Opening a draft, and what to do about a correction hold. Fix mode only when this person pressed Edit (which
 * took the hold) and the server says they may fix it (`canCorrect`, false when absent). A link, ?story= or the
 * Posted list opens a posted story read-only, even with a hold of theirs. A hold Edit took that the editor can't
 * use (the draft didn't load, the post was undone, `canCorrect` isn't true) is ended at once (`endHold`), so
 * nobody sees "<Name> is editing" for a story no one is fixing.
 */
export function correctionOpen(
  draft: (Pick<DraftView, "status" | "claim"> & { canCorrect?: boolean }) | null,
  pressedEdit: boolean,
): { fix: boolean; endHold: boolean } {
  const fix = pressedEdit && !!draft && isCorrecting(draft) && draft.canCorrect === true;
  return { fix, endHold: pressedEdit && !fix };
}

/**
 * Edit on a Posted row, in order: leave the open story (saving it, or after a confirm), take the correction
 * hold, open the posted story. Once the hold is taken, a failure to open ends it at once. Resolves to the
 * sentence to show, or null (also when the desk chose to stay on the open story).
 */
export async function runEditFlow(steps: {
  leave: () => Promise<boolean>;
  start: () => Promise<string | null>;
  open: () => void | Promise<void>;
  abandon: () => Promise<unknown>;
}): Promise<string | null> {
  if (!(await steps.leave())) return null;
  const error = await steps.start();
  if (error) return error;
  try {
    await steps.open();
    return null;
  } catch {
    await steps.abandon().catch(() => undefined);
    return "The story didn't open for editing. Try again.";
  }
}

/** Done found the post taken back to the queue (Undo) while it was being fixed */
export const FIX_TAKEN_BACK = "This post was taken back to the queue; your fix was not saved.";

/**
 * Whether a failed save or correction/done means the post was undone meanwhile: `invalid_state`, or a lost hold
 * on a draft that is no longer published (`statusNow`, read after the failure; null when it couldn't be read).
 */
export function takenBack(code: string | null, statusNow: string | null): boolean {
  if (code === "invalid_state") return true;
  return code === "lease_lost" && statusNow !== null && statusNow !== "published";
}

/** "Edited by Asha at 19:40", the Edited tag's hover and screen-reader text; null when never fixed */
export function editedLabel(corrected: PostCorrected | null | undefined): string | null {
  if (!corrected) return null;
  const at = istClock(corrected.at);
  return `Edited${corrected.by ? ` by ${corrected.by.name}` : ""}${at ? ` at ${at}` : ""}`;
}

/** Who posted and when, from the correction record, else from the Copy & Mark Posted mark */
export function postedFacts(draft: Pick<DraftView, "correction" | "posted">): { at: string | null; by: string | null } {
  const c: DraftCorrection | null | undefined = draft.correction;
  if (c) return { at: c.postedAt, by: c.postedBy?.name ?? null };
  return { at: draft.posted?.at ?? null, by: draft.posted?.by?.name ?? null };
}

/** The correction banner's sentence */
export function correctionBanner(draft: Pick<DraftView, "correction" | "posted">): string {
  const { at, by } = postedFacts(draft);
  const time = istClock(at);
  const when = `Already posted${time ? ` at ${time}` : ""}${by ? ` by ${by}` : ""}.`;
  return `${when} Fixing it here doesn't post again: copy the fixed text and edit or replace the tweet on X.`;
}

/** Shown when the server has no correction route yet (a 404 without a code) */
export const CORRECTION_MISSING = "Editing posted stories isn't on this server yet.";
export const STORY_GONE = "This story no longer exists.";

/**
 * The sentence for a failed correction call. `code` is the API's error code; the client reports an answer
 * without one as "server". `message` is the server's own sentence, used when it sent one.
 */
export function correctionErrorText(status: number | null, code: string | null, message: string | null, heldBy?: string | null): string {
  const own = message?.trim() || null;
  if (status === 404) {
    if (code === "not_found") return STORY_GONE;
    if (!code || code === "server") return CORRECTION_MISSING;
    return own ?? STORY_GONE;
  }
  switch (code) {
    case "held_by_other":
      return heldBy ? `${heldBy} is fixing this post.` : own ?? "Someone else is fixing this post.";
    case "forbidden":
      return own ?? "Only the person who posted it or an admin can edit a posted story.";
    case "too_late":
      return own ?? "This post is from yesterday and can't be edited.";
    case "invalid_state":
      return own ?? "This story can't be edited right now.";
    default:
      return own ?? "The story didn't open for editing. Try again.";
  }
}

/** "Needs a check: No district, check. No district was found, ..." for screen readers and keyboard users */
export function needsCheckDescription<C extends string>(codes: readonly C[], label: (c: C) => string, hint: (c: C) => string | null): string {
  if (!codes.length) return "";
  return `Needs a check: ${codes.map((c) => `${label(c)}.${hint(c) ? ` ${hint(c)}` : ""}`).join(" ")}`;
}
