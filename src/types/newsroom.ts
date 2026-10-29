// ─── Roles & Permissions ───────────────────────────────────────────────────────
export type UserRole = "admin" | "editor" | "digital_team" | "viewer";

export interface RolePermissions {
  canAccessDashboard: boolean;
  canAccessApprovalPortal: boolean;
  canAccessDigitalDashboard: boolean;
  canAccessAIContentReview: boolean;
  canAccessWebScraper: boolean;
  canAccessSettings: boolean;
  canApproveNews: boolean;
  canRejectNews: boolean;
  canEditContent: boolean;
  canSendStories: boolean;
  canEditNewsroomStories: boolean;
  canApproveSocialContent: boolean;
  canViewOnly: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canAccessDashboard: true,
    canAccessApprovalPortal: true,
    canAccessDigitalDashboard: true,
    canAccessAIContentReview: true,
    canAccessWebScraper: true,
    canAccessSettings: true,
    canApproveNews: true,
    canRejectNews: true,
    canEditContent: true,
    canSendStories: true,
    canEditNewsroomStories: true,
    canApproveSocialContent: true,
    canViewOnly: false,
  },
  editor: {
    canAccessDashboard: true,
    canAccessApprovalPortal: true,
    canAccessDigitalDashboard: false,
    canAccessAIContentReview: false,
    canAccessWebScraper: true,
    canAccessSettings: false,
    canApproveNews: true,
    canRejectNews: true,
    canEditContent: true,
    canSendStories: false,
    canEditNewsroomStories: true,
    canApproveSocialContent: false,
    canViewOnly: false,
  },
  digital_team: {
    canAccessDashboard: true,
    canAccessApprovalPortal: false,
    canAccessDigitalDashboard: true,
    canAccessAIContentReview: true,
    canAccessWebScraper: true,
    canAccessSettings: false,
    canApproveNews: false,
    canRejectNews: false,
    canEditContent: false,
    canSendStories: false,
    canEditNewsroomStories: false,
    canApproveSocialContent: true,
    canViewOnly: false,
  },
  viewer: {
    canAccessDashboard: true,
    canAccessApprovalPortal: false,
    canAccessDigitalDashboard: false,
    canAccessAIContentReview: false,
    canAccessWebScraper: true,
    canAccessSettings: false,
    canApproveNews: false,
    canRejectNews: false,
    canEditContent: false,
    canSendStories: false,
    canEditNewsroomStories: false,
    canApproveSocialContent: false,
    canViewOnly: true,
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin (Full Access)",
  editor: "Chief Editor",
  digital_team: "Digital Content Team",
  viewer: "Read-Only Viewer",
};

// ─── Data Models ──────────────────────────────────────────────────────────────
export type StoryPriority = "low" | "medium" | "high" | "urgent";

export type StoryStatus =
  | "draft"
  | "assigned"
  | "pending_review"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "published";

export type StoryCategory =
  | "Politics"
  | "Sports"
  | "Business"
  | "Technology"
  | "Entertainment"
  | "Health"
  | "International";

export interface Reporter {
  id: string;
  name: string;
  avatar?: string;
  email: string;
  beat: string;
}

export interface Story {
  id: string;
  title: string;
  reporter: string;
  category: StoryCategory;
  priority: StoryPriority;
  status: StoryStatus;
  createdAt: string;
  updatedAt: string;
  body: string;
  aiSummary: string;
  aiSuggestedHeadline: string;
  tags: string[];
  /** Reporter the story is assigned to (Octopus assignment calendar) */
  assignedTo?: string;
  /** ISO date — assignment deadline */
  dueDate?: string;
}

export type Platform = "YouTube" | "Instagram" | "X (Twitter)" | "Facebook" | "LinkedIn";

export type AIContentStatus = "pending" | "approved" | "rejected";

export interface AIContent {
  id: string;
  caption: string;
  imageUrl: string;
  platform: Platform;
  generatedAt: string;
  campaign: string;
  confidenceScore: number;
  status: AIContentStatus;
  storyId?: string;
}

export interface PlatformEngagement {
  platform: Platform;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  engagementRate: number;
  growth: number;
  icon: string;
  color: string;
}

export type ActivityAction = "approved" | "rejected" | "generated" | "assigned" | "published" | "edited";

export interface ActivityItem {
  id: string;
  action: ActivityAction;
  actor: string;
  target: string;
  timestamp: string;
  details?: string;
}

export type NotificationType =
  | "story_approved"
  | "ai_caption_edited"
  | "instagram_post_ready"
  | "story_returned"
  | "new_assignment"
  | "ai_content_approved";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: string;
  read: boolean;
}

