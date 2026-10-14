"use client";

import React from "react";
import LeftNavigation from "@/components/leftNavigation/leftNavigation";
import { Box } from "@mui/material";
import DashBoardCommonHeader from "@/components/Header/DashBoardCommonHeader";
import BreakingDesk from "@/components/Newsroom/BreakingDesk/BreakingDesk";

export default function FacebookDeskPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: { xs: "column", lg: "row" }, width: "100%", minHeight: "100vh", gap: { xs: 0, lg: "12px" }, backgroundColor: "background.default" }}>
      <Box sx={{ flexShrink: 0 }}>
        <LeftNavigation />
      </Box>
      <Box sx={{ flexGrow: 1, px: { xs: "14px", md: "20px" }, paddingBottom: "20px" }}>
        <DashBoardCommonHeader />
        <Box sx={{ mx: "auto", width: "100%", maxWidth: "1100px" }}>
          <BreakingDesk platform="Facebook" />
        </Box>
      </Box>
    </Box>
  );
}
