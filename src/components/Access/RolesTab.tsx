"use client";

import React, { useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, FormControlLabel, MenuItem, Skeleton, Switch, TextField, Typography } from "@mui/material";
import { Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { ADMIN_LOCKED, DEFAULT_ROLE_PERMISSIONS, isBuiltInRole, roleSlug } from "@/lib/access/catalogue";
import { accessService } from "@/lib/access/service";
import { usePermissions } from "@/lib/access/usePermissions";
import type { RoleRecord } from "@/lib/access/types";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import { LoadError, errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import PermissionMatrix from "./PermissionMatrix";
import { ConfirmDialog, LosingAccess, effectiveSet, labelOf, lostKeys, tileSx, type Loaded } from "./shared";

const NEW = "__new__";
const ADMIN_LOCK = new Set(ADMIN_LOCKED);
const NO_LOCK: ReadonlySet<string> = new Set();

interface Draft {
  label: string;
  description: string;
  platformScoped: boolean;
  permissions: Set<string>;
}

const draftOf = (r: RoleRecord | null): Draft =>
  r
    ? { label: r.label, description: r.description, platformScoped: r.platformScoped, permissions: new Set(r.permissions) }
    : { label: "", description: "", platformScoped: false, permissions: new Set() };

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && Array.from(a).every((k) => b.has(k));

function RoleList({ roles, selected, onSelect }: { roles: RoleRecord[]; selected: string; onSelect: (key: string) => void }) {
  return (
    <Box component="ul" aria-label="Roles" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
      {roles.map((r) => {
        const on = r.key === selected;
        return (
          <li key={r.key}>
            <Box
              component="button"
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(r.key)}
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 1,
                textAlign: "left",
                px: 1.25,
                py: 1,
                minHeight: 44,
                border: "1px solid",
                borderColor: on ? "text.primary" : "transparent",
                borderRadius: "8px",
                backgroundColor: on ? "action.selected" : "transparent",
                color: "text.primary",
                fontFamily: "inherit",
                cursor: "pointer",
                "&:hover": { backgroundColor: "action.hover" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: 1 },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</Typography>
                <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                  {r.builtIn ? "Built-in" : "Custom"}
                  {r.platformScoped ? ", own platforms only" : ""}
                </Typography>
              </Box>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary", fontSize: "0.75rem", flexShrink: 0 }} aria-label={`${r.userCount} ${r.userCount === 1 ? "person" : "people"}`}>
                <Users size={13} aria-hidden />
                {r.userCount}
              </Box>
            </Box>
          </li>
        );
      })}
    </Box>
  );
}

function RoleEditor({
  role,
  roles,
  onDirtyChange,
  onSaved,
  onDeleted,
}: {
  role: RoleRecord | null;
  roles: RoleRecord[];
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (key: string) => void;
  onDeleted: () => void;
}) {
  const { catalogue, allowed, overrides, roleKey } = usePermissions();
  const { live, refresh } = useSociaSession();
  const [draft, setDraftState] = useState<Draft>(() => draftOf(role));
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState<null | "save" | "reset" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "save" | "reset" | "delete"; lost: string[] }>(null);

  const isNew = role === null;
  const isAdmin = role?.key === "admin";
  const base = useMemo(() => draftOf(role), [role]);
  const dirty = isNew || draft.label !== base.label || draft.description !== base.description || draft.platformScoped !== base.platformScoped || !sameSet(draft.permissions, base.permissions);

  const setDraft = (next: Draft) => {
    setDraftState(next);
    setError(null);
    const d = isNew || next.label !== base.label || next.description !== base.description || next.platformScoped !== base.platformScoped || !sameSet(next.permissions, base.permissions);
    onDirtyChange(d);
  };

  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(draft.permissions);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    setDraft({ ...draft, permissions: next });
  };

  const applyCopy = (key: string) => {
    setCopyFrom(key);
    const src = roles.find((r) => r.key === key);
    if (src) setDraft({ ...draft, permissions: new Set(src.permissions), platformScoped: isNew ? src.platformScoped : draft.platformScoped });
  };

  const label = draft.label.trim();
  const labelError = !role?.builtIn && (label.length < 1 || label.length > 40) ? "Use 1 to 40 characters." : isNew && label && roles.some((r) => r.key === roleSlug(label)) ? "There is already a role with this name." : null;

  /** What the signed-in person would lose if this role ended up with `perms` */
  const ownLoss = (perms: Iterable<string>) => {
    if (!role || role.key !== roleKey) return [];
    const after = effectiveSet(isAdmin ? [...perms, ...ADMIN_LOCKED] : perms, overrides);
    return lostKeys(allowed, after);
  };

  const afterOwnChange = async () => {
    // Live: /me carries the permissions, so reload it when the signed-in person's own role changed
    if (live && role?.key === roleKey) await refresh();
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const permissions = Array.from(draft.permissions);
      if (isNew) {
        const created = await accessService.createRole({ label, description: draft.description.trim(), platformScoped: draft.platformScoped, permissions });
        onDirtyChange(false);
        onSaved(created.key);
      } else {
        await accessService.updateRole(role.key, {
          // Built-ins keep their name and platform setting (the server answers 409 built_in)
          ...(role.builtIn ? {} : { label, platformScoped: draft.platformScoped }),
          description: draft.description.trim(),
          permissions,
        });
        onDirtyChange(false);
        await afterOwnChange();
        onSaved(role.key);
      }
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
    setConfirm(null);
  };

  const reset = async () => {
    if (!role) return;
    setBusy("reset");
    setError(null);
    try {
      await accessService.resetRole(role.key);
      onDirtyChange(false);
      await afterOwnChange();
      onSaved(role.key);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(null);
    setConfirm(null);
  };

  const remove = async () => {
    if (!role) return;
    setBusy("delete");
    setError(null);
    try {
      await accessService.deleteRole(role.key);
      onDirtyChange(false);
      onDeleted();
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
      setConfirm(null);
    }
  };

  const askSave = () => {
    if (labelError) return;
    const lost = ownLoss(draft.permissions);
    if (lost.length) setConfirm({ kind: "save", lost });
    else void save();
  };

  const askReset = () => {
    if (!role) return;
    // The server holds the defaults; the catalogue's copy previews what a reset would take away
    const defaults = role.defaultPermissions ?? (isBuiltInRole(role.key) ? DEFAULT_ROLE_PERMISSIONS[role.key] : null);
    const lost = defaults ? ownLoss(defaults) : [];
    setConfirm({ kind: "reset", lost });
  };

  const inUse = (role?.userCount ?? 0) > 0;

  return (
    <Box component="section" aria-label={isNew ? "New role" : `Role: ${role.label}`} sx={{ ...tileSx, py: 2, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Typography component="h2" sx={{ fontWeight: 600, fontSize: "1rem" }}>
          {isNew ? "New role" : role.label}
        </Typography>
        {!isNew && (
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {role.builtIn ? "Built-in role" : "Custom role"}, {role.userCount} {role.userCount === 1 ? "person" : "people"}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "minmax(0,1fr) minmax(0,1fr)" }, mb: 1 }}>
        <TextField
          size="small"
          label="Name"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          disabled={role?.builtIn}
          error={!!labelError && (draft.label.length > 0 || !isNew)}
          helperText={role?.builtIn ? "Built-in roles keep their names." : labelError && (draft.label.length > 0 || !isNew) ? labelError : isNew && label ? `Key: ${roleSlug(label) || "…"}` : " "}
          slotProps={{ htmlInput: { maxLength: 40 } }}
        />
        <TextField
          size="small"
          select
          label="Copy permissions from"
          value={copyFrom}
          onChange={(e) => applyCopy(e.target.value)}
          helperText="Replaces the switches below. Nothing is saved until you save."
        >
          {roles
            .filter((r) => r.key !== role?.key)
            .map((r) => (
              <MenuItem key={r.key} value={r.key}>
                {r.label}
              </MenuItem>
            ))}
        </TextField>
        <TextField
          size="small"
          label="Description"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          multiline
          minRows={1}
          maxRows={3}
          sx={{ gridColumn: { sm: "1 / -1" } }}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
      </Box>

      <FormControlLabel
        control={<Switch checked={draft.platformScoped} disabled={role?.builtIn} onChange={(e) => setDraft({ ...draft, platformScoped: e.target.checked })} />}
        label={
          <Box>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>Only their own platforms</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>People with this role post and act only on the platforms set for them on the Users tab.{role?.builtIn ? " Fixed for built-in roles." : ""}</Typography>
          </Box>
        }
        sx={{ alignItems: "flex-start", mx: 0, mb: 2, gap: 1, "& .MuiSwitch-root": { mt: -0.5, flexShrink: 0 } }}
      />

      <PermissionMatrix
        catalogue={catalogue}
        value={draft.permissions}
        onChange={toggle}
        locked={isAdmin ? ADMIN_LOCK : NO_LOCK}
        lockedNote="Always on for Admin, so someone can always manage access."
        disabled={!!busy}
      />

      {error && (
        <Alert severity="error" sx={{ mt: 1, fontSize: "0.8125rem", borderRadius: "8px" }}>
          {error}
        </Alert>
      )}

      {/* Actions stay in reach while scrolling a long matrix; the right padding clears the floating assistant button */}
      <Box sx={{ position: "sticky", bottom: 0, mx: -2, mb: -2, mt: 2, pl: 2, pr: { xs: 2, sm: 9 }, py: 1.25, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", backgroundColor: "background.paper", borderTop: "1px solid", borderColor: "divider", borderRadius: "0 0 12px 12px" }}>
        {!isNew && role.builtIn && (
          <Button onClick={askReset} disabled={!!busy} startIcon={<RotateCcw size={14} />} sx={{ color: "text.primary" }}>
            Reset to default
          </Button>
        )}
        {!isNew && !role.builtIn && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Button color="error" onClick={() => setConfirm({ kind: "delete", lost: [] })} disabled={!!busy || inUse} startIcon={<Trash2 size={14} />} aria-describedby={inUse ? "role-in-use" : undefined}>
              Delete role
            </Button>
            {inUse && (
              <Typography id="role-in-use" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                Move its {role.userCount} {role.userCount === 1 ? "person" : "people"} to another role first.
              </Typography>
            )}
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        {dirty && !isNew && (
          <Button onClick={() => setDraft(base)} disabled={!!busy} sx={{ color: "text.primary" }}>
            Discard changes
          </Button>
        )}
        <Button variant="contained" disableElevation onClick={askSave} disabled={!!busy || !dirty || !!labelError} startIcon={busy === "save" ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {isNew ? "Create role" : "Save changes"}
        </Button>
      </Box>

      <ConfirmDialog
        open={confirm?.kind === "save"}
        title="Save and lose your own access?"
        confirmLabel="Save anyway"
        danger
        busy={busy === "save"}
        onConfirm={() => void save()}
        onClose={() => setConfirm(null)}
      >
        <LosingAccess labels={(confirm?.lost ?? []).map((k) => labelOf(catalogue, k))} extra="You have this role, so the change applies to you as soon as it is saved." />
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "reset"}
        title={`Reset ${role?.label ?? "this role"} to its defaults?`}
        confirmLabel="Reset role"
        danger={!!confirm?.lost.length}
        busy={busy === "reset"}
        onConfirm={() => void reset()}
        onClose={() => setConfirm(null)}
      >
        {confirm?.lost.length ? (
          <LosingAccess labels={confirm.lost.map((k) => labelOf(catalogue, k))} />
        ) : (
          <Typography sx={{ fontSize: "0.875rem" }}>Its permissions go back to what Socia ships with. Exceptions set for single people stay.</Typography>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title={`Delete ${role?.label ?? "this role"}?`}
        confirmLabel="Delete role"
        danger
        busy={busy === "delete"}
        onConfirm={() => void remove()}
        onClose={() => setConfirm(null)}
      >
        <Typography sx={{ fontSize: "0.875rem" }}>Nobody has this role now. Deleting it can&apos;t be undone.</Typography>
      </ConfirmDialog>
    </Box>
  );
}

export default function RolesTab({ roles }: { roles: Loaded<RoleRecord[]> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const list = roles.data;
  const current = selected ?? list?.[0]?.key ?? null;
  const role = current === NEW ? null : (list?.find((r) => r.key === current) ?? list?.[0] ?? null);

  const go = (key: string) => {
    setSelected(key);
    setDirty(false);
    setPending(null);
    // On a phone the editor sits under the list
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 899px)").matches) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const select = (key: string) => {
    if (key === current) return;
    if (dirty) setPending(key);
    else go(key);
  };

  if (!list) {
    if (roles.error) return <LoadError error={roles.error} onRetry={() => void roles.reload()} />;
    return (
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "260px 1fr" } }}>
        <Skeleton variant="rounded" height={260} />
        <Skeleton variant="rounded" height={420} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "260px minmax(0,1fr)" }, alignItems: "start" }}>
      <Box sx={{ ...tileSx, p: 1, position: { md: "sticky" }, top: { md: 12 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 0.75, pt: 0.5, pb: 1 }}>
          <Typography component="h2" sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>
            Roles
          </Typography>
          <Button size="small" startIcon={<Plus size={14} />} onClick={() => select(NEW)} aria-pressed={current === NEW} sx={{ minHeight: 32, color: "text.primary" }}>
            New role
          </Button>
        </Box>
        <RoleList roles={list} selected={current ?? ""} onSelect={select} />
      </Box>

      <Box ref={editorRef} sx={{ scrollMarginTop: 12, minWidth: 0 }}>
        <RoleEditor
          key={current ?? "none"}
          role={role}
          roles={list}
          onDirtyChange={setDirty}
          onSaved={(key) => {
            void roles.reload().then(() => go(key));
          }}
          onDeleted={() => {
            void roles.reload().then(() => go(list[0]?.key ?? "admin"));
          }}
        />
      </Box>

      <ConfirmDialog
        open={!!pending}
        title="Discard your changes?"
        confirmLabel="Discard changes"
        onConfirm={() => pending && go(pending)}
        onClose={() => setPending(null)}
      >
        <Typography sx={{ fontSize: "0.875rem" }}>The role you are editing has changes that are not saved.</Typography>
      </ConfirmDialog>
    </Box>
  );
}
