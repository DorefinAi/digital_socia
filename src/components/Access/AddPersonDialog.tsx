"use client";

import React, { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { PLATFORM_OPTIONS } from "@/lib/access/catalogue";
import { passwordProblem } from "@/lib/access/password";
import { accessService } from "@/lib/access/service";
import type { AccessUser } from "@/lib/access/types";
import { ApiError } from "@/lib/socia/client";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import PasswordField from "./PasswordField";

export interface AddRoleOption {
  key: string;
  label: string;
  /** null when Socia could not read the role's permissions */
  permissions: string[] | null;
}

// Same shape the server accepts (admin.ts EMAIL_RE): local@domain, no spaces
const EMAIL_RE = /^[^\s@]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/;

/** A role is out of reach when it can do something the signed-in admin cannot (the server refuses it too). */
const beyond = (o: AddRoleOption, allowed: ReadonlySet<string>) => !!o.permissions && o.permissions.some((p) => !allowed.has(p));

/** The lowest-access desk role this admin may give: Digital Team (operator) when it exists, else the role that can do least. */
export function defaultRoleKey(options: AddRoleOption[], allowed: ReadonlySet<string>): string {
  const usable = options.filter((o) => !beyond(o, allowed));
  const operator = usable.find((o) => o.key === "operator");
  if (operator) return operator.key;
  const known = usable.filter((o) => o.permissions && o.key !== "viewer").sort((a, b) => a.permissions!.length - b.permissions!.length);
  return known[0]?.key ?? usable.find((o) => o.key !== "admin")?.key ?? options[0]?.key ?? "";
}

/**
 * Settings → Access → Users → Add person. Mount it with a fresh `key` each time it opens, so the form starts empty.
 */
export default function AddPersonDialog({
  open,
  options,
  allowed,
  onClose,
  onCreated,
}: {
  open: boolean;
  options: AddRoleOption[];
  allowed: ReadonlySet<string>;
  onClose: () => void;
  onCreated: (user: AccessUser) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(() => defaultRoleKey(options, allowed));
  const [platforms, setPlatforms] = useState<string[]>(["x"]);
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [emailTaken, setEmailTaken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const trimmedName = name.replace(/\s+/g, " ").trim();
  const trimmedEmail = email.trim();
  const problems = {
    name: !trimmedName ? "Type the person's name." : trimmedName.length > 80 ? "Use 80 characters or fewer." : null,
    email: !trimmedEmail ? "Type their email address." : !EMAIL_RE.test(trimmedEmail) ? "Type a valid email address, like name@example.com." : null,
    role: !role ? "Choose a role." : null,
    password: passwordProblem(password),
  };
  // Field messages show after the first try to submit, then follow the typing
  const shown = {
    name: submitted ? problems.name : null,
    email: emailTaken ?? (submitted ? problems.email : null),
    role: submitted ? problems.role : null,
    password: submitted ? problems.password : null,
  };

  const togglePlatform = (key: string) => setPlatforms((list) => (list.includes(key) ? list.filter((p) => p !== key) : [...list, key]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    // Move to the first field that needs fixing, so its message is read out
    const first = problems.name ? nameRef : problems.email || emailTaken ? emailRef : problems.role ? roleRef : problems.password ? passwordRef : null;
    if (first) {
      first.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const created = await accessService.createUser({ name: trimmedName, email: trimmedEmail, role, platforms: PLATFORM_OPTIONS.map((p) => p.key).filter((k) => platforms.includes(k)), password });
      setPassword("");
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") {
        setEmailTaken(err.message || "Someone already uses this email.");
        emailRef.current?.focus();
      } else {
        setFormError(errorText(err));
      }
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { component: "form", onSubmit: submit, noValidate: true, sx: { borderRadius: "14px", backgroundImage: "none", m: { xs: 1.5, sm: 4 }, width: { xs: "calc(100% - 24px)", sm: "calc(100% - 64px)" }, maxHeight: { xs: "calc(100% - 24px)", sm: "calc(100% - 64px)" } } } as object }}
    >
      <DialogTitle sx={{ fontSize: "1rem", fontWeight: 700, pb: 0.5 }}>Add a person</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: -0.5 }}>They can sign in as soon as you add them.</Typography>

        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField
            size="small"
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputRef={nameRef}
            autoFocus
            autoComplete="off"
            error={!!shown.name}
            helperText={shown.name ?? " "}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            size="small"
            label="Email"
            required
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailTaken(null);
            }}
            inputRef={emailRef}
            autoComplete="off"
            error={!!shown.email}
            helperText={shown.email ?? " "}
            slotProps={{ htmlInput: { maxLength: 200, autoCapitalize: "off", spellCheck: false } }}
          />
        </Box>

        <FormControl size="small" fullWidth required error={!!shown.role}>
          <InputLabel id="add-person-role-label">Role</InputLabel>
          <Select
            labelId="add-person-role-label"
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            inputRef={roleRef}
            renderValue={(v) => options.find((o) => o.key === v)?.label ?? v}
          >
            {options.map((o) => {
              const tooMuch = beyond(o, allowed);
              return (
                <MenuItem key={o.key} value={o.key} disabled={tooMuch} sx={{ fontSize: "0.875rem" }}>
                  <ListItemText primary={o.label} secondary={tooMuch ? "Can do more than you can" : undefined} slotProps={{ primary: { sx: { fontSize: "0.875rem" } }, secondary: { sx: { fontSize: "0.75rem" } } }} />
                </MenuItem>
              );
            })}
          </Select>
          <FormHelperText>{shown.role ?? "What they can open and do. You can change it later."}</FormHelperText>
        </FormControl>

        <FormControl component="fieldset" variant="standard">
          <FormLabel component="legend" sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "text.primary", "&.Mui-focused": { color: "text.primary" } }}>
            Platforms
          </FormLabel>
          <FormGroup row sx={{ columnGap: 1 }}>
            {PLATFORM_OPTIONS.map((p) => (
              <FormControlLabel
                key={p.key}
                control={<Checkbox size="small" checked={platforms.includes(p.key)} onChange={() => togglePlatform(p.key)} />}
                label={p.label}
                slotProps={{ typography: { sx: { fontSize: "0.875rem" } } }}
                sx={{ mr: 1, minHeight: 40 }}
              />
            ))}
          </FormGroup>
          <FormHelperText sx={{ mt: 0 }}>The platforms they post and act on. You can change them later.</FormHelperText>
        </FormControl>

        <Box>
          <PasswordField id="add-person-password" label="Starting password" value={password} onChange={setPassword} error={shown.password} disabled={busy} inputRef={passwordRef} />
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 1.25 }}>
            Share this password with them privately. They can change it under Your profile.
          </Typography>
        </Box>

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
        <Button type="submit" variant="contained" disableElevation disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          Add person
        </Button>
      </DialogActions>
    </Dialog>
  );
}
