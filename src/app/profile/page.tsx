"use client";

import React from "react";
import DeskPage from "@/components/Layout/DeskPage";
import ProfilePage from "@/components/Access/ProfilePage";

// Everyone signed in: their account, sign-in security and what their role lets them do
export default function Profile() {
  return (
    <DeskPage>
      <ProfilePage />
    </DeskPage>
  );
}
