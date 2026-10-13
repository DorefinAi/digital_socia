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

export type SocialPlatform = "X (Twitter)" | "Instagram";

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
}
