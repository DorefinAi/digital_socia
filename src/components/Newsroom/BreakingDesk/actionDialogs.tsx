"use client";

import React, { useState } from "react";
import { Box, Typography, Button, Dialog, TextField, Radio, RadioGroup, FormControlLabel, Alert } from "@mui/material";
import { REJECT_REASONS, RejectReason } from "@/types/newsroom";

const paperSx = { slotProps: { paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } } };
const fieldSx = { "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.875rem" } };

function DialogFrame({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: React.ReactNode; actions: React.ReactNode }) {
  return (
    <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</Typography>}
      </Box>
      {children}
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>{actions}</Box>
    </Box>
  );
}

// ─── Reject ───────────────────────────────────────────────────────────────────
export function RejectDialog({ open, headline, onClose, onConfirm }: { open: boolean; headline: string; onClose: () => void; onConfirm: (reason: RejectReason, note: string) => void }) {
  const [reason, setReason] = useState<RejectReason | "">("");
  const [note, setNote] = useState("");
  const needsNote = reason === "other";
  const ready = reason !== "" && (!needsNote || note.trim().length > 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth {...paperSx}>
      <DialogFrame
        title="Reject this story"
        subtitle={headline}
        actions={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" color="error" disabled={!ready} onClick={() => ready && onConfirm(reason as RejectReason, note.trim())}>
              Reject
            </Button>
          </>
        }
      >
        <RadioGroup value={reason} onChange={(e) => setReason(e.target.value as RejectReason)} aria-label="Reason">
          {(Object.keys(REJECT_REASONS) as RejectReason[]).map((key) => (
            <FormControlLabel key={key} value={key} control={<Radio size="small" />} label={<Typography sx={{ fontSize: "0.875rem" }}>{REJECT_REASONS[key]}</Typography>} />
          ))}
        </RadioGroup>
        <TextField
          size="small"
          multiline
          minRows={2}
          label={needsNote ? "Explain the reason (required)" : "Note for the team (optional)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={fieldSx}
        />
      </DialogFrame>
    </Dialog>
  );
}

// ─── Schedule ─────────────────────────────────────────────────────────────────
/** Value for a datetime-local input, in the browser's local time. */
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultSlot() {
  const d = new Date(Date.now() + 30 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return toLocalInput(d);
}

export function ScheduleDialog({ open, headline, initial, onClose, onConfirm }: { open: boolean; headline: string; initial?: string; onClose: () => void; onConfirm: (iso: string) => void }) {
  const [value, setValue] = useState(() => (initial ? toLocalInput(new Date(initial)) : defaultSlot()));
  // The clock is read once when the dialog opens; a minute of slack covers the time spent choosing
  const [openedAt] = useState(() => Date.now());
  const when = new Date(value);
  const valid = !Number.isNaN(when.getTime()) && when.getTime() > openedAt + 60000;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth {...paperSx}>
      <DialogFrame
        title={initial ? "Reschedule post" : "Schedule post"}
        subtitle={headline}
        actions={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" disabled={!valid} onClick={() => valid && onConfirm(when.toISOString())}>
              {initial ? "Reschedule" : "Schedule"}
            </Button>
          </>
        }
      >
        <TextField
          type="datetime-local"
          size="small"
          label="Publish at"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: toLocalInput(new Date()) } }}
          sx={fieldSx}
        />
        {!valid && <Typography sx={{ fontSize: "0.75rem", color: "error.main" }}>Pick a time at least a minute from now.</Typography>}
      </DialogFrame>
    </Dialog>
  );
}

// ─── Recall ───────────────────────────────────────────────────────────────────
export function RecallDialog({ open, headline, platformName, onClose, onConfirm }: { open: boolean; headline: string; platformName: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth {...paperSx}>
      <DialogFrame
        title={`Recall from ${platformName}`}
        subtitle={headline}
        actions={
          step === 1 ? (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="contained" color="error" disabled={!reason.trim()} onClick={() => setStep(2)}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button variant="contained" color="error" onClick={() => onConfirm(reason.trim())}>
                Delete from {platformName}
              </Button>
            </>
          )
        }
      >
        {step === 1 ? (
          <TextField size="small" multiline minRows={2} label="Why is this post being recalled?" value={reason} onChange={(e) => setReason(e.target.value)} sx={fieldSx} autoFocus />
        ) : (
          <Alert severity="error" sx={{ fontSize: "0.8125rem" }}>
            This permanently deletes the post from {platformName}. The record stays in Published, marked Recalled, and the story goes back to the queue so a corrected version can go out.
          </Alert>
        )}
      </DialogFrame>
    </Dialog>
  );
}

// ─── Posted by hand (live desk) ───────────────────────────────────────────────
const POST_LINK = /^https:\/\/(www\.)?(x|twitter)\.com\/\w{1,15}\/status\/\d{5,25}(?:[/?#].*)?$/;

/** Asks for the link of a post the operator made by hand, so the desk can record it as posted. */
export function PostedLinkDialog({ open, headline, platformName, busy, onClose, onConfirm }: { open: boolean; headline: string; platformName: string; busy?: boolean; onClose: () => void; onConfirm: (permalink: string) => Promise<string | null> }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const value = link.trim();
  const valid = POST_LINK.test(value);

  const confirm = async () => {
    if (!valid || busy) return;
    setError(await onConfirm(value));
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth {...paperSx}>
      <DialogFrame
        title={`Save as posted on ${platformName}`}
        subtitle={headline}
        actions={
          <>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="contained" disabled={!valid || busy} onClick={() => void confirm()}>
              {busy ? "Saving" : "Save as posted"}
            </Button>
          </>
        }
      >
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
          The card was downloaded. Post it on {platformName}, then paste the post&apos;s link here.
        </Typography>
        <TextField
          size="small"
          label="Link to the post"
          placeholder="https://x.com/handle/status/…"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && void confirm()}
          error={!!error || (value.length > 0 && !valid)}
          helperText={error ?? (value.length > 0 && !valid ? "Paste the full link of the post, like https://x.com/handle/status/123…" : " ")}
          autoFocus
          sx={fieldSx}
        />
      </DialogFrame>
    </Dialog>
  );
}
