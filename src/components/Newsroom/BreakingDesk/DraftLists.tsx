"use client";

import React, { useState } from "react";
import { Box, Typography, Button } from "@mui/material";
import { CalendarClock, Pencil, RotateCcw, Send } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { SocialDraft, SocialPlatform } from "@/types/newsroom";
import { ScheduleDialog } from "./actionDialogs";
import { EmptyState, ListThumb, formatStamp, listFrameSx } from "./shared";
import { fileUrl, useLiveDesk } from "./live/LiveDesk";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import type { QueueItem } from "@/lib/socia/types";

const rowSx = (i: number) => ({
  display: "grid",
  gridTemplateColumns: { xs: "56px minmax(0, 1fr)", md: "56px minmax(0, 1fr) auto" },
  gap: 1.25,
  alignItems: "center",
  px: 1.25,
  py: 1,
  borderTop: i ? "1px solid" : "none",
  borderColor: "divider",
});

const actionsSx = { display: "flex", gap: 0.5, flexWrap: "wrap", gridColumn: { xs: "2", md: "auto" }, justifyContent: { md: "flex-end" } };
const smallBtn = { minHeight: 30, fontSize: "0.75rem", px: 1 };

// ─── Scheduled ───────────────────────────────────────────────────────────────
export function ScheduledList({ platform, onEdit }: { platform: SocialPlatform; onEdit: (newsId: string) => void }) {
  const { socialDrafts, rescheduleDraft, publishDraftNow, restoreDraft } = useNewsroom();
  const { can } = usePermissions();
  const [rescheduling, setRescheduling] = useState<SocialDraft | null>(null);
  const drafts = socialDrafts
    .filter((d) => d.platform === platform && d.status === "scheduled")
    .sort((a, b) => new Date(a.scheduledFor ?? 0).getTime() - new Date(b.scheduledFor ?? 0).getTime());

  if (!drafts.length) return <EmptyState title="Nothing scheduled yet" hint="Open a story from the queue and choose Schedule to line it up for later." />;

  return (
    <Box sx={listFrameSx}>
      {drafts.map((d, i) => (
        <Box key={d.id} sx={rowSx(i)}>
          <ListThumb src={d.thumbUrl} />
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <CalendarClock size={13} />
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatStamp(d.scheduledFor!)}</Typography>
            </Box>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.headline}</Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
              {d.mediaKind === "video" ? "Video" : "Card"} · scheduled by {d.postedBy}
            </Typography>
          </Box>
          {can("post.publish") && (
            <Box sx={actionsSx}>
              <Button size="small" startIcon={<Pencil size={13} />} onClick={() => onEdit(d.newsId)} sx={smallBtn}>Edit</Button>
              <Button size="small" startIcon={<CalendarClock size={13} />} onClick={() => setRescheduling(d)} sx={smallBtn}>Reschedule</Button>
              <Button size="small" startIcon={<Send size={13} />} onClick={() => publishDraftNow(d.id)} sx={smallBtn}>Publish now</Button>
              <Button size="small" color="error" onClick={() => restoreDraft(d.id)} sx={smallBtn}>Cancel</Button>
            </Box>
          )}
        </Box>
      ))}
      {rescheduling && (
        <ScheduleDialog
          open
          headline={rescheduling.headline}
          initial={rescheduling.scheduledFor}
          onClose={() => setRescheduling(null)}
          onConfirm={(when) => {
            rescheduleDraft(rescheduling.id, when);
            setRescheduling(null);
          }}
        />
      )}
    </Box>
  );
}

// ─── Live desk ───────────────────────────────────────────────────────────────
function useRowAction() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<string | null>) => {
    setBusyId(id);
    setError(await fn());
    setBusyId(null);
  };
  return { busyId, error, run };
}

function LiveRows({ items, empty, children }: { items: QueueItem[] | undefined; empty: React.ReactNode; children: (item: QueueItem) => React.ReactNode }) {
  if (!items?.length) return <>{empty}</>;
  return (
    <Box sx={listFrameSx}>
      {items.map((item, i) => (
        <Box key={item.id} sx={rowSx(i)}>
          {children(item)}
        </Box>
      ))}
    </Box>
  );
}

const SENDING_LABEL: Partial<Record<QueueItem["status"], string>> = { queued: "In the undo window", publishing: "Posting now", failed: "Post failed", render_failed: "Card failed to draw" };

/** Posts on their way to X, and ones that failed (with Retry). Takes the Scheduled tab's place on the live desk. */
export function LiveSendingList() {
  const desk = useLiveDesk();
  const { can } = usePermissions();
  const { busyId, error, run } = useRowAction();
  if (!desk) return null;
  const { sending, failed } = desk;
  if (!sending.data || !failed.data) {
    const err = sending.error ?? failed.error;
    return err ? <LoadError error={err} onRetry={() => void Promise.all([sending.refresh(), failed.refresh()])} /> : <LoadingRows />;
  }
  const items = [...failed.data.items, ...sending.data.items];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {error && <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main" }}>{error}</Typography>}
      <LiveRows items={items} empty={<EmptyState title="Nothing on its way" hint="Approved stories wait here for their 10-second undo window, then go to X." />}>
        {(d) => {
          const isFailed = d.status === "failed" || d.status === "render_failed";
          return (
            <>
              <ListThumb src={fileUrl(d.cardUrl)} dim={isFailed} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, color: isFailed ? "error.main" : "text.secondary" }}>{SENDING_LABEL[d.status] ?? d.status}</Typography>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.headline}</Typography>
              </Box>
              {can("post.publish") && d.status === "failed" && (
                <Box sx={actionsSx}>
                  <Button size="small" startIcon={<RotateCcw size={13} />} disabled={busyId === d.id} onClick={() => void run(d.id, () => desk.retry(d.id))} sx={smallBtn}>
                    Retry
                  </Button>
                </Box>
              )}
            </>
          );
        }}
      </LiveRows>
    </Box>
  );
}
