"use client";

// Watch mode's pieces in the editor's post panel: the banner in the holder's colour (with Ask to take over),
// the green banner once the story is free (Start editing), "Handed over to X" just after a hand-over, the
// "Live · updated just now" note above the Tweet box, and the holder's take-over dialog.

import React, { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { updatedAgo, type AskState } from "@/lib/socia/liveCore";
import { takeoverDialogControls, watchBannerCopy, type TakeoverRequest } from "./storyLiveCore";

/**
 * "Watching Priya: they are editing this story. You can't type here.", with Ask to take over; a story being fixed:
 * "Priya is fixing this post." with no Ask (`canAsk` false). While an ask is out the button stays focusable and
 * says it is busy (aria-disabled, the click does nothing).
 */
export function WatchBanner({ name, color, correcting, ask, onAsk, canAsk }: { name: string; color: string; correcting: boolean; ask: AskState; onAsk: () => void; canAsk: boolean }) {
  const asking = ask.state === "asking";
  const copy = watchBannerCopy(correcting);
  return (
    <Box
      role="status"
      data-testid="watch-banner"
      sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.25, px: 1.5, py: 1.25, borderRadius: "8px", border: "1px solid", borderColor: alpha(color, 0.45), backgroundColor: alpha(color, 0.08) }}
    >
      <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, backgroundColor: color, boxShadow: `0 0 0 3px ${alpha(color, 0.22)}` }} />
      <Typography sx={{ flex: "1 1 180px", minWidth: 0, fontSize: "0.8125rem", lineHeight: 1.45 }}>
        {copy.before}
        <b>{name}</b>
        {copy.after}
      </Typography>
      {canAsk && (
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          onClick={() => !asking && onAsk()}
          aria-disabled={asking || undefined}
          startIcon={asking ? <CircularProgress size={12} color="inherit" /> : undefined}
          sx={{ flexShrink: 0, minHeight: 32, borderRadius: "8px", borderColor: "divider", backgroundColor: "background.paper", textTransform: "none", fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap", "&[aria-disabled='true']": { cursor: "default", color: "text.secondary" } }}
        >
          {asking ? `Asked · waiting for ${ask.name}…` : "Ask to take over"}
        </Button>
      )}
      {ask.state === "declined" && <Typography sx={{ flexBasis: "100%", fontSize: "0.75rem", color: "text.secondary" }}>{ask.name} is keeping the story.</Typography>}
      {ask.state === "failed" && <Typography sx={{ flexBasis: "100%", fontSize: "0.75rem", color: "text.secondary" }}>{ask.message}</Typography>}
    </Box>
  );
}

/**
 * The story is free: "Priya left. Their saved changes are in the story. The story is free." (`name` null: just
 * "The story is free.", after a hand-over nobody took up), with Start editing. While the claim runs the button
 * stays focusable and says it is busy.
 */
export function HolderLeftBanner({ name, onStart, busy, canStart }: { name: string | null; onStart: () => void; busy: boolean; canStart: boolean }) {
  return (
    <Alert
      severity="success"
      icon={false}
      data-testid="holder-left-banner"
      sx={{ alignItems: "center", fontSize: "0.8125rem", borderRadius: "8px", "& .MuiAlert-action": { pt: 0, alignItems: "center" } }}
      action={
        canStart ? (
          <Button
            variant="contained"
            color="success"
            size="small"
            onClick={() => !busy && onStart()}
            aria-busy={busy || undefined}
            startIcon={busy ? <CircularProgress size={12} color="inherit" /> : undefined}
            sx={{ minHeight: 32, borderRadius: "8px", textTransform: "none", fontWeight: 700, whiteSpace: "nowrap", boxShadow: "none" }}
          >
            Start editing
          </Button>
        ) : undefined
      }
    >
      {name ? (
        <>
          <b>{name} left.</b> Their saved changes are in the story. The story is free.
        </>
      ) : (
        "The story is free."
      )}
    </Alert>
  );
}

/** Just after this person handed the story over, until the new holder takes it */
export function HandedOverNote({ name }: { name: string }) {
  return (
    <Alert severity="info" icon={false} role="status" data-testid="handed-over" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
      Handed over to <b>{name}</b>. The story moves to them in a moment.
    </Alert>
  );
}

