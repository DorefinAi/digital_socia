// Starting a fix on a posted story (Edit on a Posted row), with the sentence to show when it doesn't start.
// Edit also leaves a mark that the next open of that story may use fix mode (LiveEditor takes it): a story
// opened any other way (a link, ?story=, the Posted list) opens read-only.

import * as socia from "@/lib/socia/api";
import { ApiError } from "@/lib/socia/client";
import { errorText } from "./LiveDesk";
import { correctionErrorText } from "./correction";

/** Drafts whose correction hold Edit just took, waiting for the editor to open them */
const pressedEdit = new Set<string>();

/** Whether Edit took the hold for this draft (read without using it up, so a re-run effect still sees it) */
export const hasEditIntent = (id: string) => pressedEdit.has(id);
/** The editor opened the draft and used the mark */
export const takeEditIntent = (id: string) => pressedEdit.delete(id);

/** The sentence for a failed correction call (a 404 without a code: the server has no corrections yet) */
export function correctionFailure(err: unknown): string {
  if (!(err instanceof ApiError)) return errorText(err);
  const heldBy = typeof err.data.heldBy === "string" ? err.data.heldBy : null;
  return correctionErrorText(err.status, err.code, err.message, heldBy);
}

/**
 * Holds the posted story for a fix (it stays posted). Resolves to the sentence to show when it didn't start,
 * else null; then open the story, which LiveEditor opens in fix mode.
 */
export async function beginCorrection(id: string): Promise<string | null> {
  try {
    await socia.startCorrection(id);
    pressedEdit.add(id);
    return null;
  } catch (err) {
    return correctionFailure(err);
  }
}

/** Ends a hold Edit took that won't be used (the story didn't open, or can't be fixed) */
export async function abandonCorrection(id: string): Promise<void> {
  pressedEdit.delete(id);
  await socia.finishCorrection(id).catch(() => undefined);
}
