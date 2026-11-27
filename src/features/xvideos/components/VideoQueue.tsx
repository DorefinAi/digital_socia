"use client";

// The Video Draft list: Post Draft's rows (time dot, age, bold headline, reject, Open) with a clip thumbnail and its
// length. The headline is the system's guess from the clip until the desk saves one; "Reading the clip… 45%" shows
// while it is read; a clip over X's limit carries an orange chip beside Reject. Each row also says which folder of the
// day it sits in and carries an "x" when the file name has the desk's x mark (shown only, never a filter).

import React from "react";
import { Box, Button, IconButton, LinearProgress, Tooltip, Typography } from "@mui/material";
import { AlertTriangle, Ban, Check, Copy, FolderOpen, PenLine, RotateCcw, Undo2 } from "lucide-react";
import type { XvClip } from "../data/xVideosData";
import { ageTone } from "../../../components/Newsroom/BreakingDesk/deskRules";
import { srOnly, timeAgo } from "../../../components/Newsroom/BreakingDesk/shared";
import { XRichText } from "../../../components/Newsroom/BreakingDesk/phase1/XPostPreview";
import { ClipFrame, LiveBug, XV_COLORS } from "./ClipFrame";
import { checkClip, fmtDuration, issueLabel } from "./xvTitle";

const AGE_COLOR = { fresh: "success.main", recent: "warning.main", old: "text.disabled" } as const;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

export const xvRowId = (id: string) => `xv-row-${id}`;

const frameSx = { backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", overflow: "hidden", "& > :first-of-type": { borderTop: 0 } } as const;
const rowSx = {
  display: "grid",
  gridTemplateColumns: { xs: "112px minmax(0, 1fr)", md: "56px 112px minmax(0, 1fr) auto" },
  gap: { xs: 1.25, md: 1.75 },
  alignItems: "center",
  px: { xs: 1.5, md: 2 },
  py: 1.25,
  borderTop: "1px solid",
  borderColor: "divider",
  contentVisibility: "auto",
  containIntrinsicSize: "auto 84px",
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
} as const;
const rowIdleSx = { ...rowSx, "&:hover": { backgroundColor: "action.hover" } } as const;
const rowFocusedSx = { ...rowSx, backgroundColor: "action.selected", boxShadow: "inset 3px 0 0 0 currentColor" } as const;
const metaSx = { display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", fontSize: "0.75rem", color: "text.secondary", minWidth: 0 } as const;
const headlineSx = { mt: 0.5, fontSize: "0.9375rem", fontWeight: 700, lineHeight: 1.45, overflowWrap: "anywhere" } as const;
const openSx = { minHeight: { xs: 40, md: 34 }, borderRadius: "8px", textTransform: "none", fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap", boxShadow: "none", backgroundColor: "text.primary", color: "background.paper", "&:hover": { backgroundColor: "text.primary", opacity: 0.88, boxShadow: "none" } } as const;
const rejectSx = { width: { xs: 40, md: 34 }, height: { xs: 40, md: 34 }, borderRadius: "8px", color: "error.main", "&:hover": { backgroundColor: "rgba(211, 47, 47, 0.08)" } } as const;
const plainBtnSx = { minHeight: 34, borderRadius: "8px", textTransform: "none", fontWeight: 600, fontSize: "0.8125rem", whiteSpace: "nowrap", borderColor: "divider", color: "text.primary" } as const;

/** The orange chip a clip X won't take as it is carries ("11:01, over X's 10:00, trim") */
export function LimitChip({ clip, trim }: { clip: XvClip; trim?: { start: number; end: number } }) {
  const issues = checkClip(clip, trim);
  if (!issues.length) return null;
  return (
    <>
      {issues.map((i) => (
        <Box key={i.code} component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 0.875, py: "2px", borderRadius: "6px", fontSize: "0.6875rem", fontWeight: 600, color: XV_COLORS.orange, backgroundColor: "#FFF3E6", border: "1px solid #FFD2A6", whiteSpace: "nowrap" }}>
          <AlertTriangle size={11} aria-hidden />
          {issueLabel(i)}
        </Box>
      ))}
    </>
  );
}

/** The clip's thumbnail with its LIVE bug and length */
function Thumb({ clip }: { clip: XvClip }) {
  return (
    <ClipFrame id={clip.id} src={clip.src} fileName={clip.fileName} image={clip.poster} sx={{ width: 112, borderRadius: "6px", flexShrink: 0 }}>
      {clip.kind === "live" && <LiveBug size="0.5rem" />}
      <Box component="span" sx={{ position: "absolute", right: 4, bottom: 4, px: 0.5, borderRadius: "3px", backgroundColor: "rgba(0,0,0,0.78)", color: "#fff", fontSize: "0.6875rem", fontWeight: 700, lineHeight: 1.5, fontVariantNumeric: "tabular-nums" }}>
        <Box component="span" sx={srOnly}>Length </Box>
        {fmtDuration(clip.duration)}
      </Box>
    </ClipFrame>
  );
}

/** The desk's x mark on the file name, as a small square tag */
function XMark() {
  return (
    <Box
      component="span"
      title="The file name has the desk's x mark"
      sx={{ display: "inline-grid", placeItems: "center", width: 18, height: 18, borderRadius: "4px", border: "1px solid", borderColor: "text.primary", color: "text.primary", fontSize: "0.75rem", fontWeight: 800, lineHeight: 1, flexShrink: 0 }}
    >
      <span aria-hidden>x</span>
      <Box component="span" sx={srOnly}>
        Marked x
      </Box>
    </Box>
  );
}

/** Where the clip sits inside its day folder ("3 pm convert / jaipur"); nothing for a file loose in the day folder */
function InnerFolder({ path }: { path?: string }) {
  if (!path) return null;
  return (
    <Box component="span" title={path} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, minWidth: 0, maxWidth: { xs: "100%", md: 280 } }}>
      <FolderOpen size={12} aria-hidden style={{ flexShrink: 0 }} />
      <Box component="span" sx={srOnly}>
        Folder{" "}
      </Box>
      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {path}
      </Box>
    </Box>
  );
}

