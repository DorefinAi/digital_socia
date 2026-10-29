"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import RejectedNews from "@/components/Newsroom/RejectedNews";

// Rejected news, on the demo data or (live) the X desk's rejected stories. It loads only what it shows
// (useRejectedLive), and only once the role check in RejectedNews has passed.
export default function RejectedNewsPage() {
  return (
    <DeskPage>
      <RejectedNews platform="X (Twitter)" />
    </DeskPage>
  );
}
