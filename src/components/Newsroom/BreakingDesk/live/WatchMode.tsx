"use client";

// Watch mode's pieces in the editor's post panel: the banner in the holder's colour (with Ask to take over),
// the green banner once the story is free (Start editing), "Handed over to X" just after a hand-over, the
// "Live · updated just now" note above the Tweet box, and the holder's take-over dialog.

import React, { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { updatedAgo, type AskState } from "@/lib/socia/liveCore";
import type { TakeoverRequest } from "./useStoryLive";

/** "Watching Priya: they are editing this story. You can't type here.", with Ask to take over */
export function WatchBanner({ name, color, fixing, ask, onAsk, canAsk }: { name: string; color: string; fixing: boolean; ask: AskState; onAsk: () => void; canAsk: boolean }) {
  const asking = ask.state === "asking";
  return (
    <Box
      role="status"
      data-testid="watch-banner"
      sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.25, px: 1.5, py: 1.25, borderRadius: "8px", border: "1px solid", borderColor: alpha(color, 0.45), backgroundColor: alpha(color, 0.08) }}
    >
      <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, backgroundColor: color, boxShadow: `0 0 0 3px ${alpha(color, 0.22)}` }} />
      <Typography sx={{ flex: "1 1 180px", minWidth: 0, fontSize: "0.8125rem", lineHeight: 1.45 }}>
        Watching <b>{name}</b>: they are {fixing ? "fixing this posted story" : "editing this story"}. You can&apos;t type here.
      </Typography>
      {canAsk && (
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          onClick={onAsk}
          disabled={asking}
          startIcon={asking ? <CircularProgress size={12} color="inherit" /> : undefined}
          sx={{ flexShrink: 0, minHeight: 32, borderRadius: "8px", borderColor: "divider", backgroundColor: "background.paper", textTransform: "none", fontSize: "0.8125rem", fontWeight: 700, whiteSpace: "nowrap" }}
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
export function LiveNote({ at, final, saved = false }: { at: number | null; final: boolean; saved?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (final || saved || at === null) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [at, final, saved]);
  const label = final ? "final text" : saved ? "too long to stream. Showing saved text" : at === null ? "waiting for their text" : `updated ${updatedAgo(Math.max(0, now - at))}`;
  return (
    <Box component="span" data-testid="live-note" sx={{ display: "inline-flex", alignItems: "center", gap: 0.6, fontSize: "0.75rem", fontWeight: 600, color: "text.secondary", whiteSpace: "nowrap" }}>
      <Box aria-hidden component="span" sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: saved ? "warning.main" : "success.main" }} />
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
  busy,
  fixChanged,
  onKeep,
  onHandOver,
}: {
  request: TakeoverRequest | null;
  busy: boolean;
  fixChanged: boolean;
  onKeep: () => void;
  onHandOver: (fixChoice?: "save" | "drop") => void;
}) {
  // The last ask stays drawn while the dialog closes
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const r = request ?? shown;
  const name = r?.name ?? "Someone";
  const handSx = { textTransform: "none", fontWeight: 700, borderRadius: "8px", backgroundColor: "#111", color: "#fff", boxShadow: "none", "&:hover": { backgroundColor: "#2a2a2a" } } as const;
  return (
    <Dialog open={!!request} onClose={busy ? undefined : onKeep} aria-labelledby="takeover-title" aria-describedby="takeover-text" slotProps={{ paper: { sx: { borderRadius: "12px", maxWidth: 460 } } }}>
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
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: "wrap" }}>
        {/* Keep editing has the focus: a stray Enter never gives the story away */}
        <Button variant="outlined" color="inherit" onClick={onKeep} disabled={busy} autoFocus sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px", borderColor: "divider" }}>
          Keep editing
        </Button>
        {fixChanged ? (
          <>
            <Button variant="outlined" color="inherit" onClick={() => onHandOver("drop")} disabled={busy} sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px", borderColor: "divider" }}>
              Drop fix and hand over
            </Button>
            <Button variant="contained" onClick={() => onHandOver("save")} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} sx={handSx}>
              Save fix and hand over
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={() => onHandOver()} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} sx={handSx}>
            Hand over
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
