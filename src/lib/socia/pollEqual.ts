// Small pure helpers for usePolled, kept apart so node's test runner can load them without React.

/**
 * The answer as a string to compare with the last one, or null when it cannot be turned into one (a cycle,
 * a BigInt). Null never counts as "the same", so such answers are always shown.
 */
export function answerKey(data: unknown): string | null {
  try {
    return JSON.stringify(data) ?? null;
  } catch {
    return null;
  }
}

/** The last answer that was put on screen for a key, and whether it is still showing without an error */
export interface ShownAnswer {
  key: string;
  json: string | null;
  ok: boolean;
}

/**
 * True when a fresh answer would change nothing on screen: same key, the last answer is showing with no
 * error over it, and the data reads the same. Then the poller keeps its old object, so memoised views hold.
 */
export function sameAsShown(shown: ShownAnswer | null, key: string, json: string | null): boolean {
  return !!shown && shown.ok && shown.key === key && json !== null && shown.json === json;
}

/** The spread of the focus refresh: pollers coming back to a window don't all fire in the same instant */
export const FOCUS_JITTER_MS = 1500;

/**
 * How long to wait before the refresh a window focus asks for, or null to skip it: an answer younger than
 * half the poll interval is fresh enough (switching between windows on a visible desk), and otherwise each
 * poller waits a random 0–1.5 s so a returning desk doesn't send every request at once.
 */
export function focusRefreshDelay(lastDoneAt: number | null, now: number, intervalMs: number, random: () => number = Math.random): number | null {
  if (lastDoneAt !== null && now - lastDoneAt < intervalMs / 2) return null;
  return Math.floor(random() * FOCUS_JITTER_MS);
}
