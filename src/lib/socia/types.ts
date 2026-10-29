// Response shapes of the Socia API, from C:\vartmaan\code\handoff\socia-api-contract.md.
// Fields marked "new" were added for the dashboard in contract v1.0; they stay optional so an older
// server still type-checks and renders.

export type SociaRole = "operator" | "editor" | "admin" | "viewer";
export type SignInStep = "done" | "totp" | "totp_setup";

export interface Me {
  user: { id: string; name: string; email: string; role: SociaRole; platforms: string[] };
  csrfToken: string;
  verified: boolean;
  next: SignInStep;
  permissions: { platforms: string[]; canAct: boolean; canEditLibrary: boolean; canManageUsers: boolean };
}

export type DraftStatus =
  | "rendering" | "ready" | "claimed" | "queued" | "publishing" | "published"
  | "failed" | "rejected" | "render_failed" | "recalled";

export type QueueView = "inbox" | "sending" | "rejected" | "failed";

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
}

/** How urgent Samvadia marked a story */
export type StoryPriority = "normal" | "high" | "breaking";

export interface QueueResponse {
  cap: CapUsage;
  items: QueueItem[];
}

export interface Counts {
  byStatus: Partial<Record<DraftStatus, number>>;
  byView: Record<QueueView, number>;
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
  card: { url: string | null; ready: boolean; fontPx: number | null; error: string | null; custom?: boolean; autoUrl?: string | null };
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
  };
  /** new */
  media?: DraftMedia[];
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
  permalink: string;
  publishedAt: string;
  publishedBy: string | null;
  recalled: { at: string; reason: string } | null;
  metrics: PostMetrics | null;
  /** new */
  cardUrl?: string | null;
  /** new */
  headline?: string;
  /** new */
  slug?: string;
  /** v1.1: recorded by hand with "Save as posted" */
  manual?: boolean;
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
}
