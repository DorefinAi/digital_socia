"use client";

// Sign-in & security: change your own password (POST /me/password) and see whether two-step sign-in is on.

import React, { useId, useRef, useState } from "react";
import { Box, Button, CircularProgress, Collapse, IconButton, InputAdornment, TextField, Tooltip, Typography } from "@mui/material";
import { Eye, EyeOff, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { PASSWORD_MIN, passwordLength } from "@/lib/access/password";
import { accessService } from "@/lib/access/service";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import { DetailRow, SectionCard } from "./parts";

/** A password box with show/hide. Not the admin PasswordField: that one generates and copies a password for someone else. */
function SecretField({
  label,
  value,
  onChange,
  autoComplete,
  error,
  helper,
  inputRef,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  error?: boolean;
  helper?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
  describedBy?: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <TextField
      id={id}
      size="small"
      fullWidth
      label={label}
      type={shown ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      error={error}
      helperText={helper}
      inputRef={inputRef}
      slotProps={{
        htmlInput: { spellCheck: false, autoCapitalize: "off", "aria-describedby": describedBy },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={shown ? "Hide password" : "Show password"}>
                <IconButton edge="end" size="small" onClick={() => setShown((s) => !s)} aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={shown}>
                  {shown ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

/** 0 too short, 1 fair, 2 good, 3 strong: length counts most, then the mix of letters, digits and symbols */
function strength(pw: string): 0 | 1 | 2 | 3 {
  const len = passwordLength(pw);
  if (len < PASSWORD_MIN) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const score = (len >= 16 ? 1 : 0) + (len >= 20 ? 1 : 0) + (kinds >= 3 ? 1 : 0) + (kinds === 4 ? 1 : 0);
  return score >= 3 ? 3 : score >= 1 ? 2 : 1;
}
const STRENGTH = ["Too short", "Fair", "Good", "Strong"] as const;

function StrengthHint({ value, id }: { value: string; id: string }) {
  const s = strength(value);
  const colour = ["text.disabled", "warning.main", "success.light", "success.main"][s];
  return (
    <Box id={id} sx={{ mt: 0.75 }}>
      <Box aria-hidden sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.5 }}>
        {[1, 2, 3].map((i) => (
          <Box key={i} sx={{ height: 4, borderRadius: 2, backgroundColor: value && s >= i ? colour : "action.hover", transition: "background-color 160ms ease" }} />
        ))}
      </Box>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.5 }}>
        {value ? (
          <>
            <Box component="span" sx={{ fontWeight: 600, color: s ? "text.primary" : "error.main" }}>
              {STRENGTH[s]}.
            </Box>{" "}
            {s === 0 ? `Use at least ${PASSWORD_MIN} characters.` : s < 3 ? "A longer phrase, or a mix of letters, numbers and symbols, makes it stronger." : "Hard to guess."}
          </>
        ) : (
          `At least ${PASSWORD_MIN} characters. A short phrase of a few words works well.`
        )}
      </Typography>
    </Box>
  );
}

function PasswordForm({ open, onOpen, onClose, notify }: { open: boolean; onOpen: () => void; onClose: () => void; notify: (text: string) => void }) {
  const { live } = useSociaSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const strengthId = useId();

  const tooShort = passwordLength(next) < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== next;

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setTouched(false);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!current || tooShort || confirm !== next) return;
    setBusy(true);
    setError(null);
    try {
      await accessService.changePassword(current, next);
      reset();
      onClose();
      notify(`Password changed.${live ? " Your other devices were signed out." : ""}`);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  return (
    <Box>
      {!open && (
        <Button variant="outlined" startIcon={<KeyRound size={15} />} onClick={onOpen} aria-expanded={false} aria-controls="change-password" sx={{ borderColor: "divider", color: "text.primary", borderRadius: "10px" }}>
          Change password
        </Button>
      )}
      <Collapse in={open} unmountOnExit onEntered={() => firstRef.current?.focus()}>
        <Box
          id="change-password"
          component="form"
          onSubmit={submit}
          noValidate
          aria-label="Change password"
          sx={{ display: "grid", gap: 2, p: { xs: 1.5, sm: 2 }, mt: 0.5, borderRadius: "12px", backgroundColor: "background.default", border: "1px solid", borderColor: "divider", maxWidth: 460 }}
        >
          <SecretField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" inputRef={firstRef} error={touched && !current} helper={touched && !current ? "Enter your current password." : undefined} />
          <Box>
            <SecretField label="New password" value={next} onChange={setNext} autoComplete="new-password" error={touched && tooShort} describedBy={strengthId} />
            <StrengthHint value={next} id={strengthId} />
          </Box>
          <SecretField label="Repeat new password" value={confirm} onChange={setConfirm} autoComplete="new-password" error={mismatch || (touched && confirm !== next)} helper={mismatch || (touched && confirm !== next) ? "The two new passwords don't match." : undefined} />
          {error && (
            <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main", fontWeight: 600 }}>
              {error}
            </Typography>
          )}
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={busy}
              sx={{ color: "text.primary" }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="contained" disableElevation disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
              Change password
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}

export default function SecuritySection({ id, totpEnabled, notify }: { id: string; totpEnabled: boolean | null; notify: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard
      id={id}
      icon={<ShieldCheck size={18} />}
      title="Sign-in & security"
      description="Your password and how you prove it's you when you sign in."
      action={
        !open ? (
          <Button onClick={() => setOpen(true)} aria-controls="change-password" aria-expanded={false} sx={{ minHeight: 36, px: 1.5, fontWeight: 600, color: "text.primary", border: "1px solid", borderColor: "divider", borderRadius: "10px" }}>
            Edit
          </Button>
        ) : undefined
      }
    >
      <DetailRow label="Password">
        <Typography sx={{ fontSize: "0.875rem", mb: open ? 1 : 0 }}>{open ? "Choose a new password. Changing it signs you out on your other devices." : "Set. Changing it signs you out on your other devices."}</Typography>
        <PasswordForm open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} notify={notify} />
      </DetailRow>
      {totpEnabled !== null && (
        <DetailRow label="Two-step sign-in">
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25 }}>
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                flexShrink: 0,
                px: 1,
                height: 24,
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: totpEnabled ? "success.main" : "text.secondary",
                backgroundColor: totpEnabled ? "rgba(46,125,50,0.10)" : "action.hover",
              }}
            >
              {totpEnabled ? <ShieldCheck size={13} aria-hidden /> : <ShieldOff size={13} aria-hidden />}
              {totpEnabled ? "On" : "Off"}
            </Box>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5 }}>
              {totpEnabled
                ? "You enter a code from your authenticator app after your password. Lost the app? An admin resets it for you."
                : "Ask an admin to turn it on. An admin also resets it if you lose your authenticator app."}
            </Typography>
          </Box>
        </DetailRow>
      )}
    </SectionCard>
  );
}
