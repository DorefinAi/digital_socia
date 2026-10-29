// Shapes of the access API (contract §4), shared by the live client and the mock store.

export interface PermissionOverride {
  permission: string;
  allowed: boolean;
}

export interface RoleRecord {
  key: string;
  label: string;
  description: string;
  builtIn: boolean;
  platformScoped: boolean;
  userCount: number;
  /** Built-ins: what Reset restores (null for custom roles, or when the server does not say) */
  defaultPermissions: string[] | null;
  /** The full allowed set */
  permissions: string[];
}

export interface RoleInput {
  label: string;
  description?: string;
  platformScoped: boolean;
  permissions: string[];
  copyFrom?: string;
}

export type RolePatch = Partial<Omit<RoleInput, "copyFrom">>;

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  platforms: string[];
  active: boolean;
  totpEnabled: boolean;
  /** Number of exceptions on top of the role */
  overrides: number;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export interface UserPatch {
  role?: string;
  platforms?: string[];
  active?: boolean;
}

export interface EffectivePermission {
  key: string;
  allowed: boolean;
  source: "role" | "override";
  /** What the role alone gives (server v1); absent in older answers */
  roleAllowed?: boolean;
}

export interface UserPermissions {
  role: string;
  roleLabel?: string;
  permissions: EffectivePermission[];
}

export interface AuditPage {
  items: AuditEntry[];
  /** Pass as `before` for the next page; null when there is no more */
  nextBefore: string | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorName: string | null;
  action: string;
  entityType: "role" | "user" | string;
  entityId: string;
  /** Who or what changed, when the server says */
  entityLabel: string | null;
  before: unknown;
  after: unknown;
}

export type AuditEntity = "role" | "user";
