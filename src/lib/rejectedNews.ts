import type { RolePermissions } from "@/types/newsroom";

/** The Rejected news page: stories rejected on the platform desks, with Restore. It replaced the Approval Portal. */
export const REJECTED_NEWS_PATH = "/rejected-news";
export const REJECTED_NEWS_LABEL = "Rejected news";

/**
 * Who can open Rejected news. It keeps the Approval Portal's permission, and also lets in everyone who
 * works a platform desk: they reject stories there, and the desks no longer have a Rejected tab.
 */
export const canSeeRejectedNews = (p: RolePermissions) => p.canAccessApprovalPortal || p.canAccessAIContentReview;
