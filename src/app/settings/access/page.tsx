"use client";

import React, { Suspense } from "react";
import DeskPage from "@/components/Layout/DeskPage";
import AccessSettings from "@/components/Access/AccessSettings";

// Roles, people and their history. AccessGuard lets in roles.manage or users.manage (catalogue.ROUTE_ACCESS).
export default function AccessSettingsPage() {
  return (
    <DeskPage>
      <Suspense>
        <AccessSettings />
      </Suspense>
    </DeskPage>
  );
}
