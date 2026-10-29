"use client";

import React from "react";
import { SocialPlatform } from "@/types/newsroom";
import RejectedStories from "./BreakingDesk/RejectedStories";

/**
 * Rejected news: the stories rejected on a platform desk, with their reason, and Take in to send one
 * back to that desk's queue. One platform for now (X); the page passes the platform in, so more desks
 * can be listed here later. Who may open it is checked by AccessGuard (page.rejected_news).
 */
export default function RejectedNews({ platform }: { platform: SocialPlatform }) {
  return <RejectedStories platform={platform} />;
}
