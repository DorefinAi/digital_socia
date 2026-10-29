"use client";

import React, { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Skeleton, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { X } from "lucide-react";
import { ADMIN_LOCKED, type Permission } from "@/lib/access/catalogue";
import { accessService } from "@/lib/access/service";
import { usePermissions } from "@/lib/access/usePermissions";
import type { AccessUser, EffectivePermission, PermissionOverride, RoleRecord } from "@/lib/access/types";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import { AllowedMark, Avatar, ConfirmDialog, LosingAccess, SectionHeading, groupCatalogue, labelOf, lostKeys } from "./shared";

type Choice = "role" | "allow" | "deny";

interface Props {
  user: AccessUser | null;
  roles: RoleRecord[] | null;
  isSelf: boolean;
  onClose: () => void;
  /** Called with the new number of exceptions */
  onSaved: (count: number) => void;
}

function Body({ user, roles, isSelf, onClose, onSaved }: Omit<Props, "user"> & { user: AccessUser }) {
  const { catalogue, allowed } = usePermissions();
  const [effective, setEffective] = useState<EffectivePermission[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [initial, setInitial] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLost, setConfirmLost] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    accessService
      .userPermissions(user.id)
      .then((res) => {
        if (cancelled) return;
        const c: Record<string, Choice> = {};
        res.permissions.forEach((p) => {
          c[p.key] = p.source === "override" ? (p.allowed ? "allow" : "deny") : "role";
        });
        setEffective(res.permissions);
        setChoices(c);
        setInitial(c);
      })
      .catch((err) => !cancelled && setLoadError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // What the role gives, per permission: from the role list when we have it, else from rows that follow the role
  const role = roles?.find((r) => r.key === user.role);
  const roleGives = (key: string): boolean | null => {
    const row = effective?.find((p) => p.key === key);
    if (typeof row?.roleAllowed === "boolean") return row.roleAllowed;
    if (role) return role.permissions.includes(key) || (role.key === "admin" && ADMIN_LOCKED.includes(key));
    return row && row.source === "role" ? row.allowed : null;
  };
  const resolved = (key: string) => {
    const c = choices[key] ?? "role";
    return c === "allow" ? true : c === "deny" ? false : (roleGives(key) ?? false);
  };

  const changed = Object.keys({ ...choices, ...initial }).filter((k) => (choices[k] ?? "role") !== (initial[k] ?? "role"));
  const overrides: PermissionOverride[] = Object.entries(choices)
    .filter(([, c]) => c !== "role")
    .map(([permission, c]) => ({ permission, allowed: c === "allow" }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await accessService.putOverrides(user.id, overrides);
      if (res) setEffective(res.permissions);
      setInitial(choices);
      onSaved(overrides.length);
      setConfirmLost(null);
      onClose();
    } catch (err) {
      setError(errorText(err));
      setConfirmLost(null);
    }
    setBusy(false);
  };

  const askSave = () => {
    if (isSelf) {
      const after = new Set(catalogue.filter((p) => resolved(p.key)).map((p) => p.key));
      const lost = lostKeys(allowed, after);
      if (lost.length) return setConfirmLost(lost);
    }
    void save();
  };

  const groups = groupCatalogue(catalogue);
  const row = (p: Permission) => {
    const c = choices[p.key] ?? "role";
    const fromRole = roleGives(p.key);
    const on = resolved(p.key);
    const id = `ovr-${p.key.replace(/\./g, "-")}`;
    return (
      <Box component="li" key={p.key} sx={{ py: 1, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: "none" } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id={id} sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              {p.label}
            </Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {c === "role" ? "From the role" : "Exception for this person"}
              {fromRole !== null ? `. The role ${fromRole ? "allows" : "does not allow"} it.` : "."}
            </Typography>
          </Box>
          <AllowedMark allowed={on} />
        </Box>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={c}
          onChange={(_, v: Choice | null) => v && setChoices({ ...choices, [p.key]: v })}
          aria-labelledby={id}
          disabled={busy}
          sx={{ mt: 0.75, "& .MuiToggleButton-root": { textTransform: "none", fontSize: "0.75rem", fontWeight: 600, py: 0.25, px: 1.25, minHeight: 32, lineHeight: 1.2 } }}
        >
          <ToggleButton value="role">Role default</ToggleButton>
          <ToggleButton value="allow">Allow</ToggleButton>
          <ToggleButton value="deny">Deny</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Avatar name={user.name} size={36} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>
            {user.name}
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", overflowWrap: "anywhere" }}>
            {user.roleLabel}, {user.email}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ borderRadius: "8px" }}>
          <X size={18} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 1.5 }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mb: 1.5 }}>
          Exceptions change one permission for this person only. Everything on Role default follows the {user.roleLabel} role, including later changes to it.
        </Typography>
        {loadError && (
          <Alert severity="error" sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
            {loadError}
          </Alert>
        )}
        {!effective && !loadError && (
          <Box sx={{ display: "grid", gap: 1 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" height={64} />
            ))}
          </Box>
        )}
        {effective && (
          <>
            <SectionHeading>Pages</SectionHeading>
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mb: 2 }}>
              {groups.pages.map(row)}
            </Box>
            <SectionHeading>Actions</SectionHeading>
            {groups.actions.map((s) => (
              <Box key={s.title} sx={{ mb: 1.5 }}>
                <Typography component="h4" sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.secondary", mt: 1 }}>
                  {s.title}
                </Typography>
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                  {s.items.map(row)}
                </Box>
              </Box>
            ))}
          </>
        )}
      </Box>

      <Box sx={{ px: 2, py: 1.25, borderTop: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {error && (
          <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main", width: "100%" }}>
            {error}
          </Typography>
        )}
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", flex: 1 }}>
          {overrides.length} {overrides.length === 1 ? "exception" : "exceptions"}
          {changed.length ? `, ${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}` : ""}
        </Typography>
        <Button onClick={onClose} disabled={busy} sx={{ color: "text.primary" }}>
          Cancel
        </Button>
        <Button variant="contained" disableElevation onClick={askSave} disabled={busy || !effective || changed.length === 0} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          Save exceptions
        </Button>
      </Box>

      <ConfirmDialog open={!!confirmLost} title="Save and lose your own access?" confirmLabel="Save anyway" danger busy={busy} onConfirm={() => void save()} onClose={() => setConfirmLost(null)}>
        <LosingAccess labels={(confirmLost ?? []).map((k) => labelOf(catalogue, k))} />
      </ConfirmDialog>
    </Box>
  );
}

/** One person's effective permissions, with Role default / Allow / Deny for each. */
export default function UserPermissionsDrawer(props: Props) {
  return (
    <Drawer
      anchor="right"
      open={!!props.user}
      onClose={props.onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 480 }, borderRadius: { xs: 0, sm: "12px 0 0 12px" }, backgroundImage: "none" } } }}
    >
      {props.user && <Body key={props.user.id} {...props} user={props.user} />}
    </Drawer>
  );
}
