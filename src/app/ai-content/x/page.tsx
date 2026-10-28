"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import BreakingDesk from "@/components/Newsroom/BreakingDesk/BreakingDesk";
import { LiveDeskProvider } from "@/components/Newsroom/BreakingDesk/live/LiveDesk";
import { USE_MOCKS } from "@/lib/socia/config";

// The X desk is the Breaking Desk with its full-screen editor, on the demo data or on the Socia backend.
// Live, LiveDeskProvider feeds it the server's drafts and wires its actions to the API.
export default function XAIReviewPage() {
  return (
    <DeskPage>
      {USE_MOCKS ? (
        <BreakingDesk platform="X (Twitter)" />
      ) : (
        <LiveDeskProvider>
          <BreakingDesk platform="X (Twitter)" />
        </LiveDeskProvider>
      )}
    </DeskPage>
  );
}
