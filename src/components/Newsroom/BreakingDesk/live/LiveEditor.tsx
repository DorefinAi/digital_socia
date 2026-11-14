"use client";

// Opens PostEditor on a real draft: loads it, takes the claim, keeps the claim alive with a heartbeat
// while the editor is open and lets it go on close or when the operator switches story. The lease
// works silently; the editor only hears about it when it is lost or someone else holds the story.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, CircularProgress, Dialog, Typography } from "@mui/material";
import * as socia from "@/lib/socia/api";
import { HEARTBEAT_MS } from "@/lib/socia/config";
import type { DraftView } from "@/lib/socia/types";
import type { FtpNewsItem, SocialPlatform } from "@/types/newsroom";
import PostEditor from "../PostEditor";
import { draftToNews, errorCode, errorText, useLiveDesk } from "./LiveDesk";
import { correctionOpen, fixedByOther, isCorrecting } from "./correction";
import { abandonCorrection, correctionFailure, hasEditIntent, takeEditIntent } from "./beginCorrection";
import { advancePast, dropAdvanceIntent, hasAdvanceIntent } from "./autoAdvance";

/** Whether this operator may change the open story. `fixing`: someone else holds the posted story for a fix. */
export type Lease = { kind: "mine" } | { kind: "held"; name: string; fixing?: boolean } | { kind: "lost" } | { kind: "read" };

/** What PostEditor needs on the live desk. */
export interface LiveEditing {
  draft: DraftView;
  lease: Lease;
  /** Adopt a draft the server answered with (keeps the version current) */
  onDraft: (draft: DraftView) => void;
  onLeaseLost: () => void;
  /** Someone else holds the story now; `fixing` when it is a posted story they are fixing */
  onHeldBy: (name: string, fixing?: boolean) => void;
  /**
   * Take the story (again): a claim, or a correction hold for a posted story. Resolves to the draft as the
   * server has it now, or null when someone else got it first (the lease then names them).
   */
  claimAgain: () => Promise<DraftView | null>;
  /** The story left the editor's hands (queued, posted by hand or rejected): stop holding it */
  onFinished: () => void;
  /**
   * The story was opened with Edit to fix it after posting (status stays "published"): the editor's correction
   * mode, kept while the hold is lost so the editor never turns back into a posting editor. Leaving ends the
   * hold (correction/done) instead of releasing a claim.
   */
  correcting: boolean;
  /** Edit on the open story's own Posted row: hold it for a fix in place and reload it. Resolves to the fresh draft or an error sentence. */
  correctThis: () => Promise<{ draft: DraftView } | { error: string }>;
}

interface Opened {
  draft: DraftView;
  lease: Lease;
  /** Opened in fix mode (Edit pressed and allowed) */
  fix: boolean;
}

interface LiveEditorProps {
  /** The desk's queue in its current filter order (Prev / Next and the story after Copy & Mark Posted) */
  queueOrder?: readonly FtpNewsItem[];
  item: FtpNewsItem;
  platform: SocialPlatform;
  /** "queue": show the desk's New tab after closing (see PostEditor) */
  onClose: (returnTo?: "queue") => void;
  onSwitch: (item: FtpNewsItem) => void;
  onSaved: (message: string) => void;
  /** The open draft's readable link name, once the server has sent it (absent on older servers) */
  onLinkSlug?: (id: string, linkSlug: string) => void;
}

// A posted story is "mine" only in fix mode (Edit pressed and allowed); held by someone else, they are fixing it
const leaseOf = (d: DraftView, fix: boolean): Lease => {
  if (fix ? isCorrecting(d) : d.status === "claimed" && !!d.claim?.mine) return { kind: "mine" };
  const fixer = fixedByOther(d);
  if (fixer) return { kind: "held", name: fixer, fixing: true };
  return d.claim && !d.claim.mine ? { kind: "held", name: d.claim.name } : { kind: "read" };
};

const CANT_FIX = "This post can't be edited.";

