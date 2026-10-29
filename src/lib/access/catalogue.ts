// Roles and the permission catalogue, from handoff/access-control-contract.md §1–2.
// Live, GET /me sends the catalogue and the effective permissions; this file is the mock-mode source
// and the fallback when an older server answers /me without them.

export type PermissionKey =
  | "page.dashboard"
  | "page.rejected_news"
  | "page.post_studio.x"
  | "page.post_studio.instagram"
  | "page.post_studio.facebook"
  | "page.post_studio.youtube"
  | "page.web_scraper"
  | "page.video_studio"
  | "page.settings"
  | "page.users"
  | "story.take_in"
  | "draft.edit"
  | "draft.card"
  | "draft.approve"
  | "draft.reject"
  | "post.publish"
  | "post.mark_posted"
  | "post.undo"
  | "trends.refresh"
  | "trends.draft"
  | "trends.watch"
  | "card_template.own"
  | "video.export"
  | "users.manage"
  | "roles.manage"
  | "audit.view";

export interface Permission {
  key: string;
  group: string;
  label: string;
  description: string;
}

export const PERMISSION_CATALOGUE: Permission[] = [
  { key: "page.dashboard", group: "Pages", label: "Dashboard", description: "The desk's dashboard and the Digital Dashboard." },
  { key: "page.rejected_news", group: "Pages", label: "Rejected news", description: "Stories rejected on the platform desks." },
  { key: "page.post_studio.x", group: "Pages", label: "Post Studio: X", description: "The X desk and its editor." },
  { key: "page.post_studio.instagram", group: "Pages", label: "Post Studio: Instagram", description: "The Instagram desk and its editor." },
  { key: "page.post_studio.facebook", group: "Pages", label: "Post Studio: Facebook", description: "The Facebook desk and its editor." },
  { key: "page.post_studio.youtube", group: "Pages", label: "Post Studio: YouTube", description: "The YouTube desk and its editor." },
  { key: "page.web_scraper", group: "Pages", label: "Web Scraper", description: "Trending topics, hashtags and articles." },
  { key: "page.video_studio", group: "Pages", label: "Video Studio", description: "Cut and caption clips for the platforms." },
  { key: "page.settings", group: "Pages", label: "Settings", description: "The Settings section in the sidebar." },
  { key: "page.users", group: "Pages", label: "Users", description: "The list of people on the desk." },
  { key: "story.take_in", group: "Actions", label: "Take in rejected stories", description: "Bring a rejected story back to the queue." },
  { key: "draft.edit", group: "Actions", label: "Edit drafts", description: "Change a draft's text and hashtags." },
  { key: "draft.card", group: "Actions", label: "Change cards", description: "Redesign or upload a draft's card." },
  { key: "draft.approve", group: "Actions", label: "Approve drafts", description: "Approve a draft for posting." },
  { key: "draft.reject", group: "Actions", label: "Reject drafts", description: "Reject a story with a reason." },
  { key: "post.publish", group: "Actions", label: "Post to platforms", description: "Send a post to X, Instagram, Facebook or YouTube." },
  { key: "post.mark_posted", group: "Actions", label: "Save as posted", description: "Record a post made by hand, with its link." },
  { key: "post.undo", group: "Actions", label: "Undo and recall posts", description: "Stop a post in its undo window or recall it." },
  { key: "trends.refresh", group: "Actions", label: "Check trend sources", description: "Start a fresh check of the Web Scraper's sources." },
  { key: "trends.draft", group: "Actions", label: "Create drafts from trends", description: "Turn a trend into a draft on a platform desk." },
  { key: "trends.watch", group: "Actions", label: "Watch keywords", description: "Keep your own keyword watch on the Web Scraper." },
  { key: "card_template.own", group: "Actions", label: "Own card backgrounds", description: "Upload and lay out your own card background." },
  { key: "video.export", group: "Actions", label: "Export video", description: "Export a clip from the Video Studio." },
  { key: "users.manage", group: "Actions", label: "Manage users", description: "Change people's roles, platforms, access and exceptions." },
  { key: "roles.manage", group: "Actions", label: "Manage roles", description: "Create roles and change what each role can do." },
  { key: "audit.view", group: "Actions", label: "See change history", description: "Read the history of role and user changes." },
];

/** Smaller headings inside Actions, so the matrix reads in chunks. Unknown keys fall under "Other". */
export const ACTION_SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Stories and drafts", keys: ["story.take_in", "draft.edit", "draft.card", "draft.approve", "draft.reject"] },
  { title: "Posting", keys: ["post.publish", "post.mark_posted", "post.undo"] },
  { title: "Web Scraper", keys: ["trends.refresh", "trends.draft", "trends.watch"] },
  { title: "Cards and video", keys: ["card_template.own", "video.export"] },
  { title: "Administration", keys: ["users.manage", "roles.manage", "audit.view"] },
];

export const isPagePermission = (key: string) => key.startsWith("page.");