/** "Live · updated just now" above the Tweet box; the time keeps up while nothing new arrives */
export function LiveNote({ at, final, saved = false, long = false }: { at: number | null; final: boolean; saved?: boolean; long?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (final || saved || long || at === null) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [at, final, saved, long]);
  const label = final ? "final text" : saved ? "too long to stream. Showing saved text" : long ? "too long to stream" : at === null ? "waiting for their text" : `updated ${updatedAgo(Math.max(0, now - at))}`;
  return (
    <Box component="span" data-testid="live-note" sx={{ display: "inline-flex", alignItems: "center", gap: 0.6, fontSize: "0.75rem", fontWeight: 600, color: "text.secondary", whiteSpace: "nowrap" }}>
      <Box aria-hidden component="span" sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: saved || long ? "warning.main" : "success.main" }} />
      Live · {label}
    </Box>
  );
}

/** Live view had worked and dropped: watch mode falls back to the plain read-only view */
export function LiveUnavailableNote() {
  return <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Live view unavailable. You see the story as it was last saved.</Typography>;
}

/**
 * The holder's side: someone asked for the story. Fixing a posted story with unsaved changes, the holder chooses:
 * save the fix (it overwrites the posted record) and hand over, or drop it and hand over.
 */
export function TakeoverDialog({
  request,
  handing,
  handOverBlocked,
  blockedNote,
  fixChanged,
  onKeep,
  onHandOver,
}: {
  request: TakeoverRequest | null;
  /** The hand-over is running */
  handing: boolean;
  /** Something else is running (an export, a save): Hand over waits; Keep editing still works */
  handOverBlocked: boolean;
  /** Says why Hand over waits ("Finish the current export first.") */
  blockedNote?: string;
  fixChanged: boolean;
  onKeep: () => void;
  onHandOver: (fixChoice?: "save" | "drop") => void;
}) {
  // The last ask stays drawn while the dialog closes
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const r = request ?? shown;
  const name = r?.name ?? "Someone";
  const { canKeep, canHandOver } = takeoverDialogControls({ handing, handOverBlocked });
  const busy = handing;
  const handSx = { textTransform: "none", fontWeight: 700, borderRadius: "8px", backgroundColor: "#111", color: "#fff", boxShadow: "none", "&:hover": { backgroundColor: "#2a2a2a" } } as const;
  return (
    <Dialog open={!!request} onClose={canKeep ? onKeep : undefined} aria-labelledby="takeover-title" aria-describedby="takeover-text" slotProps={{ paper: { sx: { borderRadius: "12px", maxWidth: 460 } } }}>
      <DialogTitle id="takeover-title" sx={{ display: "flex", alignItems: "center", gap: 1.25, fontSize: "1.0625rem", fontWeight: 700, pb: 1 }}>
        <Box aria-hidden component="span" sx={{ width: 12, height: 12, borderRadius: "50%", flexShrink: 0, backgroundColor: r?.color ?? "text.secondary" }} />
        {name} wants to take over
      </DialogTitle>
      <DialogContent>
        <Typography id="takeover-text" sx={{ fontSize: "0.875rem", color: "text.secondary", lineHeight: 1.55 }}>
          {fixChanged
            ? `Save your fix (it overwrites the posted record) and hand over, or drop it and hand over. The story then moves to ${name}.`
            : `If you hand over, your changes are saved first and the story moves to ${name}.`}
        </Typography>
        {!handing && handOverBlocked && blockedNote && (
          <Typography role="status" sx={{ mt: 1.25, fontSize: "0.8125rem", fontWeight: 600 }}>
            {blockedNote}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: "wrap" }}>
        {/* Keep editing has the focus: a stray Enter never gives the story away */}
        <Button variant="outlined" color="inherit" onClick={onKeep} disabled={!canKeep} autoFocus sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px", borderColor: "divider" }}>
          Keep editing
        </Button>
        {fixChanged ? (
          <>
            <Button variant="outlined" color="inherit" onClick={() => onHandOver("drop")} disabled={!canHandOver} sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px", borderColor: "divider" }}>
              Drop fix and hand over
            </Button>
            <Button variant="contained" onClick={() => onHandOver("save")} disabled={!canHandOver} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} sx={handSx}>
              Save fix and hand over
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={() => onHandOver()} disabled={!canHandOver} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} sx={handSx}>
            Hand over
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
