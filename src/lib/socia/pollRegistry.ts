// Every mounted, enabled usePolled, by its key, so something outside the component that owns a poller can ask it
// to read now: live.tsx does, when the server pushes "queue.changed" to a tab that is hidden. A hidden tab skips
// its polls and the browser slows its timers to about once a minute, but a fetch started from a stream event runs
// at once, so new stories are on the desk before anyone looks at it. No React here, so node's test runner
// covers it (pollRegistry.test.ts).

/** usePolled's nudge: a refresh that never cancels a read already running */
export type PollNudge = () => void;

export interface PollRegistry {
  /** Adds a poller under its key; returns the removal */
  add(key: string, nudge: PollNudge): () => void;
  /** Nudges every poller whose key starts with one of `prefixes`; returns how many were nudged */
  nudge(prefixes: readonly string[]): number;
}

export function createPollRegistry(): PollRegistry {
  // Several pollers may share a key (two views of the same list), so each entry is its own
  const entries = new Set<{ key: string; nudge: PollNudge }>();
  return {
    add(key, nudge) {
      const entry = { key, nudge };
      entries.add(entry);
      return () => void entries.delete(entry);
    },
    nudge(prefixes) {
      let n = 0;
      for (const e of [...entries]) {
        if (!prefixes.some((p) => p !== "" && e.key.startsWith(p))) continue;
        n += 1;
        try {
          e.nudge();
        } catch {
          // One poller's trouble never keeps the rest from reading
        }
      }
      return n;
    },
  };
}

/** The page's one registry (usePolled adds itself while enabled) */
export const pollRegistry = createPollRegistry();

/**
 * The desk's queue pollers (LiveDesk.tsx keys): the inbox (`inbox…`, also `inbox-today…` while an earlier day is
 * shown), the counts, and the inbox filter facets. What "queue.changed" refreshes in a hidden tab.
 */
export const QUEUE_POLL_KEYS = ["inbox", "counts", "facets-inbox"] as const;

/** Nudges the pollers under these key prefixes now */
export const nudgePolled = (prefixes: readonly string[]): number => pollRegistry.nudge(prefixes);
