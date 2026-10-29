"use client";

// Rejected news on the live backend: only what that page needs (the rejected list and the counts), instead of
// the whole LiveDeskProvider (inbox, sending, posts... polled every few seconds).

import { useCallback, useMemo } from "react";
import * as socia from "@/lib/socia/api";
import { POLL_MS } from "@/lib/socia/config";
import { usePolled } from "@/lib/socia/usePolled";
import { usePermissions } from "@/lib/access/usePermissions";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";

/** The API's largest page for /x/queue; it has no cursor, so older rejected stories are not reachable yet */
export const REJECTED_PAGE = 200;

/** Null in demo mode (`enabled` false). */
export function useRejectedLive(enabled: boolean) {
  const { can } = usePermissions();
  const rejected = usePolled(() => socia.fetchQueue("rejected", REJECTED_PAGE), POLL_MS.counts, "rejected-page", enabled);
  // Plain counts only: the derive fallback would fetch every queue
  const counts = usePolled(() => socia.fetchCounts(), POLL_MS.counts, "rejected-counts", enabled);
  const refreshRejected = rejected.refresh;
  const refreshCounts = counts.refresh;

  const restore = useCallback(
    async (draftId: string) => {
      let error: string | null = null;
      try {
        await socia.restoreDraft(draftId);
      } catch (err) {
        error = errorText(err);
      }
      void Promise.all([refreshRejected(), refreshCounts()]);
      return error;
    },
    [refreshRejected, refreshCounts],
  );

  const canAct = can("story.take_in");
  return useMemo(() => (enabled ? { canAct, rejected, counts, restore } : null), [enabled, canAct, rejected, counts, restore]);
}
