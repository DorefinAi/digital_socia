"use client";

import React, { useState } from "react";
import { Box, Typography, Button, Chip, Dialog } from "@mui/material";
import { CalendarClock, Pencil, Send, Undo2, Trash2 } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { REJECT_REASONS, SocialDraft, SocialPlatform } from "@/types/newsroom";
import { ScheduleDialog } from "./actionDialogs";
import { EmptyState, ListThumb, formatStamp, listFrameSx, timeAgo } from "./shared";

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
  const { socialDrafts, rescheduleDraft, publishDraftNow, restoreDraft, permissions } = useNewsroom();
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
          {permissions.canApproveSocialContent && (
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

// ─── Rejected ────────────────────────────────────────────────────────────────
export function RejectedList({ platform }: { platform: SocialPlatform }) {
  const { socialDrafts, restoreDraft, deleteDraft, permissions } = useNewsroom();
  const [deleting, setDeleting] = useState<SocialDraft | null>(null);
  const drafts = socialDrafts.filter((d) => d.platform === platform && d.status === "rejected");

  if (!drafts.length) return <EmptyState title="Nothing rejected" hint="Stories rejected from the queue are kept here with the reason, and can be restored." />;

  return (
    <Box sx={listFrameSx}>
      {drafts.map((d, i) => (
        <Box key={d.id} sx={rowSx(i)}>
          <ListThumb src={d.thumbUrl} dim />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.headline}</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.4, flexWrap: "wrap" }}>
              {d.rejectReason && <Chip label={REJECT_REASONS[d.rejectReason]} size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: "0.6875rem", borderRadius: "6px" }} />}
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                {timeAgo(d.updatedAt)} · {d.postedBy}
              </Typography>
            </Box>
            {d.rejectNote && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.4 }}>&ldquo;{d.rejectNote}&rdquo;</Typography>}
          </Box>
          {permissions.canApproveSocialContent && (
            <Box sx={actionsSx}>
              <Button size="small" startIcon={<Undo2 size={13} />} onClick={() => restoreDraft(d.id)} sx={smallBtn}>Restore to queue</Button>
              <Button size="small" color="error" startIcon={<Trash2 size={13} />} onClick={() => setDeleting(d)} sx={smallBtn}>Delete</Button>
            </Box>
          )}
        </Box>
      ))}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
        <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>Delete this rejected draft?</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
            The draft and its reason are removed for good. The story stays on the FTP and will not come back to the queue.
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                if (deleting) deleteDraft(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
