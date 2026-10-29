"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import RejectedNews from "@/components/Newsroom/RejectedNews";

// Rejected news, on the demo data or (live) the X desk's rejected stories. It loads only what it shows
// (useRejectedLive), and only once AccessGuard has let the page through.
export default function RejectedNewsPage() {
  return (
    <DeskPage>
      <RejectedNews platform="X (Twitter)" />
    </DeskPage>
  );
}
