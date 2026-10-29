"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Box, Button, CircularProgress, Skeleton, Typography } from "@mui/material";
import { History } from "lucide-react";
import { SegmentedControl } from "@/components/Newsroom/ui/controls";
import { LoadError } from "@/components/Newsroom/SociaDesk/liveShared";
import { fallbackRoleLabel, platformLabel, type Permission } from "@/lib/access/catalogue";
import { accessService } from "@/lib/access/service";
import { usePermissions } from "@/lib/access/usePermissions";
import type { AuditEntity, AuditEntry, RoleRecord } from "@/lib/access/types";
import { formatDateTime, labelOf, tileSx, useLoad } from "./shared";

const PAGE = 30;
type Filter = "all" | AuditEntity;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** One plain sentence per change. Unknown actions fall back to their key, so nothing is hidden. */
function describe(e: AuditEntry, roleName: (key: string) => string, userName: (id: string) => string, catalogue: Permission[]): string {
  const who = e.entityType === "role" ? roleName(e.entityId) : (e.entityLabel ?? userName(e.entityId));
  const before = obj(e.before);
  const after = obj(e.after);
  const perm = (v: Record<string, unknown>) => (typeof v.permission === "string" ? labelOf(catalogue, v.permission) : "a permission");
  const list = (keys: string[]) => keys.map((k) => labelOf(catalogue, k)).join(", ");
  switch (e.action) {
    case "role.created":
      return `created the ${who} role`;
    case "role.updated":
      return `changed the ${who} role's details`;
    case "role.deleted":
      return `deleted the ${typeof before.label === "string" ? before.label : who} role`;
    case "role.reset":
      return `reset the ${who} role to its defaults`;
    case "role.permissions_changed": {
      const added = strs(after.added);
      const removed = strs(after.removed);
      if (added.length || removed.length) {
        return [`changed what ${who} can do:`, added.length ? `turned on ${list(added)}` : "", removed.length ? `${added.length ? "; " : ""}turned off ${list(removed)}` : ""].join(" ").replace(/\s+;/, ";").trim();
      }
      return `changed what the ${who} role can do`;
    }
    case "user.role_changed":
      return `moved ${who} from ${typeof before.role === "string" ? roleName(before.role) : "their role"} to ${typeof after.role === "string" ? roleName(after.role) : "a new role"}`;
    case "user.platforms_changed": {
      const p = strs(after.platforms).map(platformLabel);
      return `set ${who}'s platforms to ${p.length ? p.join(", ") : "none"}`;
    }
    case "user.override_set":
      return `${after.allowed === false ? "denied" : "allowed"} ${perm(after)} for ${who} as an exception`;
    case "user.override_cleared":
      return `removed ${who}'s exception for ${perm(before)}`;
    case "user.activated":
      return `turned ${who}'s account back on`;
    case "user.deactivated":
      return `turned off ${who}'s account`;
    case "user.created":
      return `added ${who} to the desk`;
    case "user.password_reset":
      return `reset ${who}'s password`;
    case "user.totp_reset":
      return `reset ${who}'s two-step sign-in`;
    case "user.name_changed":
      return `renamed ${who}`;
    case "user.password_changed":
      return `${who} changed their password`;
    default:
      return `${e.action.replace(/[._]/g, " ")} (${who})`;
  }
}

export default function HistoryTab({ roles }: { roles: RoleRecord[] }) {
  const { catalogue, can } = usePermissions();
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [more, setMore] = useState(false);
  // Names for user ids the history does not label itself
  const users = useLoad(() => accessService.listUsers(), can("users.manage"));

  const load = useCallback(async (f: Filter) => {
    setItems(null);
    setError(null);
    try {
      const page = await accessService.listAudit(f === "all" ? null : f, PAGE);
      setItems(page.items);
      setNextBefore(page.nextBefore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    accessService
      .listAudit(filter === "all" ? null : filter, PAGE)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextBefore(page.nextBefore);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err : new Error(String(err))));
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const loadMore = async () => {
    if (!nextBefore) return;
    setMore(true);
    try {
      const page = await accessService.listAudit(filter === "all" ? null : filter, PAGE, nextBefore);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setNextBefore(page.nextBefore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
    setMore(false);
  };

  const roleName = (key: string) => roles.find((r) => r.key === key)?.label ?? fallbackRoleLabel(key);
  const userName = (id: string) => users.data?.find((u) => u.id === id)?.name ?? "someone";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
        <SegmentedControl<Filter>
          ariaLabel="Show changes to"
          value={filter}
          onChange={(f) => {
            setItems(null);
            setFilter(f);
          }}
          options={[
            { value: "all", label: "Everything" },
            { value: "role", label: "Roles" },
            { value: "user", label: "People" },
          ]}
        />
      </Box>

      {error && !items && <LoadError error={error} onRetry={() => void load(filter)} />}
      {!items && !error && (
        <Box sx={{ display: "grid", gap: 1 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={52} />
          ))}
        </Box>
      )}

      {items && items.length === 0 && (
        <Box sx={{ ...tileSx, py: 4, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>No changes yet</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>Changes to roles and people show up here as they are made.</Typography>
        </Box>
      )}

      {items && items.length > 0 && (
        <Box component="ol" aria-label="Recent changes" sx={{ ...tileSx, listStyle: "none", m: 0, p: 0 }}>
          {items.map((e) => (
            <Box component="li" key={e.id} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", px: 2, py: 1.25, borderTop: "1px solid", borderColor: "divider", "&:first-of-type": { borderTop: "none" } }}>
              <Box sx={{ mt: "2px", color: "text.secondary", flexShrink: 0 }}>
                <History size={15} aria-hidden />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", overflowWrap: "anywhere" }}>
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {e.actorName ?? "Socia"}
                  </Box>{" "}
                  {describe(e, roleName, userName, catalogue)}
                </Typography>
                <Typography component="time" dateTime={e.at} sx={{ display: "block", fontSize: "0.75rem", color: "text.secondary" }}>
                  {formatDateTime(e.at)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {items && error && (
        <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main" }}>
          {error.message}
        </Typography>
      )}
      {items && nextBefore && (
        <Button variant="outlined" onClick={() => void loadMore()} disabled={more} startIcon={more ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ alignSelf: "center", borderColor: "divider", color: "text.primary" }}>
          Show older changes
        </Button>
      )}
    </Box>
  );
}
