// Demo-mode stand-in for the access API: roles, users, exceptions and their history, kept in this
// browser's localStorage. It follows the server's rules (contract §1, §3) so the screens behave the same.

import { ApiError } from "@/lib/socia/client";
import {
  ADMIN_LOCKED,
  BUILT_IN_ROLE_DESCRIPTIONS,
  BUILT_IN_ROLE_KEYS,
  BUILT_IN_ROLE_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOGUE,
  isBuiltInRole,
  roleSlug,
} from "./catalogue";
import type { AccessUser, AuditEntry, EffectivePermission, PermissionOverride, RoleInput, RolePatch, RoleRecord, UserPatch } from "./types";

interface MockRole {
  key: string;
  label: string;
  description: string;
  builtIn: boolean;
  platformScoped: boolean;
  permissions: string[];
}

interface MockUser {
  id: string;
  name: string;
  email: string;
  role: string;
  platforms: string[];
  active: boolean;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  overrides: PermissionOverride[];
}

export interface MockAccessState {
  roles: MockRole[];
  users: MockUser[];
  audit: AuditEntry[];
  selfId: string;
}

const STORAGE_KEY = "socia_access_demo_v1";
/** The old demo role switcher's key; its value seeds the demo user's role the first time */
const LEGACY_ROLE_KEY = "newsroom_role";
const SELF_ID = "u-aditi";

function builtInRole(key: (typeof BUILT_IN_ROLE_KEYS)[number]): MockRole {
  return {
    key,
    label: BUILT_IN_ROLE_LABELS[key],
    description: BUILT_IN_ROLE_DESCRIPTIONS[key],
    builtIn: true,
    platformScoped: key === "operator",
    permissions: [...DEFAULT_ROLE_PERMISSIONS[key]],
  };
}

