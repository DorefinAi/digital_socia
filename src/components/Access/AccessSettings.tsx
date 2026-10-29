"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { ShieldCheck } from "lucide-react";
import ResponsiveTabs from "@/components/Layout/ResponsiveTabs";
import { usePermissions } from "@/lib/access/usePermissions";
import { accessService } from "@/lib/access/service";
import { useLoad } from "./shared";
import RolesTab from "./RolesTab";
import UsersTab from "./UsersTab";
import HistoryTab from "./HistoryTab";

type AccessTab = "roles" | "users" | "history";

/** Settings → Access: roles, people and the history of changes to both. */
export default function AccessSettings() {
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const tabs: { value: AccessTab; label: string }[] = [
    ...(can("roles.manage") ? [{ value: "roles" as const, label: "Roles" }] : []),
    ...(can("users.manage") ? [{ value: "users" as const, label: "Users" }] : []),
    ...(can("audit.view") ? [{ value: "history" as const, label: "History" }] : []),
  ];
  const asked = params.get("tab") as AccessTab | null;
  const tab = tabs.find((t) => t.value === asked)?.value ?? tabs[0]?.value ?? "roles";
  const setTab = (next: AccessTab) => router.replace(`${pathname}?tab=${next}`, { scroll: false });

  // The role list feeds both tabs (the Users tab's role picker too). Without roles.manage the server may refuse it;
  // the Users tab then builds its picker from the people it lists.
  const roles = useLoad(() => accessService.listRoles());

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ShieldCheck size={16} aria-hidden />
          <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
            Access
          </Typography>
        </Box>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
          What each role can open and do, who has which role, and exceptions for single people.
        </Typography>
      </Box>

      <Box sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <ResponsiveTabs<AccessTab>
          value={tab}
          onChange={setTab}
          ariaLabel="Access sections"
          items={tabs}
          tabsSx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", px: 1.5, minWidth: 0 } }}
        />
      </Box>

      {tab === "roles" && can("roles.manage") && <RolesTab roles={roles} />}
      {tab === "users" && can("users.manage") && <UsersTab roles={roles} />}
      {tab === "history" && can("audit.view") && <HistoryTab roles={roles.data ?? []} />}
    </Box>
  );
}
