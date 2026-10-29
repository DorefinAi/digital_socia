// One access API for the screens: the Socia server live, the localStorage demo with NEXT_PUBLIC_USE_MOCKS=true.
// Live responses are read leniently, so a field the server adds or renames later does not blank a screen.

import { api } from "@/lib/socia/client";
import { USE_MOCKS } from "@/lib/socia/config";
import { fallbackRoleLabel } from "./catalogue";
import { mockAccess } from "./mockStore";
import type { AccessUser, AuditEntity, AuditEntry, AuditPage, PermissionOverride, RoleInput, RolePatch, RoleRecord, UserPatch, UserPermissions } from "./types";

const enc = encodeURIComponent;
type Raw = Record<string, unknown>;

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);
const list = <T = Raw>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function readRole(r: Raw): RoleRecord {
  return {
    key: str(r.key),
    label: str(r.label, fallbackRoleLabel(str(r.key))),
    description: str(r.description),
    builtIn: Boolean(r.builtIn),
    platformScoped: Boolean(r.platformScoped),
    userCount: typeof r.userCount === "number" ? r.userCount : 0,
    permissions: list<string>(r.permissions).filter((p) => typeof p === "string"),
    defaultPermissions: Array.isArray(r.defaultPermissions) ? (r.defaultPermissions as string[]) : null,
  };
}

function readUser(u: Raw): AccessUser {
  const overrides = u.overrides;
  return {
    id: str(u.id),
    name: str(u.name),
    email: str(u.email),
    role: str(u.role),
    roleLabel: str(u.roleLabel, fallbackRoleLabel(str(u.role))),
    platforms: list<string>(u.platforms),
    active: u.active !== false,
    totpEnabled: Boolean(u.totpEnabled),
    overrides: typeof overrides === "number" ? overrides : Array.isArray(overrides) ? overrides.length : typeof u.overrideCount === "number" ? u.overrideCount : typeof u.overridesCount === "number" ? u.overridesCount : 0,
    createdAt: strOrNull(u.createdAt),
    lastLoginAt: strOrNull(u.lastLoginAt),
  };
}

function readAudit(row: Raw, i: number): AuditEntry {
  // The older audit route answers { a: <row>, actor: <name> }; accept that and a flat row
  const a = (row.a && typeof row.a === "object" ? row.a : row) as Raw;
  const actor = row.actor ?? a.actor ?? a.actorName;
  return {
    id: String(a.id ?? i),
    at: str(a.at),
    actorName: typeof actor === "string" ? actor : actor && typeof actor === "object" ? strOrNull((actor as Raw).name) : null,
    action: str(a.action),
    entityType: str(a.entityType),
    entityId: str(a.entityId),
    entityLabel: strOrNull(a.entityLabel ?? row.entityLabel),
    before: a.before ?? null,
    after: a.after ?? null,
  };
}

const liveAccess = {
  async listRoles(): Promise<RoleRecord[]> {
    const res = await api<Raw>("GET", "/admin/roles");
    return list(res.roles ?? res.items).map(readRole);
  },
  async createRole(input: RoleInput): Promise<RoleRecord> {
    const res = await api<Raw>("POST", "/admin/roles", input);
    return readRole((res.role as Raw) ?? res);
  },
  async updateRole(key: string, patch: RolePatch): Promise<RoleRecord> {
    const res = await api<Raw>("PATCH", `/admin/roles/${enc(key)}`, patch);
    return readRole((res.role as Raw) ?? res);
  },
  async resetRole(key: string): Promise<RoleRecord> {
    const res = await api<Raw>("POST", `/admin/roles/${enc(key)}/reset`);
    return readRole((res.role as Raw) ?? res);
  },
  async deleteRole(key: string): Promise<void> {
    await api<unknown>("DELETE", `/admin/roles/${enc(key)}`);
  },
  async listUsers(): Promise<AccessUser[]> {
    const res = await api<Raw>("GET", "/admin/users");
    return list(res.users ?? res.items).map(readUser);
  },
  async updateUser(id: string, patch: UserPatch): Promise<AccessUser> {
    const res = await api<Raw>("PATCH", `/admin/users/${enc(id)}`, patch);
    return readUser((res.user as Raw) ?? res);
  },
  async userPermissions(id: string): Promise<UserPermissions> {
    const res = await api<Raw>("GET", `/admin/users/${enc(id)}/permissions`);
    return { role: str(res.role), roleLabel: strOrNull(res.roleLabel) ?? undefined, permissions: list<UserPermissions["permissions"][number]>(res.permissions) };
  },
  async putOverrides(id: string, overrides: PermissionOverride[]): Promise<UserPermissions | null> {
    const res = await api<Raw>("PUT", `/admin/users/${enc(id)}/overrides`, { overrides });
    return Array.isArray(res.permissions) ? { role: str(res.role), permissions: res.permissions as UserPermissions["permissions"] } : null;
  },
  async listAudit(entity: AuditEntity | null, limit: number, before?: string): Promise<AuditPage> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (entity) q.set("entity", entity);
    if (before) q.set("before", before);
    const res = await api<Raw>("GET", `/admin/audit?${q}`);
    const items = list(res.items ?? res.entries).map(readAudit);
    const next = res.nextBefore;
    return { items, nextBefore: next === null || next === undefined ? null : String(next) };
  },
  async updateProfile(name: string): Promise<void> {
    await api<unknown>("PATCH", "/me", { name });
  },
  async changePassword(current: string, next: string): Promise<void> {
    await api<unknown>("POST", "/me/password", { current, next });
  },
};

export interface AccessService {
  listRoles(): Promise<RoleRecord[]>;
  createRole(input: RoleInput): Promise<RoleRecord>;
  updateRole(key: string, patch: RolePatch): Promise<RoleRecord>;
  resetRole(key: string): Promise<RoleRecord>;
  deleteRole(key: string): Promise<void>;
  listUsers(): Promise<AccessUser[]>;
  updateUser(id: string, patch: UserPatch): Promise<AccessUser>;
  userPermissions(id: string): Promise<UserPermissions>;
  /** Resolves to the new effective permissions when the server sends them */
  putOverrides(id: string, overrides: PermissionOverride[]): Promise<UserPermissions | null>;
  listAudit(entity: AuditEntity | null, limit: number, before?: string): Promise<AuditPage>;
  updateProfile(name: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

export const accessService: AccessService = USE_MOCKS ? mockAccess : liveAccess;
