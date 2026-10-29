"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Alert, Box, Button, Chip, CircularProgress, Collapse, TextField, Typography } from "@mui/material";
import { ImageIcon, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { platformLabel } from "@/lib/access/catalogue";
import { accessService } from "@/lib/access/service";
import { usePermissions } from "@/lib/access/usePermissions";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import { AllowedMark, Avatar, SectionHeading, formatDate, formatDateTime, groupCatalogue, tileSx } from "./shared";

const fieldLabelSx = { fontSize: "0.75rem", color: "text.secondary", mb: 0.25 } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ py: 1.25, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: "none", pt: 0 } }}>
      <Typography component="div" sx={fieldLabelSx}>
        {label}
      </Typography>
      <Box sx={{ fontSize: "0.875rem" }}>{children}</Box>
    </Box>
  );
}

function NameForm({ name }: { name: string }) {
  const { refresh, live } = useSociaSession();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const trimmed = value.trim();
  const invalid = trimmed.length < 1 || trimmed.length > 80;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || trimmed === name) return;
    setBusy(true);
    setMessage(null);
    try {
      await accessService.updateProfile(trimmed);
      if (live) await refresh();
      setMessage({ ok: true, text: "Name saved." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    }
    setBusy(false);
  };

  return (
    <Box component="form" onSubmit={save} noValidate sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
      <TextField
        size="small"
        label="Name"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMessage(null);
        }}
        error={invalid}
        helperText={invalid ? "Use 1 to 80 characters." : message?.text}
        slotProps={{ htmlInput: { maxLength: 80, autoComplete: "name" }, formHelperText: { sx: { color: message && !message.ok ? "error.main" : undefined } } }}
        sx={{ flex: "1 1 220px" }}
      />
      <Button type="submit" variant="contained" disableElevation disabled={busy || invalid || trimmed === name} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ height: 40 }}>
        Save name
      </Button>
    </Box>
  );
}

