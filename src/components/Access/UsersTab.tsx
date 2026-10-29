"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ChevronRight, Pencil, Search } from "lucide-react";
import { ADMIN_LOCKED, BUILT_IN_ROLE_KEYS, BUILT_IN_ROLE_LABELS, PLATFORM_OPTIONS, platformLabel } from "@/lib/access/catalogue";
import { accessService } from "@/lib/access/service";
import { usePermissions } from "@/lib/access/usePermissions";
import type { AccessUser, RoleRecord, UserPatch } from "@/lib/access/types";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import { LoadError, errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import { Avatar, ConfirmDialog, LosingAccess, effectiveSet, formatDateTime, labelOf, lostKeys, tileSx, useLoad, type Loaded } from "./shared";
import UserPermissionsDrawer from "./UserPermissionsDrawer";

interface RoleOption {
  key: string;
  label: string;
  permissions: string[] | null;
  platformScoped: boolean | null;
}

function PlatformsCell({ user, disabled, onChange }: { user: AccessUser; disabled: boolean; onChange: (platforms: string[]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toggle = (key: string) => onChange(user.platforms.includes(key) ? user.platforms.filter((p) => p !== key) : [...user.platforms, key]);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
      {user.platforms.length ? (
        user.platforms.map((p) => <Chip key={p} size="small" label={platformLabel(p)} sx={{ height: 22, fontSize: "0.75rem" }} />)
      ) : (
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>None set</Typography>
      )}
      <Tooltip title="Change platforms">
        <span>
          <IconButton size="small" aria-label={`Change ${user.name}'s platforms`} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} disabled={disabled} sx={{ width: 28, height: 28, borderRadius: "6px" }}>
            <Pencil size={13} />
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { borderRadius: "10px", minWidth: 180 } } }}>
        {PLATFORM_OPTIONS.map((p) => (
          <MenuItem key={p.key} onClick={() => toggle(p.key)} role="menuitemcheckbox" aria-checked={user.platforms.includes(p.key)} dense>
            <ListItemIcon>
              <Checkbox edge="start" size="small" checked={user.platforms.includes(p.key)} tabIndex={-1} disableRipple slotProps={{ input: { "aria-hidden": true } }} />
            </ListItemIcon>
            <ListItemText primary={p.label} slotProps={{ primary: { sx: { fontSize: "0.8125rem" } } }} />
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

function RoleSelect({ user, options, disabled, onChange }: { user: AccessUser; options: RoleOption[]; disabled: boolean; onChange: (role: string) => void }) {
  const known = options.some((o) => o.key === user.role);
  return (
    <Select
      size="small"
      value={user.role}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      inputProps={{ "aria-label": `${user.name}'s role` }}
      sx={{ minWidth: 150, fontSize: "0.8125rem", "& .MuiSelect-select": { py: 0.75 } }}
    >
      {!known && <MenuItem value={user.role}>{user.roleLabel}</MenuItem>}
      {options.map((o) => (
        <MenuItem key={o.key} value={o.key} sx={{ fontSize: "0.8125rem" }}>
          {o.label}
        </MenuItem>
      ))}
    </Select>
  );
}

export default function UsersTab({ roles }: { roles: Loaded<RoleRecord[]> }) {
  const users = useLoad(() => accessService.listUsers());
  const { user: self, allowed, overrides, catalogue } = usePermissions();
  const { live, refresh } = useSociaSession();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<null | { user: AccessUser; patch: UserPatch; lost: string[]; extra?: string }>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // The role picker: the server's roles when we may read them, else the built-ins plus every role someone has
  const options: RoleOption[] = useMemo(() => {
    if (roles.data) return roles.data.map((r) => ({ key: r.key, label: r.label, permissions: r.permissions, platformScoped: r.platformScoped }));
    const map = new Map<string, RoleOption>(BUILT_IN_ROLE_KEYS.map((k) => [k, { key: k, label: BUILT_IN_ROLE_LABELS[k], permissions: null, platformScoped: null }]));
    (users.data ?? []).forEach((u) => {
      if (!map.has(u.role)) map.set(u.role, { key: u.role, label: u.roleLabel, permissions: null, platformScoped: null });
    });
    return Array.from(map.values());
  }, [roles.data, users.data]);

  const apply = async (u: AccessUser, patch: UserPatch) => {
    setBusyId(u.id);
    try {
      const next = await accessService.updateUser(u.id, patch);
      users.setData((list) => list?.map((x) => (x.id === u.id ? { ...x, ...next } : x)) ?? list);
      setToast({ ok: true, text: patch.active === false ? `${u.name} can no longer sign in.` : patch.active ? `${u.name} can sign in again.` : patch.role ? `${u.name} is now ${options.find((o) => o.key === patch.role)?.label ?? patch.role}.` : `${u.name}'s platforms saved.` });
      if (patch.role) void roles.reload();
      if (live && u.id === self?.id) await refresh();
    } catch (err) {
      setToast({ ok: false, text: errorText(err) });
    }
    setBusyId(null);
    setConfirm(null);
  };

  /** Changes to your own row get a confirmation when they take access away. */
  const change = (u: AccessUser, patch: UserPatch) => {
    if (u.id !== self?.id) return void apply(u, patch);
    if (patch.active === false) {
      return setConfirm({ user: u, patch, lost: Array.from(allowed), extra: "You will be signed out and can't sign in again until another admin turns your account back on." });
    }
    if (patch.role) {
      const next = options.find((o) => o.key === patch.role);
      const perms = next?.permissions ?? null;
      const after = effectiveSet(patch.role === "admin" ? [...(perms ?? []), ...ADMIN_LOCKED] : (perms ?? []), overrides);
      const lost = perms ? lostKeys(allowed, after) : [];
      if (lost.length || !perms) {
        return setConfirm({ user: u, patch, lost, extra: perms ? undefined : "Socia could not read that role's permissions, so you may lose access to this page." });
      }
    }
    if (patch.platforms && u.platforms.some((p) => !patch.platforms!.includes(p))) {
      const removed = u.platforms.filter((p) => !patch.platforms!.includes(p)).map(platformLabel);
      return setConfirm({ user: u, patch, lost: [], extra: `You will no longer post or act on ${removed.join(" and ")}.` });
    }
    void apply(u, patch);
  };

  const list = users.data;
  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.roleLabel.toLowerCase().includes(q));
  const drawerUser = list?.find((u) => u.id === drawerId) ?? null;

  if (!list) {
    if (users.error) return <LoadError error={users.error} onRetry={() => void users.reload()} />;
    return <Skeleton variant="rounded" height={360} />;
  }

  const exceptionsButton = (u: AccessUser) => (
    <Button size="small" onClick={() => setDrawerId(u.id)} endIcon={<ChevronRight size={14} />} aria-label={`${u.name}'s permissions: ${u.overrides} ${u.overrides === 1 ? "exception" : "exceptions"}`} sx={{ minHeight: 30, px: 1, color: "text.primary", whiteSpace: "nowrap", fontWeight: u.overrides ? 700 : 500 }}>
      {u.overrides ? `${u.overrides} ${u.overrides === 1 ? "exception" : "exceptions"}` : "None"}
    </Button>
  );

  const youTag = (u: AccessUser) =>
    u.id === self?.id ? (
      <Box component="span" sx={{ ml: 0.75, px: 0.75, py: "1px", borderRadius: "6px", border: "1px solid", borderColor: "divider", fontSize: "0.6875rem", fontWeight: 600, color: "text.secondary" }}>
        You
      </Box>
    ) : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <TextField
          size="small"
          placeholder="Search by name, email or role"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            htmlInput: { "aria-label": "Search people" },
            input: { startAdornment: <InputAdornment position="start"><Search size={15} aria-hidden /></InputAdornment> },
          }}
          sx={{ flex: { xs: "1 1 100%", sm: "0 1 320px" } }}
        />
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }} role="status">
          {shown.length === list.length ? `${list.length} people` : `${shown.length} of ${list.length} people`}
        </Typography>
      </Box>

      {shown.length === 0 && (
        <Box sx={{ ...tileSx, py: 4, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>No one matches &ldquo;{query}&rdquo;</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>Try part of a name or an email address.</Typography>
        </Box>
      )}

      {/* Wide screens: a table */}
      {shown.length > 0 && (
        <Box sx={{ ...tileSx, p: 0, overflowX: "auto", display: { xs: "none", lg: "block" } }}>
          <Table size="small" aria-label="People on the desk">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Platforms</TableCell>
                <TableCell>Active</TableCell>
                <TableCell>Exceptions</TableCell>
                <TableCell>Last sign-in</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((u) => (
                <TableRow key={u.id} hover sx={{ opacity: u.active ? 1 : 0.6, "&:last-of-type td": { borderBottom: "none" } }}>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Avatar name={u.name} size={28} />
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {u.name}
                        {youTag(u)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary", wordBreak: "break-all", minWidth: 180 }}>{u.email}</TableCell>
                  <TableCell>
                    <RoleSelect user={u} options={options} disabled={busyId === u.id} onChange={(role) => change(u, { role })} />
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <PlatformsCell user={u} disabled={busyId === u.id} onChange={(platforms) => change(u, { platforms })} />
                  </TableCell>
                  <TableCell>
                    <Switch size="small" checked={u.active} disabled={busyId === u.id} onChange={(e) => change(u, { active: e.target.checked })} slotProps={{ input: { "aria-label": `${u.name} can sign in` } }} />
                  </TableCell>
                  <TableCell>{exceptionsButton(u)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>{formatDateTime(u.lastLoginAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Narrow screens: one card per person */}
      {shown.length > 0 && (
        <Box component="ul" aria-label="People on the desk" sx={{ listStyle: "none", m: 0, p: 0, display: { xs: "flex", lg: "none" }, flexDirection: "column", gap: 1 }}>
          {shown.map((u) => (
            <Box component="li" key={u.id} sx={{ ...tileSx, opacity: u.active ? 1 : 0.7, display: "flex", flexDirection: "column", gap: 1.25 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
                <Avatar name={u.name} size={32} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                    {u.name}
                    {youTag(u)}
                  </Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", overflowWrap: "anywhere" }}>{u.email}</Typography>
                </Box>
                <Switch checked={u.active} disabled={busyId === u.id} onChange={(e) => change(u, { active: e.target.checked })} slotProps={{ input: { "aria-label": `${u.name} can sign in` } }} />
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "88px minmax(0,1fr)", rowGap: 1, columnGap: 1, alignItems: "center", fontSize: "0.8125rem" }}>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Role</Typography>
                <RoleSelect user={u} options={options} disabled={busyId === u.id} onChange={(role) => change(u, { role })} />
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Platforms</Typography>
                <PlatformsCell user={u} disabled={busyId === u.id} onChange={(platforms) => change(u, { platforms })} />
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Exceptions</Typography>
                <Box sx={{ ml: -1 }}>{exceptionsButton(u)}</Box>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Last sign-in</Typography>
                <Typography sx={{ fontSize: "0.8125rem" }}>{formatDateTime(u.lastLoginAt)}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <UserPermissionsDrawer
        user={drawerUser}
        roles={roles.data}
        isSelf={!!drawerUser && drawerUser.id === self?.id}
        onClose={() => setDrawerId(null)}
        onSaved={(count) => {
          if (!drawerUser) return;
          users.setData((l) => l?.map((x) => (x.id === drawerUser.id ? { ...x, overrides: count } : x)) ?? l);
          setToast({ ok: true, text: `${drawerUser.name}'s exceptions saved.` });
          if (live && drawerUser.id === self?.id) void refresh();
        }}
      />

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.patch.active === false ? "Turn off your own account?" : "Change your own access?"}
        confirmLabel={confirm?.patch.active === false ? "Turn off my account" : "Make the change"}
        danger
        busy={!!confirm && busyId === confirm.user.id}
        onConfirm={() => confirm && void apply(confirm.user, confirm.patch)}
        onClose={() => setConfirm(null)}
      >
        {confirm && confirm.lost.length > 0 ? (
          <LosingAccess labels={confirm.lost.map((k) => labelOf(catalogue, k))} extra={confirm.extra} />
        ) : (
          <Typography sx={{ fontSize: "0.875rem" }}>{confirm?.extra}</Typography>
        )}
      </ConfirmDialog>

      {toast && (
        <Snackbar open autoHideDuration={toast.ok ? 3500 : 7000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
          <Alert severity={toast.ok ? "success" : "error"} onClose={() => setToast(null)} variant="filled" sx={{ fontSize: "0.8125rem", borderRadius: "10px" }}>
            {toast.text}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}
