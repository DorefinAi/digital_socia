"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import ApprovalPortal from "@/components/Newsroom/ApprovalPortal";

const ApprovalPage: React.FC = () => {
  return (
    <DeskPage>
      <ApprovalPortal />
    </DeskPage>
  );
};

export default ApprovalPage;
