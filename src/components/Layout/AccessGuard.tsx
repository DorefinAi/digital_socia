"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { Lock } from "lucide-react";
import { routeAccess } from "@/lib/access/catalogue";
import { usePermissions } from "@/lib/access/usePermissions";

/** The message a page shows to someone whose role does not include it. */
export function NoAccess({ adminName }: { adminName: string | null }) {
  return (
    <Box role="alert" sx={{ display: "grid", placeItems: "center", py: { xs: 6, md: 10 }, px: 2 }}>
      <Box sx={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: "12px", display: "grid", placeItems: "center", border: "1px solid", borderColor: "divider", backgroundColor: "background.paper", color: "text.secondary" }}>
          <Lock size={20} aria-hidden />
        </Box>
        <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.0625rem" }}>
          You don&apos;t have access to this page.
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
          {adminName ? `Ask an admin, such as ${adminName}, to add it to your role.` : "Ask an admin."}
        </Typography>
        <Button component={Link} href="/profile" variant="outlined" sx={{ mt: 1, borderColor: "divider", color: "text.primary" }}>
          See what you can do
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Renders the page only when the signed-in person has its permission (catalogue.ROUTE_ACCESS).
 * Pages without an entry, and /profile, are open to everyone signed in.
 */
export default function AccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, canAny, adminName } = usePermissions();
  const rule = routeAccess(pathname);
  if (!rule) return <>{children}</>;
  if (!ready) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress size={26} aria-label="Checking your access" />
      </Box>
    );
  }
  return canAny(rule.any) ? <>{children}</> : <NoAccess adminName={adminName} />;
}
