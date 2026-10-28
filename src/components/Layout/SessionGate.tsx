"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { DESK_ROLE, useSociaSession } from "@/providers/SociaSessionProvider";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { SOCIA_API_URL } from "@/lib/socia/config";

/**
 * Signed-in pages only render with a verified backend session. In demo mode (NEXT_PUBLIC_USE_MOCKS=true)
 * it lets everything through, as before. The backend role also drives the desk's nav permissions.
 */
export default function SessionGate({ children }: { children: React.ReactNode }) {
  const { status, me, refresh } = useSociaSession();
  const { currentRole, setRole } = useNewsroom();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed_out" || status === "needs_second_step") router.replace("/");
  }, [status, router]);

  const backendRole = me ? DESK_ROLE[me.user.role] : null;
  useEffect(() => {
    if (backendRole && backendRole !== currentRole) setRole(backendRole);
  }, [backendRole, currentRole, setRole]);

  if (status === "mock" || status === "signed_in") return <>{children}</>;

  if (status === "offline") {
    return (
      <Box role="alert" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", px: 2, backgroundColor: "background.default" }}>
        <Box sx={{ maxWidth: 420, textAlign: "center" }}>
          <Typography component="h1" sx={{ fontWeight: 700, fontSize: "1.125rem" }}>Can&apos;t reach the Socia server</Typography>
          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mt: 1 }}>
            The desk talks to {SOCIA_API_URL}. Check that the server is running, then try again.
          </Typography>
          <Button variant="contained" onClick={() => void refresh()} sx={{ mt: 2, textTransform: "none", borderRadius: "10px" }}>
            Try again
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", backgroundColor: "background.default" }}>
      <CircularProgress size={28} aria-label="Checking your session" />
    </Box>
  );
}
