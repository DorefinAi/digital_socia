"use client";

import React, { useRef, useState } from "react";
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Typography } from "@mui/material";
import { passwordProblem } from "@/lib/access/password";
import { accessService } from "@/lib/access/service";
import type { AccessUser } from "@/lib/access/types";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import PasswordField from "./PasswordField";

/**
 * Settings → Access → Users → Set new password, for someone else (your own is under Your profile).
 * Mount it with a fresh `key` per opening, so the password never carries over.
 */
export default function SetPasswordDialog({
  open,
  user,
  onClose,
  onDone,
}: {
  open: boolean;
  user: AccessUser | null;
  onClose: () => void;
  onDone: (user: AccessUser, resetTotp: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [resetTotp, setResetTotp] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const problem = passwordProblem(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitted(true);
    setFormError(null);
    if (problem) {
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const withTotp = resetTotp && user.totpEnabled;
      const next = await accessService.resetPassword(user.id, password, withTotp);
      setPassword("");
      onDone(next, withTotp);
    } catch (err) {
      setFormError(errorText(err));
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={open && !!user}
      onClose={busy ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { component: "form", onSubmit: submit, noValidate: true, sx: { borderRadius: "14px", backgroundImage: "none", m: { xs: 1.5, sm: 4 }, width: { xs: "calc(100% - 24px)", sm: "calc(100% - 64px)" } } } as object }}
    >
      <DialogTitle sx={{ fontSize: "1rem", fontWeight: 700, pb: 1, overflowWrap: "anywhere" }}>Set a new password for {user?.name}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <Alert severity="warning" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
          They will be signed out everywhere and must use the new password.
        </Alert>

        <PasswordField id="set-password-new" label="New password" value={password} onChange={setPassword} error={submitted ? problem : null} disabled={busy} inputRef={passwordRef} />

        {user?.totpEnabled && (
          <Box>
            <FormControlLabel
              control={<Checkbox size="small" checked={resetTotp} onChange={(e) => setResetTotp(e.target.checked)} disabled={busy} slotProps={{ input: { "aria-describedby": "set-password-totp-help" } }} />}
              label="Also reset two-step sign-in"
              slotProps={{ typography: { sx: { fontSize: "0.875rem", fontWeight: 600 } } }}
              sx={{ minHeight: 40 }}
            />
            <Typography id="set-password-totp-help" sx={{ fontSize: "0.75rem", color: "text.secondary", ml: 4 }}>
              Turns off their authenticator code, for when they have lost their phone.
            </Typography>
          </Box>
        )}

        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>Share the new password with them privately.</Typography>

        {formError && (
          <Alert severity="error" role="alert" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
            {formError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={busy} sx={{ color: "text.primary" }}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" color="error" disableElevation disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {resetTotp && user?.totpEnabled ? "Set password and reset" : "Set new password"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
