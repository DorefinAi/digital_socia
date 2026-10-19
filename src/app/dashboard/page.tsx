"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import NewsroomDashboard from "@/components/Newsroom/NewsroomDashboard";

const DashboardPage: React.FC = () => {
  return (
    <DeskPage>
      <NewsroomDashboard />
    </DeskPage>
  );
};

export default DashboardPage;
