"use client";

// PostEditor is the studio's biggest piece (canvas, video timeline, templates). The desk only needs it once a
// story opens, so it loads in its own chunk: hovering or focusing a row starts the download, and the editor
// overlay shows "Opening the story" for the moment it may still be on its way.

import React from "react";
import dynamic from "next/dynamic";
import { Box, CircularProgress, Dialog, Typography } from "@mui/material";

let started: Promise<unknown> | null = null;

/** Starts downloading the editor's code (once; a failed try may run again on the next hover) */
export function prefetchEditor(): void {
  if (started) return;
  started = import("./PostEditor").catch(() => {
    started = null;
  });
}

/** The same full-screen sheet the editor opens as, so nothing behind it moves while the code arrives */
export function EditorLoading() {
  return (
    <Dialog open fullScreen transitionDuration={150} slotProps={{ paper: { sx: { borderRadius: 0, backgroundImage: "none", backgroundColor: "background.default" } } }}>
      <Box role="status" sx={{ flex: 1, display: "grid", placeItems: "center", px: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <CircularProgress size={22} />
          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>Opening the story</Typography>
        </Box>
      </Box>
    </Dialog>
  );
}

/** PostEditor, loaded on first use (client only: it is an overlay that never renders on the server) */
const LazyPostEditor = dynamic(() => import("./PostEditor"), { ssr: false, loading: () => <EditorLoading /> });

export default LazyPostEditor;