export default function LiveEditor({ item, platform, onClose, onSwitch, onSaved, onLinkSlug, queueOrder }: LiveEditorProps) {
  const desk = useLiveDesk();
  const canAct = !!desk?.canAct;
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The draft id this editor currently holds a claim on, so close and switch can let it go
  const holding = useRef<string | null>(null);
  // The story the editor shows right now. A release waits a tick and is skipped if the same story is
  // open again by then (React re-runs effects in development, and a re-render must not drop the claim).
  const openId = useRef<string | null>(null);
  // Drafts held for a fix after posting: letting one go ends the correction, which keeps the story posted
  const correcting = useRef(new Set<string>());

  const release = useCallback((id: string | null) => {
    if (!id) return;
    setTimeout(() => {
      if (openId.current === id) return;
      if (holding.current === id) holding.current = null;
      if (correcting.current.delete(id)) void socia.finishCorrection(id).catch(() => undefined);
      else void socia.releaseDraft(id).catch(() => undefined);
    }, 0);
  }, []);

  // A hold Edit took for a story this editor didn't end up opening: ended a tick later unless it is open again
  const abandonLater = useCallback((id: string) => {
    setTimeout(() => {
      if (openId.current !== id) void abandonCorrection(id);
    }, 0);
  }, []);

  // An auto-advance mark for a story this editor didn't end up opening: dropped a tick later unless it is open again
  const dropAdvanceLater = useCallback((id: string) => {
    setTimeout(() => {
      if (openId.current !== id) dropAdvanceIntent(id);
    }, 0);
  }, []);

  // Where auto-advance goes when a claim fails: read when it happens, so the open effect doesn't re-run on them
  const queue = desk?.queue;
  const advanceTo = useRef({ queueOrder, queue, onSwitch, onClose });
  useEffect(() => {
    advanceTo.current = { queueOrder, queue, onSwitch, onClose };
  });

  // ─── Open (and on switch): load, then claim when the story is free ─────────
  useEffect(() => {
    let cancelled = false;
    const id = item.id;
    openId.current = id;
    // Edit took a correction hold for this story just before opening it (left in place for a re-run effect)
    const pressed = hasEditIntent(id);
    // Opened by itself after posting: a story someone else got first is stepped over, not watched
    const advanced = !pressed && hasAdvanceIntent(id);
    (async () => {
      try {
        let d = await socia.fetchDraft(id);
        if (canAct && (d.status === "ready" || (d.status === "claimed" && (!d.claim || d.claim.mine)))) {
          try {
            d = await socia.claimDraft(id);
          } catch (err) {
            if (errorCode(err) !== "held_by_other") throw err;
            d = await socia.fetchDraft(id);
          }
        }
        const { fix, endHold } = correctionOpen(d, pressed);
        const lease = leaseOf(d, fix);
        if (cancelled) {
          if (pressed) abandonLater(id);
          else if (lease.kind === "mine") release(id);
          if (advanced) dropAdvanceLater(id);
          return;
        }
        if (advanced) {
          if (canAct && lease.kind !== "mine") {
            // Taken in the last seconds (or no longer workable): on to the next free story, else back to the desk
            const to = advanceTo.current;
            const next = advancePast(id, to.queueOrder ?? to.queue ?? []);
            if (next) to.onSwitch(next);
            else to.onClose();
            return;
          }
          dropAdvanceIntent(id);
        }
        if (pressed) takeEditIntent(id);
        // Edit's hold on a story that can't be fixed here (canCorrect not true, or undone meanwhile): end it now
        if (endHold) void abandonCorrection(id);
        if (fix) correcting.current.add(id);
        if (lease.kind === "mine") holding.current = id;
        setError(null);
        // The open story is the one that matters from here on; a late answer for an older one is dropped above
        setOpened({ draft: d, lease, fix });
      } catch (err) {
        if (cancelled) {
          if (pressed) abandonLater(id);
          if (advanced) dropAdvanceLater(id);
          return;
        }
        if (advanced) dropAdvanceIntent(id);
        if (pressed) {
          takeEditIntent(id);
          void abandonCorrection(id);
        }
        setError(errorText(err));
      }
    })();
    return () => {
      cancelled = true;
      if (openId.current === id) openId.current = null;
      release(holding.current === id ? id : null);
    };
  }, [item.id, canAct, release, abandonLater, dropAdvanceLater]);

  const current = opened && opened.draft.id === item.id ? opened : null;
  const mine = current?.lease.kind === "mine";
  // The desk's URL reads ?story=<linkSlug> once the draft says what its slug is
  const openedId = current?.draft.id;
  const openedSlug = current?.draft.linkSlug;
  useEffect(() => {
    if (openedId && openedSlug) onLinkSlug?.(openedId, openedSlug);
  }, [openedId, openedSlug, onLinkSlug]);

  // ─── A closing tab ends its correction hold at once ────────────────────────
  // Otherwise the hold lasts up to 5 minutes and can block the poster's Undo for the whole undo window. Best
  // effort (a keepalive request, never a prompt); the id leaves `correcting` so the unmount release doesn't
  // end it again (a second end would only be a harmless no-op).
  useEffect(() => {
    const onPageHide = () => {
      const id = holding.current;
      if (!id || !correcting.current.delete(id)) return;
      holding.current = null;
      socia.finishCorrectionOnExit(id);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // ─── Heartbeat: keeps the 5-minute claim alive while the story is open ─────
  useEffect(() => {
    if (!mine) return;
    const id = item.id;
    const timer = setInterval(async () => {
      try {
        await socia.heartbeat(id);
      } catch (err) {
        const code = errorCode(err);
        if (code === "lease_lost" || code === "held_by_other" || code === "invalid_state") {
          holding.current = null;
          setOpened((o) => (o && o.draft.id === id ? { ...o, lease: { kind: "lost" } } : o));
        }
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [mine, item.id]);

  const onDraft = useCallback((draft: DraftView) => setOpened((o) => (o && o.draft.id === draft.id ? { ...o, draft } : o)), []);
  const onLeaseLost = useCallback(() => {
    holding.current = null;
    setOpened((o) => (o ? { ...o, lease: { kind: "lost" } } : o));
  }, []);
  const onHeldBy = useCallback((name: string, fixing?: boolean) => {
    holding.current = null;
    setOpened((o) => (o ? { ...o, lease: { kind: "held", name, ...(fixing ? { fixing } : {}) } } : o));
  }, []);
  // Read by claimAgain: whether the open story is a posted one (taken as a correction hold, never a claim)
  const openedRef = useRef(opened);
  useEffect(() => {
    openedRef.current = opened;
  });
  const claimAgain = useCallback(async (): Promise<DraftView | null> => {
    const id = item.id;
    const o = openedRef.current;
    try {
      // A lost correction hold, or a posted story someone else was fixing (watch mode's Start editing), is
      // taken as a correction: a posted story can't be claimed
      const fix = correcting.current.has(id) || (o?.draft.id === id && o.draft.status === "published");
      if (fix) {
        await socia.startCorrection(id);
        let d: DraftView;
        try {
          d = await socia.fetchDraft(id);
        } catch (err) {
          // The hold was taken but the story didn't load: give the hold up rather than leave it for 5 minutes
          void abandonCorrection(id);
          throw err;
        }
        if (!correctionOpen(d, true).fix) {
          void abandonCorrection(id);
          throw new Error(CANT_FIX);
        }
        correcting.current.add(id);
        holding.current = id;
        setOpened({ draft: d, lease: leaseOf(d, true), fix: true });
        return d;
      }
      const d = await socia.claimDraft(id);
      holding.current = id;
      setOpened({ draft: d, lease: leaseOf(d, false), fix: false });
      return d;
    } catch (err) {
      if (errorCode(err) === "held_by_other") {
        const name = String((err as { data?: { heldBy?: string } }).data?.heldBy ?? "Someone");
        setOpened((prev) => (prev ? { ...prev, lease: { kind: "held", name, fixing: prev.fix || prev.draft.status === "published" } } : prev));
        return null;
      }
      throw err;
    }
  }, [item.id]);
  const correctThis = useCallback(async (): Promise<{ draft: DraftView } | { error: string }> => {
    const id = item.id;
    try {
      await socia.startCorrection(id);
    } catch (err) {
      return { error: correctionFailure(err) };
    }
    try {
      // Reload, so the editor carries on from the draft as the server has it now
      const d = await socia.fetchDraft(id);
      if (!correctionOpen(d, true).fix) {
        void abandonCorrection(id);
        return { error: CANT_FIX };
      }
      correcting.current.add(id);
      holding.current = id;
      setOpened({ draft: d, lease: leaseOf(d, true), fix: true });
      return { draft: d };
    } catch (err) {
      void abandonCorrection(id);
      return { error: errorText(err) };
    }
  }, [item.id]);
  const onFinished = useCallback(() => {
    if (holding.current) correcting.current.delete(holding.current);
    holding.current = null;
  }, []);

  // The editor keeps showing the last story while the next one loads, so switching never flashes
  const shown = current ?? opened;
  const story = useMemo(() => (shown ? draftToNews(shown.draft) : null), [shown]);

  if (!shown || !story || (error && !current)) {
    return (
      <Dialog open fullScreen onClose={() => onClose()} transitionDuration={150} slotProps={{ paper: { sx: { borderRadius: 0, backgroundImage: "none", backgroundColor: "background.default" } } }}>
        <Box role={error ? "alert" : "status"} sx={{ flex: 1, display: "grid", placeItems: "center", px: 2 }}>
          {error ? (
            <Box sx={{ maxWidth: 420, textAlign: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>This story didn&apos;t open</Typography>
              <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mt: 1 }}>{error}</Typography>
              <Button variant="contained" onClick={() => onClose()} sx={{ mt: 2 }}>
                Back to desk
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <CircularProgress size={22} />
              <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>Opening the story</Typography>
            </Box>
          )}
        </Box>
      </Dialog>
    );
  }

  const live: LiveEditing = { draft: shown.draft, lease: shown.lease, onDraft, onLeaseLost, onHeldBy, claimAgain, onFinished, correctThis, correcting: shown.fix };
  // Phase 1 (set on the server) opens the same editor; it swaps Post to X for Copy & Mark Posted itself.
  // phase1/Phase1Editor.tsx (the text-first editor) stays in the repo, unused.
  return <PostEditor queueOrder={queueOrder} item={story} platform={platform} onClose={onClose} onSwitch={onSwitch} onSaved={onSaved} live={live} />;
}
