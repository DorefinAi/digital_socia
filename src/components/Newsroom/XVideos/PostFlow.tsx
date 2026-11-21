"use client";

// Copy & Mark Posted for a video: the "Ready for X" dialog (the tweet is copied, the clip is saved, then X's
// composer), the 5-minute undo bar, and the reason asked on Reject. Posting stays by hand; nothing is sent.

import React, { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { Check, Download, ExternalLink } from "lucide-react";
import type { XvClip } from "@/data/xVideosData";
import { fmtDuration, fmtSize } from "./xvTitle";
import type { UndoEntry } from "./deskState";

const stepSx = { display: "flex", gap: 1.5, alignItems: "center", border: "1px solid", borderColor: "divider", borderRadius: "10px", px: 1.625, py: 1.375 } as const;
const smBtnSx = { minHeight: 30, borderRadius: "8px", textTransform: "none", fontWeight: 600, fontSize: "0.75rem", whiteSpace: "nowrap", borderColor: "divider", color: "text.primary", flexShrink: 0 } as const;
const priBtnSx = { minHeight: 34, borderRadius: "8px", textTransform: "none", fontWeight: 700, fontSize: "0.8125rem", whiteSpace: "nowrap", boxShadow: "none", backgroundColor: "#000", color: "#fff", "&:hover": { backgroundColor: "#000", opacity: 0.88, boxShadow: "none" } } as const;

function StepNum({ done, n }: { done: boolean; n: number }) {
  return (
    <Box aria-hidden sx={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, backgroundColor: done ? "success.main" : "#111", color: "#fff", fontWeight: 800, fontSize: "0.75rem" }}>
      {done ? <Check size={15} strokeWidth={3} /> : n}
    </Box>
  );
}

interface ReadyProps {
  open: boolean;
  clip: XvClip;
  text: string;
  /** The clipboard took the text (false: the browser blocked it, copy by hand) */
  copied: boolean;
  trimmed: { start: number; end: number } | null;
  hasNext: boolean;
  onCopyAgain: () => void;
  onNext: () => void;
  onDone: () => void;
}