function seed(selfRole = "admin"): MockAccessState {
  return {
    selfId: SELF_ID,
    roles: [
      ...BUILT_IN_ROLE_KEYS.map(builtInRole),
      {
        key: "video-editor",
        label: "Video Editor",
        description: "Cuts clips in the Video Studio for YouTube.",
        builtIn: false,
        platformScoped: true,
        permissions: ["page.dashboard", "page.post_studio.youtube", "page.video_studio", "draft.edit", "draft.card", "video.export", "trends.watch"],
      },
    ],
    users: [
      { id: SELF_ID, name: "Aditi Sharma", email: "aditi.sharma@firstindia.co.in", role: selfRole, platforms: ["x", "instagram"], active: true, totpEnabled: true, createdAt: "2026-03-02T05:30:00.000Z", lastLoginAt: "2026-10-29T03:12:00.000Z", overrides: [] },
      { id: "u-rohit", name: "Rohit Meena", email: "rohit.meena@firstindia.co.in", role: "admin", platforms: [], active: true, totpEnabled: true, createdAt: "2026-02-11T06:00:00.000Z", lastLoginAt: "2026-10-28T16:40:00.000Z", overrides: [] },
      { id: "u-sunita", name: "Sunita Rathore", email: "sunita.rathore@firstindia.co.in", role: "editor", platforms: [], active: true, totpEnabled: true, createdAt: "2026-02-20T06:00:00.000Z", lastLoginAt: "2026-10-29T02:05:00.000Z", overrides: [{ permission: "audit.view", allowed: false }] },
      { id: "u-kavya", name: "Kavya Joshi", email: "kavya.joshi@firstindia.co.in", role: "operator", platforms: ["x", "instagram"], active: true, totpEnabled: true, createdAt: "2026-04-14T06:00:00.000Z", lastLoginAt: "2026-10-29T04:48:00.000Z", overrides: [{ permission: "draft.reject", allowed: true }] },
      { id: "u-imran", name: "Imran Qureshi", email: "imran.qureshi@firstindia.co.in", role: "operator", platforms: ["x"], active: true, totpEnabled: false, createdAt: "2026-05-03T06:00:00.000Z", lastLoginAt: "2026-10-27T11:20:00.000Z", overrides: [] },
      { id: "u-pooja", name: "Pooja Verma", email: "pooja.verma@firstindia.co.in", role: "video-editor", platforms: ["youtube"], active: true, totpEnabled: true, createdAt: "2026-07-22T06:00:00.000Z", lastLoginAt: "2026-10-28T09:02:00.000Z", overrides: [] },
      { id: "u-neha", name: "Neha Choudhary", email: "neha.choudhary@firstindia.co.in", role: "viewer", platforms: [], active: true, totpEnabled: false, createdAt: "2026-08-09T06:00:00.000Z", lastLoginAt: "2026-10-21T07:15:00.000Z", overrides: [] },
      { id: "u-sandeep", name: "Sandeep Gurjar", email: "sandeep.gurjar@firstindia.co.in", role: "operator", platforms: ["facebook"], active: false, totpEnabled: true, createdAt: "2026-03-28T06:00:00.000Z", lastLoginAt: "2026-09-30T13:44:00.000Z", overrides: [] },
    ],
    audit: [
      { id: "a8", at: "2026-10-28T12:10:00.000Z", actorName: "Rohit Meena", action: "user.override_set", entityType: "user", entityId: "u-kavya", entityLabel: "Kavya Joshi", before: null, after: { permission: "draft.reject", allowed: true } },
      { id: "a7", at: "2026-10-27T09:32:00.000Z", actorName: "Rohit Meena", action: "user.override_set", entityType: "user", entityId: "u-sunita", entityLabel: "Sunita Rathore", before: null, after: { permission: "audit.view", allowed: false } },
      { id: "a6", at: "2026-10-24T14:05:00.000Z", actorName: "Aditi Sharma", action: "user.deactivated", entityType: "user", entityId: "u-sandeep", entityLabel: "Sandeep Gurjar", before: { active: true }, after: { active: false } },
      { id: "a5", at: "2026-10-20T06:48:00.000Z", actorName: "Aditi Sharma", action: "user.role_changed", entityType: "user", entityId: "u-pooja", entityLabel: "Pooja Verma", before: { role: "operator" }, after: { role: "video-editor" } },
      { id: "a4", at: "2026-10-20T06:40:00.000Z", actorName: "Aditi Sharma", action: "role.created", entityType: "role", entityId: "video-editor", entityLabel: "Video Editor", before: null, after: { label: "Video Editor" } },
      { id: "a3", at: "2026-10-16T10:15:00.000Z", actorName: "Rohit Meena", action: "user.platforms_changed", entityType: "user", entityId: "u-kavya", entityLabel: "Kavya Joshi", before: { platforms: ["x"] }, after: { platforms: ["x", "instagram"] } },
      { id: "a2", at: "2026-10-09T08:00:00.000Z", actorName: "Rohit Meena", action: "role.permissions_changed", entityType: "role", entityId: "viewer", entityLabel: "Viewer", before: null, after: { added: ["trends.watch"], removed: [] } },
      { id: "a1", at: "2026-10-01T05:30:00.000Z", actorName: "Rohit Meena", action: "role.reset", entityType: "role", entityId: "editor", entityLabel: "Chief Editor", before: null, after: null },
    ],
  };
}

// ─── Store plumbing (useSyncExternalStore) ───────────────────────────────────
const SERVER_STATE = seed();
let state: MockAccessState | null = null;
const listeners = new Set<() => void>();

function load(): MockAccessState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockAccessState;
      if (Array.isArray(parsed.roles) && Array.isArray(parsed.users) && Array.isArray(parsed.audit) && parsed.selfId) return parsed;
    }
    const legacy = localStorage.getItem(LEGACY_ROLE_KEY);
    const role = legacy === "digital_team" ? "operator" : legacy && isBuiltInRole(legacy) ? legacy : "admin";
    return seed(role);
  } catch {
    return seed();
  }
}

