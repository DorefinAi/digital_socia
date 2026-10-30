// Response shapes of the Socia API, from C:\vartmaan\code\handoff\socia-api-contract.md.
// Fields marked "new" were added for the dashboard in contract v1.0; they stay optional so an older
// server still type-checks and renders.

export type SociaRole = "operator" | "editor" | "admin" | "viewer";
export type SignInStep = "done" | "totp" | "totp_setup";

/** What /me sent before access control v1 (contract: access-control-contract.md §4) */
export interface LegacyMePermissions {
  platforms: string[];
  canAct: boolean;
  canEditLibrary: boolean;
  canManageUsers: boolean;
}

export interface Me {
  user: {
    id: string;
    name: string;
    email: string;
    /** A built-in role (SociaRole) or a custom role's key */
    role: SociaRole | (string & {});
    platforms: string[];
    /** access control v1 */
    roleLabel?: string;
    platformScoped?: boolean;
    active?: boolean;
    totpEnabled?: boolean;
    createdAt?: string | null;
    lastLoginAt?: string | null;
  };
  csrfToken: string;
  verified: boolean;
  next: SignInStep;
  /** access control v1: the effective allowed keys; older servers send the legacy object */
  permissions: string[] | LegacyMePermissions;
  /** access control v1: the legacy object moved here (platforms the desk may act on) */
  access?: LegacyMePermissions;
  /** access control v1: exceptions set for this user by an admin */
  overrides?: { permission: string; allowed: boolean }[];
  /** access control v1: the permission catalogue */
  catalogue?: { key: string; group: string; label: string; description: string }[];
  /** Optional: who to ask for access, when the server says */
  adminName?: string | null;
  /** phase1-contract.md §0: 1 = files to ready posts with Copy & Posted; absent or 2 = everything as before */
  phase?: SociaPhase;
  /** phase1-contract.md §0 */
  features?: SociaFeatures;
}

export type SociaPhase = 1 | 2;

/** What this server has switched on (phase1-contract.md §0) */
export interface SociaFeatures {
  /** Approve, Retry and Recall through the X API (409 phase_off when false) */
  xApiPosting: boolean;
  copyPosted: boolean;
  /** No card until "Add card" asks for one */
  cardOnDemand: boolean;
  samvadia: boolean;
  webScraper: boolean;
  /** The platforms the desk shows ("x", ...) */
  platforms: string[];
}

export type DraftStatus =
  | "rendering" | "ready" | "claimed" | "queued" | "publishing" | "published"
  | "failed" | "rejected" | "render_failed" | "recalled";

export type QueueView = "inbox" | "sending" | "rejected" | "failed" | "posted";

/** Server-side filters on GET /x/queue (phase1-contract.md §1); all optional, combined with AND */
export interface QueueQuery {
  /** English district as in `item.district`; "none" = no district */
  district?: string;
  big?: boolean;
  update?: boolean;
  /** Desk/shift code from the file name (NDR, VKS, ...) */
  desk?: string;
  needsCheck?: boolean;
}

/** What the breaking file's name said (phase1-contract.md §1); null for non-breaking stories */
export interface FileTags {
  districtCode: string | null;
  big: boolean;
  full: boolean;
  update: boolean;
  exclusive: boolean;
  photo: boolean;
  web: boolean;
  tv: boolean;
  desk: string | null;
  reporter: string | null;
  date: string | null;
  other: string[];
}

/** Why a ready post needs a second look (phase1-contract.md §1) */
export type NeedsCheckCode = "empty" | "no_hindi" | "very_long" | "no_district" | "desk_note" | "headline_cut" | "no_headline" | "resaved" | "update_of_posted" | (string & {});

export type CardState = "none" | "rendering" | "ready" | "failed";

/** A draft marked posted with Copy & Posted */
export interface PostedMark {
  at: string;
  by: { id: string; name: string };
  /** Copy & Posted can be undone until then (5 minutes) */
  undoUntil: string;
}

/** Numbers for the queue filters, over the whole view (GET /x/queue/facets) */
export interface QueueFacets {
  districts: { name: string | null; n: number }[];
  desks: { code: string; n: number }[];
  big: number;
  update: number;
  needsCheck: number;
  total: number;
}

/** POST /drafts/:id/copy-posted */
export interface CopyPostedResult {
  postId: string;
  draftId: string;
  text: string;
  postedAt: string;
  postedBy: { id: string; name: string };
  undoUntil: string;
}

export type RejectReasonCode = "inaccurate" | "duplicate" | "low_quality" | "policy" | "other";

export interface CapUsage {
  platform: string;
  used: number;
  cap: number;
  level: "ok" | "warn" | "danger" | "full";
}

export interface Claim {
  userId: string;
  name: string;
  until: string;
  mine: boolean;
}

