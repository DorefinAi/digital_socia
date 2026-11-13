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
  /** phase1-contract.md §0: 1 = files to ready posts with Copy & Mark Posted; absent or 2 = everything as before */
  phase?: SociaPhase;
  /** phase1-contract.md §0 */
  features?: SociaFeatures;
  /** The person's own settings; older servers leave it out (all defaults) */
  prefs?: {
    /** Action id -> its keys ("mod+enter"); [] turns the action off; actions not listed keep their defaults */
    keyBindings?: Record<string, string[]>;
  };
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
  /** Inbox only: one IST day "YYYY-MM-DD" (today or earlier; 400 bad_day otherwise). Absent: the newest stories. */
  day?: string;
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
export type NeedsCheckCode = "empty" | "no_hindi" | "very_long" | "no_district" | "desk_note" | "headline_cut" | "no_headline" | "resaved" | "update_of_posted" | "place_conflict" | (string & {});

export type CardState = "none" | "rendering" | "ready" | "failed";

/** A draft marked posted with Copy & Mark Posted */
export interface PostedMark {
  at: string;
  by: { id: string; name: string };
  /** Copy & Mark Posted can be undone until then (5 minutes) */
  undoUntil: string;
}

/**
 * GET /x/queue?view=posted: the mark plus the post record that went out. The record's fields are optional so
 * an older server (mark only) still type-checks; `by` is null when the user is unknown.
 */
export interface QueuePosted extends Omit<PostedMark, "by" | "undoUntil"> {
  by: { id: string; name: string } | null;
  /** Null when the record shown was recalled: nothing left to undo */
  undoUntil: string | null;
  /** Exactly the text that was posted (published_posts.text) */
  text?: string;
  cardUrl?: string | null;
  permalink?: string | null;
  publishedAt?: string;
  publishedBy?: string | null;
  manual?: boolean;
  copied?: boolean;
  recalled?: { at: string; reason: string | null } | null;
}