export type BuiltInRoleKey = "admin" | "editor" | "operator" | "viewer";
export const BUILT_IN_ROLE_KEYS: BuiltInRoleKey[] = ["admin", "editor", "operator", "viewer"];

export const BUILT_IN_ROLE_LABELS: Record<BuiltInRoleKey, string> = {
  admin: "Admin",
  editor: "Chief Editor",
  operator: "Digital Team",
  viewer: "Viewer",
};

export const BUILT_IN_ROLE_DESCRIPTIONS: Record<BuiltInRoleKey, string> = {
  admin: "Everything, including people and roles.",
  editor: "Runs the desk: every page and action except people and roles.",
  operator: "Posts on their own platforms.",
  viewer: "Looks at the desk without changing anything.",
};

/** These two always stay on for Admin, so the desk can never lose its last way back in. */
export const ADMIN_LOCKED: string[] = ["users.manage", "roles.manage"];

const ALL_KEYS = PERMISSION_CATALOGUE.map((p) => p.key);
const POST_STUDIO_PAGES = ["page.post_studio.x", "page.post_studio.instagram", "page.post_studio.facebook", "page.post_studio.youtube"];

export const DEFAULT_ROLE_PERMISSIONS: Record<BuiltInRoleKey, string[]> = {
  admin: ALL_KEYS,
  editor: ALL_KEYS.filter((k) => !ADMIN_LOCKED.includes(k)),
  operator: [
    "page.dashboard", "page.rejected_news", ...POST_STUDIO_PAGES, "page.web_scraper", "page.video_studio",
    "story.take_in", "draft.edit", "draft.card", "post.publish", "post.mark_posted", "post.undo",
    "trends.draft", "trends.watch", "card_template.own", "video.export",
  ],
  viewer: ["page.dashboard", "page.rejected_news", ...POST_STUDIO_PAGES, "page.web_scraper", "trends.watch", "card_template.own"],
};

export const isBuiltInRole = (key: string): key is BuiltInRoleKey => (BUILT_IN_ROLE_KEYS as string[]).includes(key);

/** Role label when only the key is known (an older server, or a role list that has not loaded). */
export function fallbackRoleLabel(key: string): string {
  if (isBuiltInRole(key)) return BUILT_IN_ROLE_LABELS[key];
  if (key === "digital_team") return BUILT_IN_ROLE_LABELS.operator;
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Lowercase slug used as a custom role's key: "Video editor" → "video-editor". */
export function roleSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Platforms ───────────────────────────────────────────────────────────────
export const PLATFORM_OPTIONS: { key: string; label: string }[] = [
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "youtube", label: "YouTube" },
];
export const platformLabel = (key: string) => PLATFORM_OPTIONS.find((p) => p.key === key)?.label ?? key;

// ─── Pages ───────────────────────────────────────────────────────────────────
/**
 * What each route needs. A route matches its own path and everything under it; the longest prefix wins.
 * `any`: one of these is enough. Routes not listed (and /profile) are open to everyone signed in.
 */
export const ROUTE_ACCESS: { prefix: string; any: string[]; title: string }[] = [
  { prefix: "/dashboard", any: ["page.dashboard"], title: "Dashboard" },
  { prefix: "/digital", any: ["page.dashboard"], title: "Digital Dashboard" },
  { prefix: "/rejected-news", any: ["page.rejected_news"], title: "Rejected news" },
  { prefix: "/ai-content", any: POST_STUDIO_PAGES, title: "Post Studio" },
  { prefix: "/ai-content/x", any: ["page.post_studio.x"], title: "Post Studio: X" },
  { prefix: "/ai-content/instagram", any: ["page.post_studio.instagram"], title: "Post Studio: Instagram" },
  { prefix: "/ai-content/facebook", any: ["page.post_studio.facebook"], title: "Post Studio: Facebook" },
  { prefix: "/ai-content/youtube", any: ["page.post_studio.youtube"], title: "Post Studio: YouTube" },
  { prefix: "/web-scraper", any: ["page.web_scraper"], title: "Web Scraper" },
  { prefix: "/video-studio", any: ["page.video_studio"], title: "Video Studio" },
  { prefix: "/settings/access", any: ["roles.manage", "users.manage"], title: "Access" },
];

export function routeAccess(pathname: string) {
  let best: (typeof ROUTE_ACCESS)[number] | null = null;
  for (const r of ROUTE_ACCESS) {
    if ((pathname === r.prefix || pathname.startsWith(r.prefix + "/")) && (!best || r.prefix.length > best.prefix.length)) best = r;
  }
  return best;
}

/** The Post Studio page key for a desk platform name ("X (Twitter)", "Instagram"…). */
export function postStudioKey(platform: string): string {
  const p = platform.toLowerCase();
  if (p.startsWith("x")) return "page.post_studio.x";
  if (p.startsWith("insta")) return "page.post_studio.instagram";
  if (p.startsWith("face")) return "page.post_studio.facebook";
  return "page.post_studio.youtube";
}
