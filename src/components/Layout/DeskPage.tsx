"use client";

import React from "react";
import { Box } from "@mui/material";
import LeftNavigation from "@/components/leftNavigation/leftNavigation";
import DashBoardCommonHeader from "@/components/Header/DashBoardCommonHeader";
import { CONTENT_MAX_WIDTH } from "@/constants";
import SessionGate from "./SessionGate";
import AccessGuard from "./AccessGuard";

/**
 * Shell for every signed-in page: sidebar, header and a centred content column.
 * minWidth 0 lets the column shrink beside the (resizable) sidebar instead of
 * pushing the page wider than the screen; the cap widens on large monitors.
 */
export default function DeskPage({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          width: "100%",
          minHeight: "100dvh",
          gap: { xs: 0, lg: "12px" },
          backgroundColor: "background.default",
        }}
      >
        <Box sx={{ flexShrink: 0 }}>
          <LeftNavigation />
        </Box>
        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            px: { xs: "14px", md: "20px" },
            // Room under the last row so the floating assistant button never covers it
            pb: { xs: "96px", md: "88px" },
          }}
        >
          <DashBoardCommonHeader />
          <Box sx={{ mx: "auto", width: "100%", maxWidth: CONTENT_MAX_WIDTH }}>
            <AccessGuard>{children}</AccessGuard>
          </Box>
        </Box>
      </Box>
    </SessionGate>
  );
}
