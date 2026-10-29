"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { Check, Minus } from "lucide-react";
import { ACTION_SECTIONS, isPagePermission, type Permission } from "@/lib/access/catalogue";
import type { PermissionOverride } from "@/lib/access/types";

export { tileSx } from "@/components/Newsroom/SociaDesk/liveShared";

// ─── Catalogue grouping ──────────────────────────────────────────────────────
export interface PermissionSection {
  title: string;
  items: Permission[];
}

/** Pages first, then Actions in their smaller sections. Keys the sections do not know go under "Other actions". */
export function groupCatalogue(catalogue: Permission[]): { pages: Permission[]; actions: PermissionSection[] } {
  const pages = catalogue.filter((p) => isPagePermission(p.key));
  const actions = catalogue.filter((p) => !isPagePermission(p.key));
  const placed = new Set<string>();
  const sections: PermissionSection[] = ACTION_SECTIONS.map((s) => {
    const items = s.keys.map((k) => actions.find((a) => a.key === k)).filter((a): a is Permission => !!a);
    items.forEach((i) => placed.add(i.key));
    return { title: s.title, items };
  }).filter((s) => s.items.length > 0);
  const rest = actions.filter((a) => !placed.has(a.key));
  if (rest.length) sections.push({ title: "Other actions", items: rest });
  return { pages, actions: sections };
}

export const labelOf = (catalogue: Permission[], key: string) => catalogue.find((p) => p.key === key)?.label ?? key;

/** Effective allowed set for one person: an exception wins over the role. */
export function effectiveSet(rolePermissions: Iterable<string>, overrides: PermissionOverride[]): Set<string> {
  const set = new Set(rolePermissions);
  for (const o of overrides) {
    if (o.allowed) set.add(o.permission);
    else set.delete(o.permission);
  }
  return set;
}

/** Keys allowed now that would no longer be allowed after a change. */
export const lostKeys = (now: ReadonlySet<string>, after: ReadonlySet<string>) => Array.from(now).filter((k) => !after.has(k));

// ─── Small pieces ────────────────────────────────────────────────────────────
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        backgroundColor: "text.primary",
        color: "background.paper",
        fontSize: size * 0.38,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {initials(name)}
    </Box>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Unknown" : dateFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Unknown" : `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
}

/** Allowed / Not allowed, with an icon so the state never rests on colour alone. */
export function AllowedMark({ allowed, compact }: { allowed: boolean; compact?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        flexShrink: 0,
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: allowed ? "success.main" : "text.secondary",
      }}
    >
      {allowed ? <Check size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
      {compact ? <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{allowed ? "Allowed" : "Not allowed"}</Box> : allowed ? "Allowed" : "Not allowed"}
    </Box>
  );
}

export function SectionHeading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1, mb: 0.75 }}>
      <Typography component="h3" sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>
        {children}
      </Typography>
      {aside}
    </Box>
  );
}

// ─── Confirm ─────────────────────────────────────────────────────────────────
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
      <DialogTitle sx={{ fontSize: "1rem", fontWeight: 700, pb: 1 }}>{title}</DialogTitle>
      <DialogContent sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{children}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={busy} sx={{ color: "text.primary" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={danger ? "error" : "primary"}
          onClick={onConfirm}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
          disableElevation
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "You will lose: …" body for a change that takes away the signed-in person's own access. */
export function LosingAccess({ labels, extra }: { labels: string[]; extra?: string }) {
  return (
    <>
      <Typography sx={{ fontSize: "0.875rem" }}>This change takes away your own access. You will no longer be able to use:</Typography>
      <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, color: "text.primary", fontSize: "0.875rem", display: "grid", gap: 0.25 }}>
        {labels.slice(0, 8).map((l) => (
          <li key={l}>{l}</li>
        ))}
        {labels.length > 8 && <li>and {labels.length - 8} more</li>}
      </Box>
      {extra && <Typography sx={{ fontSize: "0.875rem", mt: 1.25 }}>{extra}</Typography>}
    </>
  );
}

// ─── Loading data ────────────────────────────────────────────────────────────
export interface Loaded<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/** Loads once on mount (and on reload). Skipped while `enabled` is false. */
export function useLoad<T>(load: () => Promise<T>, enabled = true): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadRef
      .current()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return { data, error, loading, reload, setData };
}
