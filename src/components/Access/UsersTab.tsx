"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { ChevronRight, KeyRound, Pencil, Search, UserPlus } from "lucide-react";
import { ADMIN_LOCKED, BUILT_IN_ROLE_KEYS, BUILT_IN_ROLE_LABELS, PLATFORM_OPTIONS, platformLabel } from "@/lib/access/catalogue";
import { accessService } from "@/lib/access/service";
import { usePermissions } from "@/lib/access/usePermissions";
import type { AccessUser, RoleRecord, UserPatch } from "@/lib/access/types";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import { LoadError, errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import { Avatar, ConfirmDialog, LosingAccess, effectiveSet, formatDateTime, labelOf, lostKeys, tileSx, useLoad, type Loaded } from "./shared";
import UserPermissionsDrawer from "./UserPermissionsDrawer";
import AddPersonDialog, { type ActorScope } from "./AddPersonDialog";
import SetPasswordDialog from "./SetPasswordDialog";

/** Read by screen readers, not shown */
const visuallyHidden = { position: "absolute", width: 1, height: 1, p: 0, m: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 } as const;

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
      sx={{ minWidth: 140, fontSize: "0.8125rem", "& .MuiSelect-select": { py: 0.75 } }}
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
  const { user: self, allowed, overrides, catalogue, roleKey, platformScoped } = usePermissions();
  const { live, refresh } = useSociaSession();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<null | { user: AccessUser; patch: UserPatch; lost: string[]; extra?: string }>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  // Both dialogs remount (fresh key) on every opening, so a form and any password in it start empty
  const [dialogSeq, setDialogSeq] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<AccessUser | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // The person just added: scroll to them, then let the highlight fade after a while
  useEffect(() => {
    if (!highlightId) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-user-id="${CSS.escape(highlightId)}"]`)).find((n) => n.offsetParent !== null);
    el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const t = setTimeout(() => setHighlightId(null), 8000);
    return () => clearTimeout(t);
  }, [highlightId]);

  // The role picker: the server's roles when we may read them, else the built-ins plus every role someone has
  const options: RoleOption[] = useMemo(() => {
    if (roles.data) return roles.data.map((r) => ({ key: r.key, label: r.label, permissions: r.permissions, platformScoped: r.platformScoped }));
    const map = new Map<string, RoleOption>(BUILT_IN_ROLE_KEYS.map((k) => [k, { key: k, label: BUILT_IN_ROLE_LABELS[k], permissions: null, platformScoped: null }]));
    (users.data ?? []).forEach((u) => {
      if (!map.has(u.role)) map.set(u.role, { key: u.role, label: u.roleLabel, permissions: null, platformScoped: null });
    });
    return Array.from(map.values());
  }, [roles.data, users.data]);

  // The signed-in admin's platform limit; the server holds a scoped admin to their own platforms
  const scope: ActorScope = useMemo(
    // /me says it; an older server does not, so fall back to the role list
    () => ({ scoped: platformScoped ?? options.find((o) => o.key === roleKey)?.platformScoped === true, platforms: self?.platforms ?? [] }),
    [platformScoped, options, roleKey, self?.platforms],
  );

  /** Why this admin cannot set the person's password (the server refuses it too), or null when they can */
  const passwordBlock = (u: AccessUser): string | null => {
    const role = options.find((o) => o.key === u.role);
    if (role?.permissions?.some((p) => !allowed.has(p))) return `${u.name} can do more than you can. Ask a full admin.`;
    if (scope.scoped && (role?.platformScoped === false || u.platforms.some((p) => !scope.platforms.includes(p)))) return `${u.name} works beyond your platforms. Ask a full admin.`;
    return null;
  };

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

  const openPassword = (u: AccessUser) => {
    setDialogSeq((n) => n + 1);
    setPasswordFor(u);
    setPasswordOpen(true);
  };

  // Your own password is changed under Your profile (the server refuses it here)
  const profileLink = (compact: boolean) => (
    <Button component={Link} href="/profile" size="small" aria-label="Change your own password under Your profile" sx={{ minHeight: 32, px: 1, minWidth: 0, color: "text.secondary", fontSize: compact ? "0.75rem" : undefined, whiteSpace: "nowrap", textDecoration: "underline", textUnderlineOffset: "3px" }}>
      Your profile
    </Button>
  );

  // Until we know who is signed in, offer nothing (your own row must not get the button)
  const notYet = (
    <Typography component="span" sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
      <span aria-hidden>—</span>
      <Box component="span" sx={visuallyHidden}>
        Loading
      </Box>
    </Typography>
  );

  /** Table: a short note with the reason on hover or focus. Tiles have room, so the reason is written out. */
  const blockedNote = (why: string, compact: boolean) =>
    compact ? (
      <Tooltip title={why} describeChild>
        <Typography component="span" tabIndex={0} sx={{ fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap", cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: "3px" }}>
          Ask a full admin
        </Typography>
      </Tooltip>
    ) : (
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{why}</Typography>
    );

  /** Tiles have room for the words; the table row, already eight columns wide, gets a labelled key button */
  const passwordButton = (u: AccessUser) => {
    if (!self) return notYet;
    if (u.id === self.id) return profileLink(false);
    const why = passwordBlock(u);
    if (why) return blockedNote(why, false);
    return (
      <Button size="small" variant="outlined" onClick={() => openPassword(u)} startIcon={<KeyRound size={14} aria-hidden />} aria-label={`Set a new password for ${u.name}`} sx={{ minHeight: 32, px: 1.25, borderColor: "divider", color: "text.primary", whiteSpace: "nowrap" }}>
        Set new password
      </Button>
    );
  };

  const passwordIcon = (u: AccessUser) => {
    if (!self) return notYet;
    if (u.id === self.id) return profileLink(true);
    const why = passwordBlock(u);
    if (why) return blockedNote(why, true);
    return (
      <Tooltip title="Set new password">
        <IconButton size="small" onClick={() => openPassword(u)} aria-label={`Set a new password for ${u.name}`} sx={{ width: 32, height: 32, borderRadius: "8px", border: "1px solid", borderColor: "divider", color: "text.primary" }}>
          <KeyRound size={15} aria-hidden />
        </IconButton>
      </Tooltip>
    );
  };

  const highlightSx = (u: AccessUser) =>
    u.id === highlightId ? { backgroundColor: "action.selected", boxShadow: (t: { palette: { success: { main: string } } }) => `inset 3px 0 0 ${t.palette.success.main}`, transition: "background-color 600ms ease" } : { transition: "background-color 600ms ease" };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", flex: "1 1 220px" }}>
          To change your own password, open{" "}
          <Box component={Link} href="/profile" sx={{ color: "text.primary", fontWeight: 600, textUnderlineOffset: "3px" }}>
            Your profile
          </Box>
          .
        </Typography>
        <Button
          variant="contained"
          disableElevation
          startIcon={<UserPlus size={16} aria-hidden />}
          onClick={() => {
            setDialogSeq((n) => n + 1);
            setAddOpen(true);
          }}
          sx={{ ml: "auto", flexShrink: 0, minHeight: 40 }}
        >
          Add person
        </Button>
      </Box>
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
                <TableCell sx={{ px: 1 }}>Password</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((u) => (
                <TableRow key={u.id} hover data-user-id={u.id} sx={{ opacity: u.active ? 1 : 0.6, "&:last-of-type td": { borderBottom: "none" }, ...highlightSx(u) }}>
                  <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Avatar name={u.name} size={28} />
                      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, minWidth: 110 }}>
                        {u.name}
                        {youTag(u)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary", wordBreak: "break-all", minWidth: 160 }}>{u.email}</TableCell>
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
                  {/* Date over time, to leave room for the Password column */}
                  <TableCell sx={{ color: "text.secondary", whiteSpace: "pre-line", minWidth: 96 }}>{formatDateTime(u.lastLoginAt).replace(", ", "\n")}</TableCell>
                  <TableCell sx={{ px: 1 }}>{passwordIcon(u)}</TableCell>
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
            <Box component="li" key={u.id} data-user-id={u.id} sx={{ ...tileSx, opacity: u.active ? 1 : 0.7, display: "flex", flexDirection: "column", gap: 1.25, ...highlightSx(u) }}>
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
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Password</Typography>
                <Box sx={{ ml: u.id === self?.id ? -1 : 0 }}>{passwordButton(u)}</Box>
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

      {list && (
        <AddPersonDialog
          key={`add-${dialogSeq}`}
          open={addOpen}
          options={options}
          allowed={allowed}
          scope={scope}
          onClose={() => setAddOpen(false)}
          onCreated={(created) => {
            setAddOpen(false);
            setQuery("");
            users.setData((l) => (l ? [...l.filter((x) => x.id !== created.id), created] : l));
            setToast({ ok: true, text: `${created.name} can now sign in.` });
            setHighlightId(created.id);
            void users.reload();
            void roles.reload();
          }}
        />
      )}

      <SetPasswordDialog
        key={`password-${dialogSeq}`}
        open={passwordOpen}
        user={passwordFor}
        onClose={() => setPasswordOpen(false)}
        onDone={(u, withTotp) => {
          users.setData((l) => l?.map((x) => (x.id === u.id ? { ...x, ...u } : x)) ?? l);
          setPasswordOpen(false);
          setToast({ ok: true, text: withTotp ? `${u.name}'s password is set and two-step sign-in is reset. They were signed out everywhere.` : `${u.name}'s password is set. They were signed out everywhere.` });
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
