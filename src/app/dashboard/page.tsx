"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import NewsroomDashboard from "@/components/Newsroom/NewsroomDashboard";
import { LiveDeskProvider } from "@/components/Newsroom/BreakingDesk/live/LiveDesk";
import { USE_MOCKS } from "@/lib/socia/config";

const DashboardPage: React.FC = () => {
  return (
    <DeskPage>
      {USE_MOCKS ? (
        <NewsroomDashboard />
      ) : (
        // Live: the dashboard's queue, counts and posts come from the Socia backend
        <LiveDeskProvider>
          <NewsroomDashboard />
        </LiveDeskProvider>
      )}
    </DeskPage>
  );
};

export default DashboardPage;