export function getMockAccess(): MockAccessState {
  if (typeof window === "undefined") return SERVER_STATE;
  if (!state) state = load();
  return state;
}

export const getMockAccessServer = () => SERVER_STATE;

export function subscribeMockAccess(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function commit(next: MockAccessState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: the change still holds for this tab
  }
  listeners.forEach((l) => l());
}

/** Back to the seeded demo (used by the desk's own demo reset). */
export function resetMockAccess() {
  commit(seed());
}

// ─── Rules ───────────────────────────────────────────────────────────────────
const KNOWN = new Set(PERMISSION_CATALOGUE.map((p) => p.key));

function checkKeys(keys: string[]) {
  const unknown = keys.filter((k) => !KNOWN.has(k));
  if (unknown.length) throw new ApiError(400, "invalid", `Unknown permission: ${unknown.join(", ")}.`);
}

function rolePermissions(s: MockAccessState, key: string): string[] {
  const role = s.roles.find((r) => r.key === key);
  if (!role) return [];
  return key === "admin" ? Array.from(new Set([...role.permissions, ...ADMIN_LOCKED])) : role.permissions;
}

export function effectiveFor(s: MockAccessState, user: MockUser): EffectivePermission[] {
  const fromRole = new Set(rolePermissions(s, user.role));
  return PERMISSION_CATALOGUE.map((p) => {
    const o = user.overrides.find((x) => x.permission === p.key);
    return o ? { key: p.key, allowed: o.allowed, source: "override" as const } : { key: p.key, allowed: fromRole.has(p.key), source: "role" as const };
  });
}

const activeAdmins = (s: MockAccessState) => s.users.filter((u) => u.active && u.role === "admin");

function roleLabelOf(s: MockAccessState, key: string) {
  return s.roles.find((r) => r.key === key)?.label ?? key;
}

function toRecord(s: MockAccessState, r: MockRole): RoleRecord {
  return {
    ...r,
    permissions: rolePermissions(s, r.key),
    userCount: s.users.filter((u) => u.role === r.key).length,
    defaultPermissions: isBuiltInRole(r.key) ? DEFAULT_ROLE_PERMISSIONS[r.key] : null,
  };
}

function toUser(s: MockAccessState, u: MockUser): AccessUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    roleLabel: roleLabelOf(s, u.role),
    platforms: u.platforms,
    active: u.active,
    totpEnabled: u.totpEnabled,
    overrides: u.overrides.length,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

function audit(s: MockAccessState, action: string, entityType: "role" | "user", entityId: string, entityLabel: string, before: unknown, after: unknown): AuditEntry {
  const actor = s.users.find((u) => u.id === s.selfId);
  return { id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), actorName: actor?.name ?? null, action, entityType, entityId, entityLabel, before, after };
}

const pause = () => new Promise((r) => setTimeout(r, 250));

