"use client";

import React, { useState } from "react";
import { Box, Snackbar, Typography } from "@mui/material";
import { LayoutTemplate } from "lucide-react";
import DeskPage from "@/components/Layout/DeskPage";
import ResponsiveTabs from "@/components/Layout/ResponsiveTabs";
import { LiveDeskProvider } from "@/components/Newsroom/BreakingDesk/live/LiveDesk";
import OrgTemplateGallery from "@/components/Newsroom/BreakingDesk/live/OrgTemplateGallery";
import CardBackgroundPanel from "@/components/Newsroom/BreakingDesk/live/CardBackgroundPanel";
import TemplatesPanel from "@/components/Newsroom/BreakingDesk/TemplatesPanel";
import { USE_MOCKS } from "@/lib/socia/config";

// Post Studio → Templates: one tab per platform along the top, X first (more join later). The X tab is what
// the X desk's Templates tab showed: the desk's shared templates, then the operator's own X background.
type Section = "x";

function XTemplates({ onNotice }: { onNotice: (text: string) => void }) {
  if (USE_MOCKS) return <TemplatesPanel />;
  return (
    // Templates only: the desk's queue, counts and posts are not read on this page
    <LiveDeskProvider templatesOnly>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
        <OrgTemplateGallery onNotice={onNotice} />
        {/* The operator's own background: offered in the editor as "Your X background" beside the desk's designs */}
        <CardBackgroundPanel />
      </Box>
    </LiveDeskProvider>
  );
}

export default function TemplatesPage() {
  const [section, setSection] = useState<Section>("x");
  const [notice, setNotice] = useState("");
  return (
    <DeskPage>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <LayoutTemplate size={16} aria-hidden />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              Templates
            </Typography>
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>The card designs each desk drafts its posts on.</Typography>
        </Box>
        <Box sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
          <ResponsiveTabs<Section>
            value={section}
            onChange={setSection}
            ariaLabel="Templates by platform"
            items={[{ value: "x", label: "X" }]}
            tabsSx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", px: 1.5, minWidth: 0 } }}
          />
        </Box>
        {section === "x" && <XTemplates onNotice={setNotice} />}
      </Box>
      <Snackbar open={!!notice} autoHideDuration={3500} onClose={() => setNotice("")} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </DeskPage>
  );
}
