"use client";

import React from "react";
import { Box } from "@mui/material";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { SocialPlatform } from "@/types/newsroom";
import { canSeeRejectedNews } from "@/lib/rejectedNews";
import RejectedStories from "./BreakingDesk/RejectedStories";
import { EmptyState } from "./BreakingDesk/shared";

/**
 * Rejected news: the stories rejected on a platform desk, with their reason, and Take in to send one
 * back to that desk's queue. One platform for now (X); the page passes the platform in, so more desks
 * can be listed here later.
 */
export default function RejectedNews({ platform }: { platform: SocialPlatform }) {
  const { permissions } = useNewsroom();

  if (!canSeeRejectedNews(permissions)) {
    return (
      <Box sx={{ mt: 2 }}>
        <EmptyState title="Rejected news is not available for your role" hint="Ask your desk admin for access to the platform desks." />
      </Box>
    );
  }

  return <RejectedStories platform={platform} />;
}
