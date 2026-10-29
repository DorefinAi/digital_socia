"use client";

// Opening the studio from another screen: a full-window modal (focus stays inside, the page behind is hidden from
// screen readers) with the studio code loaded only when it first opens, plus the frame-shape choice for YouTube.

import React from "react";
import dynamic from "next/dynamic";
import { Box, CircularProgress, ListItemIcon, ListItemText, Menu, MenuItem, Modal } from "@mui/material";
import { Smartphone, Tv } from "lucide-react";
import type { VideoStudioProps } from "../VideoStudio";
import type { StudioPlatform } from "../projectFromStory";

const VideoStudio = dynamic(() => import("../VideoStudio"), {
  ssr: false,
  loading: () => (
    <Box sx={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", bgcolor: "#121418", color: "#A3AAB6" }}>
      <CircularProgress color="inherit" size={22} aria-label="Opening the video studio" />
    </Box>
  ),
});

export function StudioModal({ open, ...props }: VideoStudioProps & { open: boolean }) {
  return (
    // No onClose: Escape belongs to the editor (deselect, close menus); the top bar's back button closes the studio
    <Modal open={open} hideBackdrop aria-label="Video studio">
      <Box sx={{ position: "fixed", inset: 0, outline: 0 }}>{open && <VideoStudio {...props} />}</Box>
    </Modal>
  );
}

export type YouTubeFormat = Extract<StudioPlatform, "YouTube" | "Shorts">;

/** "Landscape video" or "Short": the two shapes a YouTube upload takes */
export function YouTubeFormatMenu({ anchor, onClose, onPick }: { anchor: HTMLElement | null; onClose: () => void; onPick: (f: YouTubeFormat) => void }) {
  const pick = (f: YouTubeFormat) => {
    onClose();
    onPick(f);
  };
  return (
    <Menu anchorEl={anchor} open={!!anchor} onClose={onClose}>
      <MenuItem onClick={() => pick("YouTube")}>
        <ListItemIcon>
          <Tv size={18} />
        </ListItemIcon>
        <ListItemText primary="Landscape video" secondary="16:9, for the channel" />
      </MenuItem>
      <MenuItem onClick={() => pick("Shorts")}>
        <ListItemIcon>
          <Smartphone size={18} />
        </ListItemIcon>
        <ListItemText primary="Short" secondary="9:16, vertical" />
      </MenuItem>
    </Menu>
  );
}