// ─── The API, in demo ────────────────────────────────────────────────────────
export const mockAccess = {
  self(s = getMockAccess()) {
    return s.users.find((u) => u.id === s.selfId) ?? s.users[0];
  },

  /** The header's demo switcher: changes the demo user's role without history */
  setSelfRole(role: string) {
    const s = getMockAccess();
    commit({ ...s, users: s.users.map((u) => (u.id === s.selfId ? { ...u, role } : u)) });
  },

  async listRoles(): Promise<RoleRecord[]> {
    await pause();
    const s = getMockAccess();
    return s.roles.map((r) => toRecord(s, r));
  },

  async createRole(input: RoleInput): Promise<RoleRecord> {
    await pause();
    const s = getMockAccess();
    const label = input.label.trim();
    if (label.length < 1 || label.length > 40) throw new ApiError(400, "invalid", "A role name is 1 to 40 characters.");
    const key = roleSlug(label);
    if (!key) throw new ApiError(400, "invalid", "Use letters or numbers in the role name.");
    if (s.roles.some((r) => r.key === key)) throw new ApiError(409, "role_exists", `There is already a role called ${label}.`);
    const base = input.copyFrom ? rolePermissions(s, input.copyFrom) : input.permissions;
    checkKeys(base);
    const role: MockRole = { key, label, description: input.description?.trim() ?? "", builtIn: false, platformScoped: input.platformScoped, permissions: [...base] };
    commit({ ...s, roles: [...s.roles, role], audit: [audit(s, "role.created", "role", key, label, null, { label }), ...s.audit] });
    return toRecord(getMockAccess(), role);
  },

  async updateRole(key: string, patch: RolePatch): Promise<RoleRecord> {
    await pause();
    const s = getMockAccess();
    const role = s.roles.find((r) => r.key === key);
    if (!role) throw new ApiError(404, "not_found", "This role does not exist.");
    if (patch.label !== undefined && (patch.label.trim().length < 1 || patch.label.trim().length > 40)) throw new ApiError(400, "invalid", "A role name is 1 to 40 characters.");
    if (patch.permissions) checkKeys(patch.permissions);
    if (role.builtIn && ((patch.label !== undefined && patch.label.trim() !== role.label) || (patch.platformScoped !== undefined && patch.platformScoped !== role.platformScoped))) {
      throw new ApiError(409, "built_in", "Built-in roles keep their name and platform setting.");
    }
    const permissions = patch.permissions ? (key === "admin" ? Array.from(new Set([...patch.permissions, ...ADMIN_LOCKED])) : patch.permissions) : role.permissions;
    const next: MockRole = {
      ...role,
      label: patch.label?.trim() ?? role.label,
      description: patch.description?.trim() ?? role.description,
      platformScoped: patch.platformScoped ?? role.platformScoped,
      permissions,
    };
    const entries: AuditEntry[] = [];
    if (patch.permissions) {
      const added = permissions.filter((p) => !role.permissions.includes(p));
      const removed = role.permissions.filter((p) => !permissions.includes(p));
      if (added.length || removed.length) entries.push(audit(s, "role.permissions_changed", "role", key, next.label, null, { added, removed }));
    }
    if (next.label !== role.label || next.description !== role.description || next.platformScoped !== role.platformScoped) {
      entries.push(audit(s, "role.updated", "role", key, next.label, { label: role.label, platformScoped: role.platformScoped }, { label: next.label, platformScoped: next.platformScoped }));
    }
    commit({ ...s, roles: s.roles.map((r) => (r.key === key ? next : r)), audit: [...entries, ...s.audit] });
    return toRecord(getMockAccess(), next);
  },

  async resetRole(key: string): Promise<RoleRecord> {
    await pause();
    const s = getMockAccess();
    if (!isBuiltInRole(key)) throw new ApiError(400, "invalid", "Only built-in roles have defaults.");
    const next = builtInRole(key);
    commit({ ...s, roles: s.roles.map((r) => (r.key === key ? next : r)), audit: [audit(s, "role.reset", "role", key, next.label, null, null), ...s.audit] });
    return toRecord(getMockAccess(), next);
  },

  async deleteRole(key: string): Promise<void> {
    await pause();
    const s = getMockAccess();
    const role = s.roles.find((r) => r.key === key);
    if (!role) throw new ApiError(404, "not_found", "This role does not exist.");
    if (role.builtIn) throw new ApiError(400, "invalid", "Built-in roles can't be deleted.");
    const users = s.users.filter((u) => u.role === key).length;
    if (users) throw new ApiError(409, "in_use", `${users} ${users === 1 ? "person has" : "people have"} this role. Give them another role first.`);
    commit({ ...s, roles: s.roles.filter((r) => r.key !== key), audit: [audit(s, "role.deleted", "role", key, role.label, { label: role.label }, null), ...s.audit] });
  },

  async listUsers(): Promise<AccessUser[]> {
    await pause();
    const s = getMockAccess();
    return s.users.map((u) => toUser(s, u));
  },

  async updateUser(id: string, patch: UserPatch): Promise<AccessUser> {
    await pause();
    const s = getMockAccess();
    const user = s.users.find((u) => u.id === id);
    if (!user) throw new ApiError(404, "not_found", "This user does not exist.");
    if (patch.role !== undefined && !s.roles.some((r) => r.key === patch.role)) throw new ApiError(400, "invalid", "Unknown role.");
    const next: MockUser = { ...user, ...patch };
    const losingAdmin = user.role === "admin" && user.active && (next.role !== "admin" || !next.active);
    if (losingAdmin && activeAdmins(s).length <= 1) throw new ApiError(409, "last_admin", "At least one active Admin must remain. Make someone else an Admin first.");
    const entries: AuditEntry[] = [];
    if (patch.role !== undefined && patch.role !== user.role) entries.push(audit(s, "user.role_changed", "user", id, user.name, { role: user.role }, { role: patch.role }));
    if (patch.platforms && patch.platforms.join() !== user.platforms.join()) entries.push(audit(s, "user.platforms_changed", "user", id, user.name, { platforms: user.platforms }, { platforms: patch.platforms }));
    if (patch.active !== undefined && patch.active !== user.active) entries.push(audit(s, patch.active ? "user.activated" : "user.deactivated", "user", id, user.name, { active: user.active }, { active: patch.active }));
    commit({ ...s, users: s.users.map((u) => (u.id === id ? next : u)), audit: [...entries, ...s.audit] });
    return toUser(getMockAccess(), next);
  },

  async userPermissions(id: string) {
    await pause();
    const s = getMockAccess();
    const user = s.users.find((u) => u.id === id);
    if (!user) throw new ApiError(404, "not_found", "This user does not exist.");
    return { role: user.role, permissions: effectiveFor(s, user) };
  },

  async putOverrides(id: string, overrides: PermissionOverride[]) {
    await pause();
    const s = getMockAccess();
    const user = s.users.find((u) => u.id === id);
    if (!user) throw new ApiError(404, "not_found", "This user does not exist.");
    checkKeys(overrides.map((o) => o.permission));
    if (user.role === "admin" && overrides.some((o) => ADMIN_LOCKED.includes(o.permission) && !o.allowed) && activeAdmins(s).filter((u) => u.id !== id).length === 0) {
      throw new ApiError(409, "last_admin", "The last active Admin must keep Manage users and Manage roles.");
    }
    const entries: AuditEntry[] = [];
    for (const o of overrides) {
      const old = user.overrides.find((x) => x.permission === o.permission);
      if (!old || old.allowed !== o.allowed) entries.push(audit(s, "user.override_set", "user", id, user.name, old ?? null, o));
    }
    for (const old of user.overrides) {
      if (!overrides.some((o) => o.permission === old.permission)) entries.push(audit(s, "user.override_cleared", "user", id, user.name, old, null));
    }
    const next = { ...user, overrides };
    commit({ ...s, users: s.users.map((u) => (u.id === id ? next : u)), audit: [...entries, ...s.audit] });
    return { role: next.role, permissions: effectiveFor(getMockAccess(), next) };
  },

  async listAudit(entity: "role" | "user" | null, limit: number, before?: string) {
    await pause();
    const s = getMockAccess();
    const all = s.audit.filter((a) => !entity || a.entityType === entity);
    const start = before ? all.findIndex((a) => a.id === before) + 1 : 0;
    const items = all.slice(start, start + limit);
    return { items, nextBefore: start + limit < all.length ? (items[items.length - 1]?.id ?? null) : null };
  },

  async updateProfile(name: string) {
    await pause();
    const s = getMockAccess();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) throw new ApiError(400, "invalid", "A name is 1 to 80 characters.");
    commit({ ...s, users: s.users.map((u) => (u.id === s.selfId ? { ...u, name: trimmed } : u)) });
  },

  async changePassword(current: string, next: string) {
    await pause();
    if (!current) throw new ApiError(400, "invalid", "Enter your current password.");
    if (next.length < 12) throw new ApiError(400, "invalid", "The new password needs at least 12 characters.");
  },
};
