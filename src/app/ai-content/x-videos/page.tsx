"use client";

import React from "react";
import Link from "next/link";
import { Box, Button, Typography } from "@mui/material";
import { PauseCircle } from "lucide-react";
import DeskPage from "@/components/Layout/DeskPage";
import XVideosDesk from "@/components/Newsroom/XVideos/XVideosDesk";
import { XVIDEOS_ENABLED } from "@/lib/socia/config";

// The X Videos desk: live clips to X posts, by hand. Demo data only for now, behind NEXT_PUBLIC_XVIDEOS=true.
export default function XVideosPage() {
  return <DeskPage>{XVIDEOS_ENABLED ? <XVideosDesk /> : <NotAvailable />}</DeskPage>;
}

/** Shown when the flag is off and someone opens the link directly */
function NotAvailable() {
  return (
    <Box role="status" sx={{ display: "grid", placeItems: "center", py: { xs: 6, md: 10 }, px: 2 }}>
      <Box sx={{ maxWidth: 420, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: "12px", display: "grid", placeItems: "center", border: "1px solid", borderColor: "divider", backgroundColor: "background.paper", color: "text.secondary" }}>
          <PauseCircle size={20} aria-hidden />
        </Box>
        <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.0625rem" }}>
          X Videos is not available yet.
        </Typography>
        <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>The video desk is still being built. Posts from breaking files are on the X desk.</Typography>
        <Button component={Link} href="/ai-content/x" variant="outlined" sx={{ mt: 1, borderColor: "divider", color: "text.primary" }}>
          Open the X desk
        </Button>
      </Box>
    </Box>
  );
}
