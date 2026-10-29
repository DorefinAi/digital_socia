"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import AnalyticsPage from "@/components/Newsroom/Analytics/AnalyticsPage";

const AnalyticsRoute: React.FC = () => {
  return (
    <DeskPage>
      <AnalyticsPage />
    </DeskPage>
  );
};

export default AnalyticsRoute;
