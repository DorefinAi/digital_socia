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
import Phase1Editor from "../phase1/Phase1Editor";
import { draftToNews, errorCode, errorText, useLiveDesk } from "./LiveDesk";

/** Whether this operator may change the open story. */
export type Lease = { kind: "mine" } | { kind: "held"; name: string } | { kind: "lost" } | { kind: "read" };

/** What PostEditor needs on the live desk. */
export interface LiveEditing {
  draft: DraftView;
  lease: Lease;
  /** Adopt a draft the server answered with (keeps the version current) */
  onDraft: (draft: DraftView) => void;
  onLeaseLost: () => void;
  onHeldBy: (name: string) => void;
  claimAgain: () => Promise<void>;
  /** The story left the editor's hands (queued, posted by hand or rejected): stop holding it */
  onFinished: () => void;
}

interface Opened {
  draft: DraftView;
  lease: Lease;
}

interface LiveEditorProps {
  item: FtpNewsItem;
  platform: SocialPlatform;
  onClose: () => void;
  onSwitch: (item: FtpNewsItem) => void;
  onSaved: (message: string) => void;
}

const leaseOf = (d: DraftView): Lease =>
  d.status === "claimed" && d.claim?.mine ? { kind: "mine" } : d.claim && !d.claim.mine ? { kind: "held", name: d.claim.name } : { kind: "read" };

export default function LiveEditor({ item, platform, onClose, onSwitch, onSaved }: LiveEditorProps) {
  const desk = useLiveDesk();
  const canAct = !!desk?.canAct;
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The draft id this editor currently holds a claim on, so close and switch can let it go
  const holding = useRef<string | null>(null);
  // The story the editor shows right now. A release waits a tick and is skipped if the same story is
  // open again by then (React re-runs effects in development, and a re-render must not drop the claim).
  const openId = useRef<string | null>(null);

  const release = useCallback((id: string | null) => {
    if (!id) return;
    setTimeout(() => {
      if (openId.current === id) return;
      if (holding.current === id) holding.current = null;
      void socia.releaseDraft(id).catch(() => undefined);
    }, 0);
  }, []);

  // ─── Open (and on switch): load, then claim when the story is free ─────────
  useEffect(() => {
    let cancelled = false;
    const id = item.id;
    openId.current = id;
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
        const lease = leaseOf(d);
        if (cancelled) {
          if (lease.kind === "mine") release(id);
          return;
        }
        if (lease.kind === "mine") holding.current = id;
        setError(null);
        // The open story is the one that matters from here on; a late answer for an older one is dropped above
        setOpened({ draft: d, lease });
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      }
    })();
    return () => {
      cancelled = true;
      if (openId.current === id) openId.current = null;
      release(holding.current === id ? id : null);
    };
  }, [item.id, canAct, release]);

  const current = opened && opened.draft.id === item.id ? opened : null;
  const mine = current?.lease.kind === "mine";

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
  const onHeldBy = useCallback((name: string) => {
    holding.current = null;
    setOpened((o) => (o ? { ...o, lease: { kind: "held", name } } : o));
  }, []);
  const claimAgain = useCallback(async () => {
    const id = item.id;
    try {
      const d = await socia.claimDraft(id);
      holding.current = id;
      setOpened({ draft: d, lease: leaseOf(d) });
    } catch (err) {
      if (errorCode(err) === "held_by_other") {
        const name = String((err as { data?: { heldBy?: string } }).data?.heldBy ?? "Someone");
        setOpened((o) => (o ? { ...o, lease: { kind: "held", name } } : o));
      } else throw err;
    }
  }, [item.id]);
  const onFinished = useCallback(() => {
    holding.current = null;
  }, []);

  // The editor keeps showing the last story while the next one loads, so switching never flashes
  const shown = current ?? opened;
  const story = useMemo(() => (shown ? draftToNews(shown.draft) : null), [shown]);

  if (!shown || !story || (error && !current)) {
    return (
      <Dialog open fullScreen onClose={onClose} transitionDuration={150} slotProps={{ paper: { sx: { borderRadius: 0, backgroundImage: "none", backgroundColor: "background.default" } } }}>
        <Box role={error ? "alert" : "status"} sx={{ flex: 1, display: "grid", placeItems: "center", px: 2 }}>
          {error ? (
            <Box sx={{ maxWidth: 420, textAlign: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>This story didn&apos;t open</Typography>
              <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mt: 1 }}>{error}</Typography>
              <Button variant="contained" onClick={onClose} sx={{ mt: 2 }}>
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

  const live: LiveEditing = { draft: shown.draft, lease: shown.lease, onDraft, onLeaseLost, onHeldBy, claimAgain, onFinished };
  // Phase 1 (set on the server): the text-first editor with Copy & Posted instead of the card studio
  // Keyed by draft: another story is a fresh editor, so no save or timer from the last one can reach it
  if (desk?.phase1) return <Phase1Editor key={shown.draft.id} item={story} onClose={onClose} onSaved={onSaved} live={live} />;
  return <PostEditor item={story} platform={platform} onClose={onClose} onSwitch={onSwitch} onSaved={onSaved} live={live} />;
}