// ─── Web Scraper Data Interfaces ──────────────────────────────────────────────
export type ScraperType = "topics" | "articles" | "hashtags";

export interface ScraperItem {
  id: string;
  rank: number; // 1 to 20
  title: string; // Topic name / Article title / #hashtag
  type: ScraperType;
  platform: "X (Twitter)" | "YouTube" | "Instagram" | "Google News" | "Reddit" | "Web Scraper";
  url: string;
  engagementStats: {
    viewsOrVolume: string; // e.g., "1.8M Mentions" or "450K Reads"
    growthRate: string; // e.g., "+340% in 2h"
    sharesOrPosts: string; // e.g., "124K Shares"
  };
  reasonWhy: string; // 1-2 liner explaining WHY it is trending
  superTag: string; // Superset category tag (e.g. "Rajasthan Infrastructure")
  subTag: string; // Subset topic tag (e.g. "Jaipur Metro Phase 2")
  timeFrame: "24h" | "12h" | "7d"; // Default "24h"
  scrapedAt: string;
}

// ─── Breaking Desk (FTP → Social) ─────────────────────────────────────────────
export type BreakingTag = "breaking" | "big_breaking";

export type SocialPlatform = "X (Twitter)" | "Instagram" | "Facebook";

export interface FtpMedia {
  kind: "image" | "video";
  url: string;
  fileName: string;
  /** Still frame used for thumbnails when kind is "video" */
  posterUrl?: string;
}

export interface FtpNewsItem {
  id: string;
  headline: string;
  body: string;
  /** Short, crisp version of the story used as the starting post text */
  shortText: string;
  tag: BreakingTag;
  /** District / city the story belongs to — drives hashtag suggestions */
  area: string;
  /** People & organisations named in the story — drives @mention suggestions */
  people: string[];
  ftpPath: string;
  media: FtpMedia[];
  receivedAt: string;
  /** Handles the model suggested that the directory could not resolve */
  aiMentions?: AiMention[];
}

export interface SocialPost {
  id: string;
  newsId: string;
  platform: SocialPlatform;
  /** Text printed on the template */
  headline: string;
  /** Final text as posted, including mentions and hashtags */
  text: string;
  hashtags: string[];
  mentions: string[];
  mediaKind: "image" | "video";
  thumbUrl: string;
  postUrl: string;
  postedAt: string;
  postedBy: string;
  format?: string;
  mediaFile?: string;
  layout?: CardLayout;
  clipSegments?: ClipSegment[];
  /** Recalled posts were deleted from the platform after going out */
  status?: "live" | "recalled";
  recalledAt?: string;
  recallReason?: string;
}

/** Everything about how a story was laid out on the template; mirrors the render job the backend receives. */
export interface CardLayout {
  headline: string;
  /** Multiplier on the template's base headline size */
  fontScale: number;
  /** Vertical centre of the headline block, 0 (top) – 1 (bottom) */
  textY: number;
  align: TextAlign;
  /** Headline colour; "auto" follows the template */
  color: string;
  /** "cover" crops the media to fill the frame, "contain" shows all of it over a backdrop */
  fit: "cover" | "contain";
  /** What shows behind the media when it does not fill the frame: "blur" or a CSS colour */
  backdrop: string;
  /** Media zoom on top of the fit, 1 = no extra zoom */
  bgZoom: number;
  /** Media pan, -1 – 1 across the slack left by the fit and zoom */
  bgX: number;
  bgY: number;
  // Added with the template picker and text tools; optional so older drafts still open
  /** Template design id; "classic" when absent */
  template?: string;
  /** Colour of the template's bands and bars; follows the tag when absent */
  accent?: string;
  /** Horizontal centre of the headline block, 0 – 1; the template's column when absent */
  textX?: number;
  /** Headline block width as a share of the template's column; 0.3 – 1 until the box is given a height */
  textWidth?: number;
  /**
   * Headline box height as a share of the frame height. Set once the box is resized by hand: the box then
   * keeps this size (textX/textY are its centre) and the text shrinks to fit it. Absent: the height follows the text.
   */
  textHeight?: number;
  /** Headline styling on top of the template's defaults */
  headlineStyle?: CardTextStyle;
  /** Extra text boxes, drawn above the headline in order */
  layers?: CardTextLayer[];
  // Added with the video tools
  /** When the headline shows in a video, and how it comes in */
  headlineMotion?: TextMotion;
  /** Colour and light adjustments on the picture or video */
  adjust?: MediaAdjust;
  /** Mirrors the picture or video left to right */
  flipX?: boolean;
  /** Video sound level in the saved clip, 0 – 1; full when absent */
  volume?: number;
  /** Video fades in from black at the start and out to black at the end */
  fadeIn?: boolean;
  fadeOut?: boolean;
}