function Meta({ clip, extra }: { clip: XvClip; extra?: React.ReactNode }) {
  return (
    <Box sx={metaSx}>
      <Box component="span" sx={{ display: { md: "none" }, fontWeight: 700, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
        {clock(clip.receivedAt)}
      </Box>
      {clip.picked && <XMark />}
      <InnerFolder path={clip.innerFolder} />
      {extra}
    </Box>
  );
}

function TimeCol({ iso, note, now }: { iso: string; note?: string; now: number }) {
  return (
    <Box sx={{ display: { xs: "none", md: "block" } }}>
      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, backgroundColor: AGE_COLOR[ageTone(iso, now)] }} />
        {clock(iso)}
      </Typography>
      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{note ?? timeAgo(iso, now)}</Typography>
    </Box>
  );
}

/** The headline cell: reading progress, the confirmed headline, or the grey suggestion */
function Headline({ clip, savedTitle }: { clip: XvClip; savedTitle?: string }) {
  if (clip.readingProgress !== undefined) {
    return (
      <Box sx={{ mt: 0.5, maxWidth: 320 }}>
        <Typography sx={{ fontSize: "0.9375rem", fontStyle: "italic", color: "text.secondary" }}>Reading the clip… {clip.readingProgress}%</Typography>
        <LinearProgress variant="determinate" value={clip.readingProgress} aria-label="Reading the clip" sx={{ mt: 0.5, height: 3, borderRadius: 2 }} />
      </Box>
    );
  }
  const confirmed = savedTitle ?? clip.headline;
  if (confirmed) {
    return (
      <Typography lang="hi" sx={headlineSx}>
        {confirmed}
      </Typography>
    );
  }
  return (
    <>
      <Typography lang="hi" sx={headlineSx}>
        {clip.suggestedHeadline ?? "No headline yet"}
      </Typography>
      {clip.suggestedHeadline && clip.headlineSource && (
        <Typography sx={{ mt: 0.125, fontSize: "0.6875rem", color: "text.secondary" }}>{clip.headlineSource === "file_name" ? "From the file name" : "Read from the screen: check it"}</Typography>
      )}
    </>
  );
}

interface QueueProps {
  clips: XvClip[];
  focusedId: string | null;
  now: number;
  /** The saved title per clip, when the desk saved a draft (shown black instead of Suggested) */
  savedTitles: Record<string, string | undefined>;
  scheduled: Record<string, string | undefined>;
  trims: Record<string, { start: number; end: number } | undefined>;
  onFocus: (id: string) => void;
  onOpen: (clip: XvClip) => void;
  onReject: (clip: XvClip) => void;
}