export interface QueueItem {
  id: string;
  status: DraftStatus;
  version: number;
  slug: string;
  headline: string;
  bodyText: string;
  receivedAt: string;
  cardUrl: string | null;
  claim: Claim | null;
  rejectReason: RejectReasonCode | null;
  flags: { lowConfidence: boolean; needsReview: boolean };
  /** new */
  createdAt?: string;
  /** new: null for folder/FTP stories */
  district?: string | null;
  /** new */
  source?: "samvadia" | "file";
  /** new: counts include recorded-only files */
  media?: { images: number; videos: number; state: "awaiting" | "attached" | "none" };
  /** new: Samvadia's priority; "breaking" is Big Breaking, "high" is Breaking */
  priority?: StoryPriority;
  /** new: Samvadia's category; null when it sent none */
  category?: string | null;
  /** new: the note left with a reject, when there is one */
  rejectNote?: string | null;
  /** phase 1: Hindi town from the place line */
  town?: string | null;
  /** phase 1 */
  tags?: FileTags | null;
  /** phase 1: desk/shift code */
  desk?: string | null;
  /** phase 1 */
  reporter?: string | null;
  /** phase 1: a desk instruction was removed from the text */
  deskNoteRemoved?: boolean;
  /** phase 1: [] when fine */
  needsCheck?: NeedsCheckCode[];
  /** phase 1: exactly what Copy copies */
  postText?: string;
  /** phase 1: X weighted length of postText */
  length?: number;
  /** phase 1 */
  card?: { state: CardState };
  /** phase 1, view=posted */
  posted?: PostedMark | null;
  /** phase 1: the file was saved again after its post went out; this new draft updates that posted one */
  updateOfDraftId?: string | null;
}

/** How urgent Samvadia marked a story */
export type StoryPriority = "normal" | "high" | "breaking";

export interface QueueResponse {
  cap: CapUsage;
  items: QueueItem[];
  /** Pass as `before` for the next page */
  nextCursor?: string | null;
}

export interface Counts {
  byStatus: Partial<Record<DraftStatus, number>>;
  byView: Record<Exclude<QueueView, "posted">, number> & { posted?: number };
  publishedToday: number;
  cap: CapUsage;
}

export interface MentionSuggestion {
  handleId: string;
  entity: string;
  handle: string;
  exact: boolean;
}

export interface DraftMedia {
  id: string;
  kind: "image" | "video";
  fileName: string;
  bytes: number;
  /** null when the file was seen on the FTP but not copied */
  url: string | null;
  copied: boolean;
  /** why a file was not copied */
  skipReason?: "video_off" | "too_big" | null;
  /** where the file sits on the FTP */
  sourcePath?: string | null;
  attachedBy: "footage" | "auto" | "manual" | string;
  createdAt: string;
}

export interface DraftView {
  id: string;
  platform: string;
  status: DraftStatus;
  version: number;
  bodyText: string;
  cardHeadline: string;
  hashtags: string[];
  mentions: string[];
  mentionSuggestions: MentionSuggestion[];
  postText: string;
  check: { length: number; limit: number; problems: string[] };
  /** `url` is the card that will be posted: the operator's own (`custom`) or the automatic one (`autoUrl`) */
  card: { url: string | null; ready: boolean; fontPx: number | null; error: string | null; custom?: boolean; autoUrl?: string | null; state?: CardState; requested?: boolean };
  claim: Claim | null;
  reject: { reason: RejectReasonCode; note: string | null } | null;
  job: { id: string; kind: string; status: "pending" | "running" | "dead"; sendAt: string; attempts: number; error: string | null } | null;
  composeMethod: string;
  composeVersion: string;
  createdAt: string;
  updatedAt: string;
  story: {
    id: string;
    slug: string;
    headline: string;
    body: string;
    receivedAt: string;
    mediaState: "awaiting" | "attached" | "none";
    conversionConfidence: number | null;
    lowConfidence: boolean;
    sourceEncoding: string | null;
    sourceText: string | null;
    parseMethod: string | null;
    parseNote: string | null;
    /** new */
    source?: "samvadia" | "file";
    /** new */
    district?: string | null;
    /** new: Samvadia's priority */
    priority?: StoryPriority;
    /** new: Samvadia's category; null when it sent none */
    category?: string | null;
    /** new: what Samvadia said; null for file stories */
    external?: {
      storyId: string;
      itemId: string;
      version?: number;
      kind?: "original" | "update";
      guid: string;
      title?: string;
      reporter: string | null;
      districtCode?: string | null;
      publishedAt: string;
      footagePath: string | null;
      footageStatus?: "found" | "waiting" | "not_found" | "manual" | "not_checked" | null;
    } | null;
    /** phase 1 */
    town?: string | null;
    tags?: FileTags | null;
    desk?: string | null;
    reporter?: string | null;
    /** The .txt file's name */
    fileName?: string | null;
    layout?: "breaking" | null;
    /** The desk instruction that was removed, null when none */
    deskNote?: string | null;
    deskNoteRemoved?: boolean;
    needsCheck?: NeedsCheckCode[];
    updateOfDraftId?: string | null;
  };
  /** phase 1: set once Copy & Posted marked it */
  posted?: PostedMark | null;
  /** new */
  media?: DraftMedia[];
  /**
   * Web Scraper drafts: how the publishers' words were reworded (web-scraper-contract.md "Draft rewording").
   * null for drafts not made from the Web Scraper, and absent on older servers.
   */
  rewrite?: DraftRewrite | null;
}

