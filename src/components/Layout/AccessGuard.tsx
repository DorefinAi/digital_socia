"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { Lock, PauseCircle } from "lucide-react";
import { routeAccess } from "@/lib/access/catalogue";
import { usePermissions } from "@/lib/access/usePermissions";
import { usePhase, type PhaseInfo } from "@/lib/socia/usePhase";
import { useSociaSession } from "@/providers/SociaSessionProvider";

/** Pages the server's phase 1 switches off (kept in the code, hidden): Video Studio and the non-X desks. */
function hiddenInPhase(pathname: string, phase: PhaseInfo): boolean {
  if (!phase.phase1) return false;
  if (pathname === "/video-studio" || pathname.startsWith("/video-studio/")) return true;
  const desk = pathname.match(/^\/ai-content\/([^/]+)/)?.[1];
  return !!desk && !phase.showsPlatform(desk);
}

/** Shown on a page phase 1 switches off, if someone opens its link directly. */
function NotInPhase() {
  return (
    <Box role="status" sx={{ display: "grid", placeItems: "center", py: { xs: 6, md: 10 }, px: 2 }}>
      <Box sx={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: "12px", display: "grid", placeItems: "center", border: "1px solid", borderColor: "divider", backgroundColor: "background.paper", color: "text.secondary" }}>
          <PauseCircle size={20} aria-hidden />
        </Box>
        <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.0625rem" }}>
          This page is switched off for now.
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>The desk is posting to X only at the moment.</Typography>
        <Button component={Link} href="/ai-content/x" variant="outlined" sx={{ mt: 1, borderColor: "divider", color: "text.primary" }}>
          Open the X desk
        </Button>
      </Box>
    </Box>
  );
}

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
  const phase = usePhase();
  const { status } = useSociaSession();
  const waiting = (
    <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
      <CircularProgress size={26} aria-label="Checking your access" />
    </Box>
  );
  // Pages differ by phase, so they wait for it: phase 2 never flashes on a phase 1 desk
  // Only while /me is on its way: signed out, offline or a failed /me are SessionGate's to show (sign-in or
  // the offline state with Try again), never an endless spinner here
  if (!phase.known && (status === "loading" || status === "signed_in")) return waiting;
  if (hiddenInPhase(pathname, phase)) return <NotInPhase />;
  const rule = routeAccess(pathname);
  if (!rule) return <>{children}</>;
  if (!ready) return waiting;
  return canAny(rule.any) ? <>{children}</> : <NoAccess adminName={adminName} />;
}