/** New clips, newest first: a listbox the J/K keys move through, Enter opens */
export function VideoQueueList({ clips, focusedId, now, savedTitles, scheduled, trims, onFocus, onOpen, onReject }: QueueProps) {
  return (
    <Box role="listbox" aria-label="Clips to post" aria-orientation="vertical" sx={frameSx}>
      {clips.map((clip) => {
        const focused = clip.id === focusedId;
        const sched = scheduled[clip.id];
        return (
          <Box
            key={clip.id}
            id={xvRowId(clip.id)}
            role="option"
            aria-selected={focused}
            tabIndex={focused ? 0 : -1}
            onClick={() => onFocus(clip.id)}
            onFocus={(e: React.FocusEvent) => e.target === e.currentTarget && onFocus(clip.id)}
            onDoubleClick={() => onOpen(clip)}
            sx={focused ? rowFocusedSx : rowIdleSx}
          >
            <TimeCol iso={clip.receivedAt} now={now} />
            <Thumb clip={clip} />
            <Box sx={{ minWidth: 0 }}>
              <Meta
                clip={clip}
                extra={
                  <>
                    {clip.heldBy && (
                      <Box component="span" sx={{ color: "#1A5FB4", fontWeight: 700 }}>
                        {clip.heldBy} is editing
                      </Box>
                    )}
                    {sched && (
                      <Box component="span" sx={{ px: 0.75, borderRadius: "4px", border: "1px solid", borderColor: "divider", fontWeight: 600 }}>
                        Scheduled {clock(sched)}
                      </Box>
                    )}
                  </>
                }
              />
              <Headline clip={clip} savedTitle={savedTitles[clip.id]} />
            </Box>
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, display: "flex", alignItems: "center", gap: 0.75, justifyContent: { xs: "flex-start", md: "flex-end" }, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
              <LimitChip clip={clip} trim={trims[clip.id]} />
              <Tooltip title="Reject">
                <IconButton size="small" aria-label={`Reject ${clip.fileName}`} onClick={() => onReject(clip)} sx={rejectSx}>
                  <Ban size={16} />
                </IconButton>
              </Tooltip>
              <Button size="small" variant="contained" onClick={() => onOpen(clip)} startIcon={<PenLine size={14} />} sx={openSx} aria-label={`Open ${clip.fileName}`}>
                Open
              </Button>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Posted today: the text that was copied, Copy again, and Undo inside the 5-minute window */
export function VideoPostedList({ clips, now, undoUntil, copiedId, onCopy, onUndo }: { clips: XvClip[]; now: number; undoUntil: Record<string, number>; copiedId: string | null; onCopy: (clip: XvClip) => void; onUndo: (clip: XvClip) => void }) {
  return (
    <Box role="list" aria-label="Posted clips" sx={frameSx}>
      {clips.map((clip) => {
        const until = undoUntil[clip.id];
        return (
          <Box key={clip.id} role="listitem" sx={rowSx}>
            <TimeCol iso={clip.postedAt ?? clip.receivedAt} note="posted" now={now} />
            <Thumb clip={clip} />
            <Box sx={{ minWidth: 0 }}>
              <Meta clip={clip} />
              <Typography component="div" lang="hi" sx={{ mt: 0.5, fontSize: "0.8125rem", lineHeight: 1.55, color: "text.secondary", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                <XRichText text={(clip.postedText ?? "").replace(/\n\s*\n/g, "\n")} />
              </Typography>
            </Box>
            <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, display: "flex", gap: 0.75, justifyContent: { xs: "flex-start", md: "flex-end" } }}>
              <Tooltip title={copiedId === clip.id ? "Copied" : "Copy the post again"}>
                <IconButton size="small" onClick={() => onCopy(clip)} aria-label={`Copy the post again: ${clip.fileName}`} sx={{ width: 36, height: 36, borderRadius: "8px" }}>
                  {copiedId === clip.id ? <Check size={15} /> : <Copy size={15} />}
                </IconButton>
              </Tooltip>
              {until !== undefined && until > now && (
                <Tooltip title="Back to New (possible for 5 minutes after posting). Delete it on X by hand if it went out.">
                  <Button size="small" onClick={() => onUndo(clip)} startIcon={<Undo2 size={14} />} sx={plainBtnSx}>
                    Undo
                  </Button>
                </Tooltip>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Rejected clips with the reason, and Restore to put one back in New */
export function VideoRejectedList({ clips, now, onRestore }: { clips: XvClip[]; now: number; onRestore: (clip: XvClip) => void }) {
  return (
    <Box role="list" aria-label="Rejected clips" sx={frameSx}>
      {clips.map((clip) => (
        <Box key={clip.id} role="listitem" sx={rowSx}>
          <TimeCol iso={clip.receivedAt} now={now} />
          <Thumb clip={clip} />
          <Box sx={{ minWidth: 0 }}>
            <Meta clip={clip} />
            <Typography lang="hi" sx={{ ...headlineSx, color: "text.secondary" }}>
              {clip.headline ?? clip.suggestedHeadline ?? clip.fileName}
            </Typography>
            {clip.rejectedReason && <Typography sx={{ mt: 0.25, fontSize: "0.75rem", color: "error.main" }}>Rejected: {clip.rejectedReason}</Typography>}
          </Box>
          <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" }, display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
            <Button size="small" variant="outlined" onClick={() => onRestore(clip)} startIcon={<RotateCcw size={14} />} sx={plainBtnSx}>
              Restore
            </Button>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