/** How a Web Scraper draft was reworded and how close it still is to its sources */
export interface DraftRewrite {
  /** The REWRITE_MODE that made it */
  mode: "rules" | (string & {});
  /** 0..1 against the closest source */
  similarity: number;
  /** Over the copy limit after the retries: reword by hand before posting */
  tooClose: boolean;
  /** Publishers used, the drafted item's first */
  sources: { name: string; url: string }[];
}

export interface DraftPatch {
  version: number;
  bodyText?: string;
  cardHeadline?: string;
  hashtags?: string[];
  mentions?: string[];
}

export interface PostCheck {
  text: string;
  length: number;
  limit: number;
  problems: string[];
}

export interface PostMetrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  at: string;
}

export interface PublishedPost {
  id: string;
  draftId: string;
  platform: string;
  text: string;
  /** null for a post marked with Copy & Posted (no link asked) */
  permalink: string | null;
  publishedAt: string;
  publishedBy: string | null;
  recalled: { at: string; reason: string } | null;
  /** No longer sent by the API (post analytics removed); kept optional for older responses */
  metrics?: PostMetrics | null;
  /** new */
  cardUrl?: string | null;
  /** new */
  headline?: string;
  /** new */
  slug?: string;
  /** v1.1: recorded by hand with "Save as posted" */
  manual?: boolean;
  /** phase 1: marked with Copy & Posted */
  copied?: boolean;
}

/** A slot on the card background, as fractions (0..1) of the image's width and height. */
export interface CardSlot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the card text goes on a user's background (contract: first-india-card-contract.md §2). */
export interface CardTemplateLayout {
  /** `format` uses DD, MM and YYYY, e.g. "Date:DD/MM/YYYY" */
  date: CardSlot & { color: string; format: string };
  box: CardSlot;
  headline: { color: string };
  body: { color: string };
  fontMinPx: number;
  fontMaxPx: number;
}

/** One background per user per platform; the editor draws every card of that platform on it. */
export interface UserCardTemplate {
  platform: "x";
  /** Changes whenever the image changes, so it is safe to cache */
  backgroundUrl: string;
  width: number;
  height: number;
  layout: CardTemplateLayout;
  updatedAt: string;
}

export interface IngestStatus {
  /** null until the worker has polled once */
  mode: "samvadia" | "folder" | "ftp" | null;
  lastPollAt: string | null;
  lastOkAt: string | null;
  lastError: { at: string; message: string; storyId?: string } | null;
  cursor: { publishedAt: string; storyId: string } | null;
  /** the IST day */
  today: { stories: number; storiesFailed?: number; storiesWithoutFootagePath?: number; mediaCopied: number; mediaSkipped: number };
  mediaWaiting: number;
  recentErrors: { at: string; message: string; storyId?: string }[];
  /** phase1-contract.md §6 */
  phase?: SociaPhase;
  /** The newsroom share; null unless the server reads breaking files */
  source?: SourceHealth | null;
  /** Overall intake state (phase1-contract.md §6) */
  state?: "ok" | "share_unreachable" | "folder_missing" | "data_file_problem" | "error" | "not_polled" | (string & {});
  /** The places/handles data files the worker reads; message and skipped for Settings users only */
  dataFiles?: { file: string; ok: boolean; at?: string; message?: string; skipped?: number }[];
}

/** The breaking-files share as the worker last saw it (phase1-contract.md §6) */
export interface SourceHealth {
  kind: "breaking";
  reachable: boolean;
  expectedFolder: string;
  /** false = today's folder isn't there yet (waiting, not an error) */
  todayFolderFound?: boolean;
  filesToday: number;
  lastFileAt: string | null;
  lastFileAgeSeconds?: number | null;
  checkedAt: string;
  /** Settings permission only (null for everyone else) */
  todayFolder: string | null;
  alsoScanning: string | null;
  lastFileName: string | null;
  /** Others get a generic message */
  lastError: { at: string; message: string; code?: string } | null;
}