function PasswordForm() {
  const { live } = useSociaSession();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [touched, setTouched] = useState(false);

  const tooShort = next.length > 0 && next.length < 12;
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!current || next.length < 12 || confirm !== next) return;
    setBusy(true);
    setError(null);
    try {
      await accessService.changePassword(current, next);
      setDone(true);
      setOpen(false);
      setCurrent("");
      setNext("");
      setConfirm("");
      setTouched(false);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  return (
    <Box>
      {done && (
        <Alert severity="success" sx={{ mb: 1, fontSize: "0.8125rem", borderRadius: "8px" }}>
          Password changed.{live ? " Your other devices were signed out." : ""}
        </Alert>
      )}
      {!open && (
        <Button variant="outlined" startIcon={<KeyRound size={15} />} onClick={() => { setOpen(true); setDone(false); }} sx={{ borderColor: "divider", color: "text.primary" }} aria-expanded={false} aria-controls="change-password">
          Change password
        </Button>
      )}
      <Collapse in={open} unmountOnExit>
        <Box id="change-password" component="form" onSubmit={submit} noValidate sx={{ display: "grid", gap: 1.5, pt: 0.5 }}>
          <TextField size="small" type="password" label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" error={touched && !current} helperText={touched && !current ? "Enter your current password." : undefined} />
          <TextField size="small" type="password" label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" error={tooShort || (touched && next.length < 12)} helperText="At least 12 characters." />
          <TextField size="small" type="password" label="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" error={mismatch} helperText={mismatch ? "The two new passwords don't match." : undefined} />
          {error && (
            <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main" }}>
              {error}
            </Typography>
          )}
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button onClick={() => { setOpen(false); setError(null); setTouched(false); }} disabled={busy} sx={{ color: "text.primary" }}>
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

export default function ProfilePage() {
  const { ready, user, roleLabel, catalogue, overrides, can } = usePermissions();
  const [show, setShow] = useState<"all" | "allowed">("all");

  if (!ready || !user) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress size={26} aria-label="Loading your profile" />
      </Box>
    );
  }

  const groups = groupCatalogue(catalogue);
  const exception = (key: string) => overrides.find((o) => o.permission === key);
  const pagesAllowed = groups.pages.filter((p) => can(p.key)).length;
  const actionItems = groups.actions.flatMap((s) => s.items);
  const actionsAllowed = actionItems.filter((p) => can(p.key)).length;
  const showCardLink = can("card_template.own") && can("page.post_studio.x");

  const rows = (items: typeof catalogue) =>
    items
      .filter((p) => show === "all" || can(p.key))
      .map((p) => {
        const ex = exception(p.key);
        return (
          <Box component="li" key={p.key} sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, py: 1, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: "none" } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: can(p.key) ? "text.primary" : "text.secondary" }}>{p.label}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{p.description}</Typography>
              {ex && (
                <Chip size="small" variant="outlined" label="Set for you by an admin" sx={{ mt: 0.5, height: 20, fontSize: "0.6875rem", borderColor: "divider" }} />
              )}
            </Box>
            <AllowedMark allowed={can(p.key)} />
          </Box>
        );
      });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Who */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        <Avatar name={user.name} size={44} />
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
            {user.name}
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", overflowWrap: "anywhere" }}>
            {roleLabel} on the digital desk
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 5fr) minmax(0, 7fr)" }, alignItems: "start" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          {/* Account */}
          <Box component="section" aria-labelledby="profile-account" sx={{ ...tileSx, py: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <UserRound size={16} aria-hidden />
              <Typography id="profile-account" component="h2" sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                Account
              </Typography>
            </Box>
            <Box sx={{ mb: 1.5 }}>
              <NameForm key={user.name} name={user.name} />
            </Box>
            <Field label="Email">
              <Box component="span" sx={{ overflowWrap: "anywhere" }}>{user.email}</Box>
            </Field>
            <Field label="Role">{roleLabel}</Field>
            <Field label="Platforms">
              {user.platforms.length ? (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {user.platforms.map((p) => (
                    <Chip key={p} size="small" label={platformLabel(p)} sx={{ height: 22, fontSize: "0.75rem" }} />
                  ))}
                </Box>
              ) : (
                "All platforms"
              )}
            </Field>
            <Field label="Account status">
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: user.active ? "success.main" : "text.disabled" }} />
                {user.active ? "Active" : "Inactive"}
              </Box>
              {(user.createdAt || user.lastLoginAt) && (
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
                  {user.createdAt ? `On the desk since ${formatDate(user.createdAt)}. ` : ""}
                  {user.lastLoginAt ? `Last signed in ${formatDateTime(user.lastLoginAt)}.` : ""}
                </Typography>
              )}
            </Field>
            {showCardLink && (
              <Field label="Card backgrounds">
                <Button component={Link} href="/ai-content/x?tab=templates" size="small" startIcon={<ImageIcon size={15} />} sx={{ px: 0.75, ml: -0.75, color: "text.primary" }}>
                  Manage your card backgrounds
                </Button>
              </Field>
            )}
          </Box>

          {/* Sign-in security */}
          <Box component="section" aria-labelledby="profile-security" sx={{ ...tileSx, py: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <ShieldCheck size={16} aria-hidden />
              <Typography id="profile-security" component="h2" sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                Sign-in security
              </Typography>
            </Box>
            {user.totpEnabled !== null && (
              <Field label="Two-step sign-in">
                {user.totpEnabled ? "On: you enter a code from your authenticator app." : "Off. Ask an admin to turn it on for you."}
              </Field>
            )}
            <Field label="Password">
              <PasswordForm />
            </Field>
          </Box>
        </Box>

        {/* What you can do */}
        <Box component="section" aria-labelledby="profile-can" sx={{ ...tileSx, py: 2, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            <Box>
              <Typography id="profile-can" component="h2" sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                What you can do
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                {pagesAllowed} of {groups.pages.length} pages and {actionsAllowed} of {actionItems.length} actions, from the {roleLabel} role{overrides.length ? " and your exceptions" : ""}.
              </Typography>
            </Box>
            <Box role="group" aria-label="Show" sx={{ display: "inline-flex", border: "1px solid", borderColor: "divider", borderRadius: "8px", p: "2px" }}>
              {(["all", "allowed"] as const).map((v) => (
                <Box
                  key={v}
                  component="button"
                  type="button"
                  aria-pressed={show === v}
                  onClick={() => setShow(v)}
                  sx={{
                    border: "none",
                    borderRadius: "6px",
                    px: 1.25,
                    minHeight: 30,
                    fontFamily: "inherit",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: show === v ? "text.primary" : "transparent",
                    color: show === v ? "background.paper" : "text.secondary",
                    "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: 1 },
                  }}
                >
                  {v === "all" ? "Everything" : "Only allowed"}
                </Box>
              ))}
            </Box>
          </Box>

          <SectionHeading aside={<Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{pagesAllowed} of {groups.pages.length}</Typography>}>Pages</SectionHeading>
          <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mb: 2 }}>
            {rows(groups.pages)}
          </Box>

          <SectionHeading aside={<Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{actionsAllowed} of {actionItems.length}</Typography>}>Actions</SectionHeading>
          {groups.actions.map((section) => {
            const items = rows(section.items);
            if (!items.length) return null;
            return (
              <Box key={section.title} sx={{ mb: 1.5 }}>
                <Typography component="h4" sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.secondary", mt: 1 }}>
                  {section.title}
                </Typography>
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                  {items}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
