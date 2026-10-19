"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import BreakingDesk from "@/components/Newsroom/BreakingDesk/BreakingDesk";

export default function XAIReviewPage() {
  return (
    <DeskPage>
      <BreakingDesk platform="X (Twitter)" />
    </DeskPage>
  );
}
