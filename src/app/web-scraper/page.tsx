"use client";

import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import DeskPage from "@/components/Layout/DeskPage";
import WebScraperPage from "@/components/Newsroom/WebScraperPage";

const ScraperAppPage: React.FC = () => {
  return (
    <DeskPage>
      <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={30} /></Box>}>
        <WebScraperPage />
      </Suspense>
    </DeskPage>
  );
};

export default ScraperAppPage;
