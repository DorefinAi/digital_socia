"use client";

// Basic details: name (PATCH /me), and the read-only email, role, platforms and account status.

import React, { useState } from "react";
import Link from "next/link";
import { Box, Button, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import { ImageIcon, UserRound } from "lucide-react";
import { platformLabel } from "@/lib/access/catalogue";
import { accessService } from "@/lib/access/service";
import type { PermissionsUser } from "@/lib/access/usePermissions";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import { DetailRow, SectionCard } from "./parts";

const outlineBtnSx = { minHeight: 36, px: 1.5, fontWeight: 600, color: "text.primary", border: "1px solid", borderColor: "divider", borderRadius: "10px" } as const;

function NameForm({ name, onDone, notify }: { name: string; onDone: () => void; notify: (text: string) => void }) {
  const { refresh, live } = useSociaSession();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const invalid = trimmed.length < 1 || trimmed.length > 80;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    if (trimmed === name) {
      onDone();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await accessService.updateProfile(trimmed);
      if (live) await refresh();
      notify("Name saved.");
      onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={save} noValidate aria-label="Change your name" sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
      <TextField
        size="small"
        label="Name"
        value={value}
        autoFocus
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onDone();
          }
        }}
        error={invalid || !!error}
        helperText={invalid ? "Use 1 to 80 characters." : (error ?? "As the desk shows it to others.")}
        slotProps={{ htmlInput: { maxLength: 80, autoComplete: "name" } }}
        sx={{ flex: "1 1 220px" }}
      />
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button onClick={onDone} disabled={busy} sx={{ height: 40, color: "text.primary" }}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disableElevation disabled={busy || invalid} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ height: 40 }}>
          Save name
        </Button>
      </Box>
    </Box>
  );
}

export default function BasicDetails({
  id,
  user,
  roleLabel,
  showCardLink,
  editing,
  setEditing,
  notify,
}: {
  id: string;
  user: PermissionsUser;
  roleLabel: string;
  showCardLink: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  notify: (text: string) => void;
}) {
  return (
    <SectionCard
      id={id}
      icon={<UserRound size={18} />}
      title="Basic details"
      description="Who you are on the desk. An admin manages your email, role and platforms."
      action={
        !editing ? (
          <Button onClick={() => setEditing(true)} aria-label="Edit your name" sx={outlineBtnSx}>
            Edit
          </Button>
        ) : undefined
      }
    >
      <DetailRow label="Name">
        {editing ? <NameForm key={user.name} name={user.name} onDone={() => setEditing(false)} notify={notify} /> : <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{user.name}</Typography>}
      </DetailRow>
      <DetailRow label="Email">
        <Typography component="span" sx={{ fontSize: "0.875rem" }}>
          {user.email}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Used to sign in. Ask an admin to change it.</Typography>
      </DetailRow>
      <DetailRow label="Role">{roleLabel}</DetailRow>
      <DetailRow label="Platforms">
        {user.platforms.length ? (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {user.platforms.map((p) => (
              <Chip key={p} size="small" variant="outlined" label={platformLabel(p)} sx={{ height: 24, fontSize: "0.75rem", fontWeight: 600, borderColor: "divider" }} />
            ))}
          </Box>
        ) : (
          "All platforms"
        )}
      </DetailRow>
      <DetailRow label="Account status">
        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
          <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: user.active ? "success.main" : "text.disabled" }} />
          {user.active ? "Active" : "Inactive"}
        </Box>
      </DetailRow>
      {showCardLink && (
        <DetailRow label="Card backgrounds">
          <Button component={Link} href="/ai-content/templates" size="small" startIcon={<ImageIcon size={15} />} sx={{ px: 0.75, ml: -0.75, color: "text.primary" }}>
            Manage your card backgrounds
          </Button>
        </DetailRow>
      )}
    </SectionCard>
  );
}
