"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import BreakingDesk from "@/components/Newsroom/BreakingDesk/BreakingDesk";

export default function FacebookDeskPage() {
  return (
    <DeskPage>
      <BreakingDesk platform="Facebook" />
    </DeskPage>
  );
}
