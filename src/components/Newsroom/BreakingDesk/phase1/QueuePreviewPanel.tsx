"use client";

// Phase 1 queue, wide screens: the selected story as it will read on X, beside the list. J/K or the arrows move
// the selection, Enter opens it, R rejects it; the buttons here do the same as the row's own.

import React from "react";
import { Box, Button, Typography } from "@mui/material";
import { Ban, ImageOff, Lock, PenLine } from "lucide-react";
import type { FtpNewsItem } from "@/types/newsroom";
import { fileUrl, isLiveItem } from "../live/LiveDesk";
import { countChars } from "../socialText";
import XPostPreview from "./XPostPreview";

const kbdSx = {
  display: "inline-grid",
  placeItems: "center",
  minWidth: 20,
  height: 20,
  px: 0.5,
  borderRadius: "5px",
  border: "1px solid",
  borderColor: "divider",
  borderBottomWidth: 2,
  backgroundColor: "action.hover",
  fontFamily: "inherit",
  fontSize: "0.6875rem",
  fontWeight: 700,
  lineHeight: 1,
  color: "text.secondary",
} as const;

/** One key, drawn as a keycap */
function Key({ children, onPrimary }: { children: React.ReactNode; onPrimary?: boolean }) {
  return (
    <Box component="kbd" sx={onPrimary ? { ...kbdSx, color: "inherit", borderColor: "rgba(255,255,255,0.45)", backgroundColor: "rgba(255,255,255,0.14)" } : kbdSx}>
      {children}
    </Box>
  );
}

const panelSx = {
  display: "flex",
  flexDirection: "column",
  backgroundColor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "12px",
  overflow: "hidden",
  // Sticks beside the list as it scrolls; a tall card scrolls inside the panel, the buttons stay in view
  position: "sticky",
  top: 16,
  maxHeight: "calc(100vh - 32px)",
} as const;

const actionSx = { minHeight: 40, borderRadius: "8px", textTransform: "none", fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap", boxShadow: "none" } as const;

interface QueuePreviewPanelProps {
  /** The selected row's story; undefined while the list is empty */
  item: FtpNewsItem | undefined;
  /** Who else holds the story, or null */
  held: string | null;
  canAct: boolean;
  canReject: boolean;
  onOpen: (item: FtpNewsItem) => void;
  onReject: (item: FtpNewsItem) => void;
}

/** "As it will read on X": the selected ready post, its card and the two actions. Memoised on the selection. */
const QueuePreviewPanel = React.memo(function QueuePreviewPanel({ item, held, canAct, canReject, onOpen, onReject }: QueuePreviewPanelProps) {
  const live = item && isLiveItem(item) ? item.live : null;
  const text = live?.postText ?? item?.shortText ?? "";
  const used = live?.length ?? countChars(text, "X (Twitter)");
  // The card the row already carries, once it is drawn
  const cardSrc = live?.cardUrl && (live.card?.state ?? "ready") === "ready" ? fileUrl(live.cardUrl) : "";
  const headline = item?.headline || "No headline";

  return (
    <Box component="aside" aria-labelledby="p1-preview-title" sx={panelSx}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography component="h2" id="p1-preview-title" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>
          As it will read on X
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: "0.75rem", color: "text.secondary", flexShrink: 0 }}>
          <Key>J</Key>
          <Key>K</Key>
          <span>to move</span>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {item ? (
          <>
            {/* Keyed so X's "Show more" closes again for the next story */}
            <XPostPreview
              key={item.id}
              text={text}
              used={used}
              media={cardSrc ? <Box component="img" src={cardSrc} alt={`Card for: ${headline}`} loading="lazy" sx={{ display: "block", width: "100%", height: "auto" }} /> : undefined}
            />
            {!cardSrc && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.25, border: "1px dashed", borderColor: "divider", borderRadius: "10px", color: "text.secondary", fontSize: "0.8125rem" }}>
                <ImageOff size={15} aria-hidden />
                <span>No card yet. The post goes out as text unless you add one in the editor.</span>
              </Box>
            )}
            {held && (
              <Typography role="note" sx={{ fontSize: "0.8125rem", color: "warning.main", fontWeight: 600 }}>
                {held} is working on this story. Open it to read.
              </Typography>
            )}
          </>
        ) : (
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>Pick a story in the list to see its post here.</Typography>
        )}
      </Box>

      {item && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1, px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
          {canReject && !held && (
            <Button variant="outlined" color="inherit" onClick={() => onReject(item)} startIcon={<Ban size={15} />} aria-keyshortcuts="R" sx={{ ...actionSx, borderColor: "divider", color: "text.secondary", "&:hover": { color: "error.main", borderColor: "error.main" } }}>
              Reject
            </Button>
          )}
          <Button
            variant={held ? "outlined" : "contained"}
            onClick={() => onOpen(item)}
            disabled={!canAct}
            startIcon={canAct && !held ? <PenLine size={15} /> : <Lock size={15} />}
            endIcon={canAct ? <Key onPrimary={!held}>Enter</Key> : undefined}
            aria-keyshortcuts="Enter"
            sx={actionSx}
          >
            {held ? "Open to read" : "Open to check and copy"}
          </Button>
        </Box>
      )}
    </Box>
  );
});

export default QueuePreviewPanel;