/** Numbers for the queue filters, over the whole view (GET /x/queue/facets) */
export interface QueueFacets {
  districts: { name: string | null; n: number }[];
  desks: { code: string; n: number }[];
  big: number;
  update: number;
  needsCheck: number;
  total: number;
  /** Stories received today (IST) in this view: the desk's "To post" and "Needs check". Absent on older servers. */
  today?: { total: number; needsCheck: number };
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
  /**
   * The story's own text (stories.body, the points one per line), so list cards are drawn from the story like
   * the editor's card. Optional: an older server without it leaves cards falling back to bodyText.
   */
  storyBody?: string;
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
  posted?: QueuePosted | null;
  /** phase 1: the file was saved again after its post went out; this new draft updates that posted one */
  updateOfDraftId?: string | null;
  /** The original file's path (where the story came from); null when unknown */
  sourcePath?: string | null;
  /** Readable link name for ?story= ("jaipur-sms-aspatal-...-2241"). Absent on older servers. */
  linkSlug?: string;
  /** Readable download name without extension ("Jaipur-SMS-aspatal-...-09Nov-2241"). Absent on older servers. */
  fileStem?: string;
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

/** POST /handles/desk: a handle the desk added to the handle directory */
export interface DeskHandle {
  id: string;
  /** "@JhalawarUpdates" */
  handle: string;
  entityName: string;
  keywords: string[];
  /** "desk" for one added here; a handle already in the directory keeps its own source (e.g. "manual") */
  source: string;
  verified: true;
  /** Why the directory keeps no keywords for it (null: it has them) */
  keywordsWithheld: "file_handle" | "lookalike" | "party" | "official" | "files_unavailable" | null;
  /** false when the handle was already in the directory (200) */
  created: boolean;
}

export interface MentionSuggestion {
  handleId: string;
  entity: string;
  handle: string;
  exact: boolean;
  /**
   * Where the suggestion came from. "reporter_prior" (measured from the reporter's own posts) and
   * "reporter_beat" (a beat the desk declared for the reporter) show in their own "Reporter usually tags"
   * group; anything else, or none (older servers), is a normal suggestion.
   */
  source?: string;
  /** Why it was suggested, in the desk's words ("CM mentioned without a name") */
  reason?: string;
  /** reporter_prior: share of the reporter's posts that carried it (0..1) */
  score?: number;
  /** reporter_prior: how many posts the share was measured on */
  n?: number;
}

/** A hashtag suggestion with its origin; older servers send a bare "#Tag" string instead */
export interface HashtagSuggestion {
  tag: string;
  source?: string;
  reason?: string;
  score?: number;
  n?: number;
}

/** Why a breaking draft got the handles it got (post_drafts.handle_pick) */
export interface HandlePick {
  cls: string;
  why: string;
  warnings: string[];
  /** Each handle with the reason it was chosen for: police, collector, cm, subject, party, reporter, desk… */
  handles: { handle: string; reason: string; title?: string }[];
  /** The reporter name read from the breaking file's name, matched to a handle or not */
  reporterToken?: string | null;
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
  /** Same as QueueItem.linkSlug. Absent on older servers. */
  linkSlug?: string;
  /** Same as QueueItem.fileStem. Absent on older servers. */
  fileStem?: string;
  platform: string;
  status: DraftStatus;
  version: number;
  bodyText: string;
  cardHeadline: string;
  hashtags: string[];
  /**
   * Topic hashtags the org's rules matched, offered for one-click accept. They are NEVER on the post
   * until somebody accepts one: applying them automatically was wrong more often than right. Empty on
   * drafts composed before this shipped and on non-breaking drafts.
   */
  hashtagSuggestions?: (string | HashtagSuggestion)[];
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
  /**
   * Breaking drafts: why these handles. `cls` is the story class every handle rule hangs off (incident,
   * administration, political, government, judicial, soft, leader_post, other) and `why` says it in
   * words. `warnings` never stopped a handle going on the post — a reporter name the list does not
   * carry, a district code the places file does not carry. Null on drafts composed before this shipped.
   */
  handlePick?: HandlePick | null;
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
    /** The original file's path; null when unknown */
    sourcePath?: string | null;
    layout?: "breaking" | null;
    /** The desk instruction that was removed, null when none */
    deskNote?: string | null;
    deskNoteRemoved?: boolean;
    needsCheck?: NeedsCheckCode[];
    updateOfDraftId?: string | null;
  };
  /** phase 1: set once Copy & Mark Posted marked it */
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
  /** null for a post marked with Copy & Mark Posted (no link asked) */
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
  /** phase 1: marked with Copy & Mark Posted */
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

/** An org template's layout: as the per-user one, but a design without a date slot has `date: null`. */
export type OrgCardTemplateLayout = Omit<CardTemplateLayout, "date"> & { date: CardTemplateLayout["date"] | null };

/** The desk's shared X card designs (contract: org-card-templates-contract.md). */
export interface OrgCardTemplate {
  slug: string;
  label: string;
  platform: "x";
  /** Relative API path including ?v=<updatedAt>; fetched with the session cookie */
  backgroundUrl: string;
  width: number;
  height: number;
  layout: OrgCardTemplateLayout;
  /** Story tags this template opens on */
  defaultFor: OrgTemplateTag[];
  updatedAt: string;
  // v2 (upload, rename, delete); absent from an older server, which means none of these are allowed
  /** Who uploaded it; null for the seeded house designs */
  createdBy?: { id: string; name: string } | null;
  /** The requesting user may rename it and move its text area */
  canEdit?: boolean;
  /** Admin only */
  canDelete?: boolean;
  /** Admin only: make it the default for a story tag */
  canSetDefault?: boolean;
}

export type OrgTemplateTag = "big_breaking" | "breaking";

/** PATCH /card-templates/:slug; send only what changes */
export interface OrgCardTemplatePatch {
  label?: string;
  layout?: OrgCardTemplateLayout;
  defaultFor?: OrgTemplateTag[];
}

/** What the background-card drawing needs: a per-user background or an org template. */
export interface DrawableCardTemplate {
  backgroundUrl: string;
  width: number;
  height: number;
  layout: OrgCardTemplateLayout;
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
  /**
   * Overall intake state (phase1-contract.md §6). "stopped": no poll or worker heartbeat for 90 s, or no finished
   * poll for 15 min, so nothing new is being read
   */
  state?: "ok" | "share_unreachable" | "folder_missing" | "data_file_problem" | "error" | "not_polled" | "stopped" | (string & {});
  /** The worker's last sign of life (newer of its last poll and heartbeat); null if it never ran */
  workerLastSeenAt?: string | null;
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

// ─── Story search (GET /search/stories) ──────────────────────────────────────
/** How a story matched: the words as typed, by sound (Roman "hadsa" → हादसा), or through a Hindi/English translation */
export type StorySearchMatch = "text" | "phonetic" | "translated";

export interface StorySearchItem {
  id: string;
  /** Hindi */
  headline: string | null;
  /** About 140 characters of the body around the match */
  snippet: string | null;
  /** English, e.g. "Jaipur" */
  district: string | null;
  /** Hindi */
  town: string | null;
  /** The X draft's status (same values as the server's DRAFT_STATUSES) */
  status: DraftStatus;
  /** ISO */
  receivedAt: string;
  /** Set only when the story has an X draft the desk can still open (30 days); opens it at /ai-content/x?story=<linkSlug> */
  linkSlug: string | null;
  match: StorySearchMatch;
}

export interface StorySearchResponse {
  items: StorySearchItem[];
  /** The Hindi/English forms the query was expanded to, e.g. ["दुर्घटना", "हादसा"] for "accident" */
  expanded: string[];
}
