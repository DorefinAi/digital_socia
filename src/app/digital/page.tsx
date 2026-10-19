"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import DigitalDashboard from "@/components/Newsroom/DigitalDashboard";

const DigitalPage: React.FC = () => {
  return (
    <DeskPage>
      <DigitalDashboard />
    </DeskPage>
  );
};

export default DigitalPage;
