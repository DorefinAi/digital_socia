"use client";

// What the signed-in person may see and do. Live: GET /me (via the session). Demo: the access store in
// localStorage, built from the same catalogue and default role permissions.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { USE_MOCKS } from "@/lib/socia/config";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import type { Me } from "@/lib/socia/types";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CATALOGUE, fallbackRoleLabel, isBuiltInRole, type Permission } from "./catalogue";
import { effectiveFor, getMockAccess, getMockAccessServer, mockAccess, subscribeMockAccess } from "./mockStore";
import type { PermissionOverride } from "./types";

export interface PermissionsUser {
  id: string;
  name: string;
  email: string;
  platforms: string[];
  active: boolean;
  totpEnabled: boolean | null;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export interface PermissionsState {
  /** False until /me has answered (live) */
  ready: boolean;
  can: (key: string) => boolean;
  canAny: (keys: string[]) => boolean;
  /** The allowed keys */
  allowed: ReadonlySet<string>;
  roleKey: string;
  roleLabel: string;
  overrides: PermissionOverride[];
  catalogue: Permission[];
  user: PermissionsUser | null;
  /** Who to ask for access, when known */
  adminName: string | null;
}

const EMPTY: ReadonlySet<string> = new Set();
const noop = () => () => {};

/** Allowed keys from /me; an older server sends the legacy object, so fall back to the role's defaults. */
function allowedFromMe(me: Me): string[] {
  if (Array.isArray(me.permissions)) return me.permissions;
  const role = me.user.role === "digital_team" ? "operator" : me.user.role;
  return isBuiltInRole(role) ? DEFAULT_ROLE_PERMISSIONS[role] : [];
}

export function usePermissions(): PermissionsState {
  const { me, status } = useSociaSession();
  // Demo: subscribe to the store; live: a no-op subscription so the hook order stays the same
  const mock = useSyncExternalStore(USE_MOCKS ? subscribeMockAccess : noop, getMockAccess, getMockAccessServer);

  const base = useMemo(() => {
    if (USE_MOCKS) {
      const self = mockAccess.self(mock);
      const effective = effectiveFor(mock, self);
      const role = mock.roles.find((r) => r.key === self.role);
      const admin = mock.users.find((u) => u.active && u.role === "admin" && u.id !== self.id);
      return {
        ready: true,
        allowed: new Set(effective.filter((p) => p.allowed).map((p) => p.key)) as ReadonlySet<string>,
        roleKey: self.role,
        roleLabel: role?.label ?? fallbackRoleLabel(self.role),
        overrides: self.overrides,
        catalogue: PERMISSION_CATALOGUE,
        user: { id: self.id, name: self.name, email: self.email, platforms: self.platforms, active: self.active, totpEnabled: self.totpEnabled, createdAt: self.createdAt, lastLoginAt: self.lastLoginAt },
        adminName: admin?.name ?? null,
      };
    }
    if (!me) {
      return { ready: status === "signed_out" || status === "offline", allowed: EMPTY, roleKey: "", roleLabel: "", overrides: [], catalogue: PERMISSION_CATALOGUE, user: null, adminName: null };
    }
    const u = me.user;
    return {
      ready: true,
      allowed: new Set(allowedFromMe(me)) as ReadonlySet<string>,
      roleKey: u.role,
      roleLabel: u.roleLabel ?? fallbackRoleLabel(u.role),
      overrides: me.overrides ?? [],
      catalogue: me.catalogue?.length ? me.catalogue : PERMISSION_CATALOGUE,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        platforms: u.platforms,
        active: u.active ?? true,
        totpEnabled: u.totpEnabled ?? null,
        createdAt: u.createdAt ?? null,
        lastLoginAt: u.lastLoginAt ?? null,
      },
      adminName: me.adminName ?? null,
    };
  }, [mock, me, status]);

  const { allowed } = base;
  const can = useCallback((key: string) => allowed.has(key), [allowed]);
  const canAny = useCallback((keys: string[]) => keys.some((k) => allowed.has(k)), [allowed]);
  return useMemo(() => ({ ...base, can, canAny }), [base, can, canAny]);
}