/** Screen 4: after Copy & Mark Posted, the steps left to do by hand */
export function ReadyForXDialog({ open, clip, text, copied, trimmed, hasNext, onCopyAgain, onNext, onDone }: ReadyProps) {
  const [saved, setSaved] = useState(false);
  return (
    <Dialog open={open} onClose={onDone} maxWidth="sm" fullWidth aria-labelledby="xv-ready-title" slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
      <DialogTitle id="xv-ready-title" sx={{ display: "flex", alignItems: "center", gap: 1, pb: 0.5, fontSize: "1.0625rem", fontWeight: 700 }}>
        Ready for X
        <Box component="span" sx={{ ml: "auto", px: 0.75, borderRadius: "4px", backgroundColor: "#E8F5E9", color: "success.dark", fontSize: "0.6875rem", fontWeight: 800 }}>
          Marked posted
        </Box>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>Posting stays by hand, as with breaking posts. A video post needs one more step: the file.</Typography>
        <Box sx={stepSx}>
          <StepNum done={copied} n={1} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>{copied ? "Tweet copied" : "Copy the tweet"}</Typography>
            <Typography lang="hi" sx={{ mt: 0.25, fontSize: "0.75rem", color: "text.secondary", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {copied ? text : "The browser blocked the clipboard. Press Copy again."}
            </Typography>
          </Box>
          <Button size="small" variant="outlined" onClick={onCopyAgain} sx={smBtnSx}>
            Copy again
          </Button>
        </Box>
        <Box sx={stepSx}>
          <StepNum done={saved} n={2} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>{saved ? "Video saved" : "Save the video"}</Typography>
            <Typography sx={{ mt: 0.25, fontSize: "0.75rem", color: "text.secondary", overflowWrap: "anywhere" }}>
              {clip.fileName} · {fmtDuration(clip.duration)} · {fmtSize(clip.size)}, as filed (no re-encode)
              {trimmed ? `. The trim (${fmtDuration(trimmed.start)}–${fmtDuration(trimmed.end)}) is not applied in this demo; use Open in Video Studio to export a cut.` : ""}
            </Typography>
          </Box>
          <Button size="small" variant="outlined" component="a" href={clip.src} download={clip.fileName} onClick={() => setSaved(true)} startIcon={<Download size={13} />} sx={smBtnSx}>
            Download clip
          </Button>
        </Box>
        <Box sx={stepSx}>
          <StepNum done={false} n={3} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>Post it on X</Typography>
            <Typography sx={{ mt: 0.25, fontSize: "0.75rem", color: "text.secondary" }}>Opens X&apos;s composer. Paste the text, attach the video.</Typography>
          </Box>
          <Button size="small" variant="contained" component="a" href="https://x.com/compose/post" target="_blank" rel="noopener noreferrer" endIcon={<ExternalLink size={13} />} sx={{ ...priBtnSx, minHeight: 30, fontSize: "0.75rem" }}>
            Open X
          </Button>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        {hasNext && (
          <Button variant="outlined" onClick={onNext} sx={{ ...smBtnSx, minHeight: 34, fontSize: "0.8125rem" }}>
            Next clip
          </Button>
        )}
        <Button variant="contained" onClick={onDone} sx={priBtnSx}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Marked posted · Undo within 4:52 · UNDO", bottom centre, one per post still inside its 5 minutes */
export function UndoBar({ entries, onUndo, onExpire }: { entries: UndoEntry[]; onUndo: (clipId: string) => void; onExpire: (now: number) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!entries.length) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (entries.some((e) => e.until <= n)) onExpire(n);
    }, 1000);
    return () => clearInterval(t);
  }, [entries, onExpire]);
  const live = entries.filter((e) => e.until > now);
  if (!live.length) return null;
  return (
    <Box role="status" aria-live="polite" sx={{ position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 1500, display: "flex", flexDirection: "column", gap: 1, width: "max-content", maxWidth: "calc(100vw - 32px)" }}>
      {live.slice(-3).map((e) => {
        const left = Math.max(0, Math.ceil((e.until - now) / 1000));
        return (
          <Box key={e.clipId} sx={{ display: "flex", alignItems: "center", gap: 1.75, px: 1.75, py: 1.125, borderRadius: "10px", backgroundColor: "#111", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", fontSize: "0.8125rem" }}>
            <Box component="span" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
              Marked posted
            </Box>
            <Box component="span" lang="hi" sx={{ color: "#9AA3B2", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260, display: { xs: "none", sm: "inline" } }}>
              {e.title}
            </Box>
            <Box component="span" sx={{ color: "#9AA3B2", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              Undo within {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </Box>
            <Button size="small" onClick={() => onUndo(e.clipId)} sx={{ minHeight: 30, minWidth: 0, color: "#FFD400", fontWeight: 800 }}>
              Undo
            </Button>
          </Box>
        );
      })}
    </Box>
  );
}

const REASONS = ["Same clip already posted", "Not news", "Poor video or sound", "Wrong district"];

/** Reject asks why (a chip or typed), like the X desk */
export function RejectClipDialog({ clip, onClose, onReject }: { clip: XvClip | null; onClose: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const close = () => {
    setReason("");
    onClose();
  };
  return (
    <Dialog open={!!clip} onClose={close} maxWidth="xs" fullWidth aria-labelledby="xv-reject-title" slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
      <DialogTitle id="xv-reject-title" sx={{ fontSize: "1rem", fontWeight: 700, pb: 0.5 }}>
        Reject this clip?
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mb: 1.5, overflowWrap: "anywhere" }}>{clip?.fileName} moves to Rejected. Restore puts it back.</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1.5 }}>
          {REASONS.map((r) => (
            <Box key={r} component="button" type="button" aria-pressed={reason === r} onClick={() => setReason(r)} sx={{ px: 1.25, py: 0.5, borderRadius: "16px", border: "1px solid", borderColor: reason === r ? "text.primary" : "divider", backgroundColor: reason === r ? "#ECEEF0" : "background.paper", font: "inherit", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", color: "text.primary" }}>
              {r}
            </Box>
          ))}
        </Box>
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} size="small" fullWidth />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={close} sx={{ textTransform: "none", color: "text.primary" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => {
            onReject(reason.trim() || "No reason given");
            setReason("");
          }}
          sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px", boxShadow: "none" }}
        >
          Reject
        </Button>
      </DialogActions>
    </Dialog>
  );
}