export type TextAnimation = "none" | "fade" | "rise" | "pop" | "wipe" | "typewriter";

/** Timing on a video, in seconds of the source file. Unset start or end means the edge of the kept video. */
export interface TextMotion {
  start?: number;
  end?: number;
  animation?: TextAnimation;
}

/** Each value is 0 when untouched. Sliders run -1 – 1, except blur and vignette, which run 0 – 1. */
export interface MediaAdjust {
  /** Look preset id; "none" or absent for the original */
  filter?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  warmth?: number;
  blur?: number;
  vignette?: number;
}

export type TextAlign = "left" | "center" | "right";

/** Text styling an operator can set on the headline or a text box. Unset fields use the template's default. */
export interface CardTextStyle {
  font?: string;
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  color?: string;
  /** Colour for words wrapped in **double asterisks** */
  highlight?: string;
  align?: TextAlign;
  /** Extra space between letters, in em */
  letterSpacing?: number;
  lineHeight?: number;
  opacity?: number;
  /** Outline width in px on a 1080 frame */
  strokeWidth?: number;
  strokeColor?: string;
  /** Drop shadow strength, 0 – 1 */
  shadow?: number;
  shadowColor?: string;
  /** Solid box behind the text */
  box?: boolean;
  boxColor?: string;
  boxOpacity?: number;
  /** Corner radius in px on a 1080 frame */
  boxRadius?: number;
  /** Degrees, clockwise */
  rotation?: number;
}

export interface CardTextLayer {
  id: string;
  text: string;
  /** Centre of the box as shares of the frame */
  x: number;
  y: number;
  /** Wrapping width as a share of the frame width */
  width: number;
  /** Box height as a share of the frame height, once resized by hand; the text then shrinks to fit. Absent: follows the text. */
  height?: number;
  /** Font size in px on a 1080 frame */
  size: number;
  style: CardTextStyle;
  motion?: TextMotion;
}

export interface ClipSegment {
  /** Seconds into the source video */
  start: number;
  end: number;
  /** Playback speed of this part, 1 when absent */
  speed?: number;
}

/** What an operator hands to the publisher: the post text plus everything needed to render its media. */
export interface PostPayload {
  newsId: string;
  platform: SocialPlatform;
  /** Text printed on the template */
  headline: string;
  /** Final text including mentions and hashtags */
  text: string;
  /** The operator's text without the mentions and hashtags, so a draft can be reopened for editing */
  caption?: string;
  hashtags: string[];
  mentions: string[];
  mediaKind: "image" | "video";
  thumbUrl: string;
  postedBy: string;
  /** Template format, e.g. "x", "ig_post", "ig_reel" */
  format?: string;
  mediaFile?: string;
  layout?: CardLayout;
  /** Kept parts of the source video, in order */
  clipSegments?: ClipSegment[];
}

export type RejectReason = "inaccurate" | "duplicate" | "low_quality" | "policy" | "other";

export const REJECT_REASONS: Record<RejectReason, string> = {
  inaccurate: "Inaccurate",
  duplicate: "Duplicate",
  low_quality: "Low quality",
  policy: "Policy violation",
  other: "Other",
};

/** A story an operator has acted on without posting it yet. One per story per platform. */
export interface SocialDraft extends PostPayload {
  id: string;
  /** "deleted" keeps a hidden record so a dismissed story does not return to the queue */
  status: "saved" | "scheduled" | "rejected" | "deleted";
  updatedAt: string;
  scheduledFor?: string;
  rejectReason?: RejectReason;
  rejectNote?: string;
}

/** A post waiting out its undo window before it is sent. */
export interface PendingPost {
  id: string;
  payload: PostPayload;
  sendAt: string;
  /** Filled in once the post has gone out */
  post?: SocialPost;
}

export interface HashtagRule {
  id: string;
  /** City or district as written on the FTP story */
  area: string;
  hashtags: string[];
}

export interface HandleEntry {
  id: string;
  /** Person or organisation as named in stories */
  entity: string;
  x: string;
  instagram: string;
  verifiedAt: string;
}

/** A handle the model proposed that is not in the directory; the operator must accept it. */
export interface AiMention {
  entity: string;
  x: string;
  instagram: string;
  confidence: number;
}
