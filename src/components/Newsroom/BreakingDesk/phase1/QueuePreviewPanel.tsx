"use client";

// Phase 1 queue, wide screens: the selected story as it will read on X, beside the list. J/K or the arrows move
// the selection, Enter opens it, R rejects it; the buttons here do the same as the row's own.

import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Box, Button, Typography } from "@mui/material";
import { Ban, ImageOff, Lock, PenLine } from "lucide-react";
import type { OrgCardTemplate, UserCardTemplate } from "@/lib/socia/types";
import type { FtpNewsItem } from "@/types/newsroom";
import { fileUrl, isLiveItem } from "../live/LiveDesk";
import StoryThumb from "../live/StoryThumb";
import { cardChoiceOf, subscribeCardChoice, thumbTemplate } from "../live/storyThumbs";
import { storyTag } from "../shared";
import { countChars } from "../socialText";
import XPostPreview from "./XPostPreview";

// A small, quiet keycap: the size of the text beside it, never bolder than it
const kbdSx = {
  display: "inline-flex",
  alignItems: "center",
  height: 18,
  px: 0.5,
  borderRadius: "4px",
  border: "1px solid",
  borderColor: "divider",
  fontFamily: "inherit",
  fontSize: "11px",
  fontWeight: 500,
  lineHeight: 1,
  color: "text.secondary",
} as const;
const kbdOnPrimarySx = { ...kbdSx, color: "inherit", borderColor: "rgba(255,255,255,0.35)", opacity: 0.85 } as const;

/** One key, drawn as a keycap */
function Key({ children, onPrimary }: { children: React.ReactNode; onPrimary?: boolean }) {
  return (
    <Box component="kbd" sx={onPrimary ? kbdOnPrimarySx : kbdSx}>
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
  // Sticks beside the list as it scrolls; a tall card scrolls inside the panel, the buttons stay in view. The
  // bottom gap keeps the footer clear of the floating assistant button (44px at 16px from the corner).
  position: "sticky",
  top: 16,
  maxHeight: "calc(100vh - 92px)",
} as const;

/** Room below the panel for the floating assistant button (44px, 16px from the corner) */
const BOTTOM_CLEAR = 76;

/**
 * Fits the panel to what is left of the window below its top edge, so the footer is on screen even before the
 * page scrolls (the panel starts below the header); once it sticks, that is the window less the gaps. Written
 * straight to the element on scroll and resize, so nothing re-renders.
 */
function useFitToWindow(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const top = Math.max(16, el.getBoundingClientRect().top);
        el.style.maxHeight = `${Math.max(240, window.innerHeight - top - BOTTOM_CLEAR)}px`;
      });
    };
    fit();
    window.addEventListener("scroll", fit, { passive: true });
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
    };
  }, [ref]);
}

const actionSx = { minHeight: 40, borderRadius: "8px", textTransform: "none", fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap", boxShadow: "none", flexShrink: 0 } as const;
// The footer measures itself: a narrow panel (a 1200px window) shortens the main button's label
const footerSx = { containerType: "inline-size", borderTop: "1px solid", borderColor: "divider" } as const;
const footerRowSx = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1, px: 2, py: 1.5 } as const;
const longLabelSx = { "@container (max-width: 400px)": { display: "none" } } as const;
const shortLabelSx = { display: "none", "@container (max-width: 400px)": { display: "inline" } } as const;
const noteSx = { display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary", fontSize: "0.75rem" } as const;

/** The card under the post: the uploaded one, else the card the editor would draw on the desk's default design. */
function CardPreview({ item, org, own }: { item: FtpNewsItem; org: OrgCardTemplate[] | null | undefined; own: UserCardTemplate | null | undefined }) {
  const live = isLiveItem(item) ? item.live : null;
  const uploaded = live?.cardUrl && (live.card?.state ?? "ready") === "ready" ? fileUrl(live.cardUrl) : "";
  const choice = useSyncExternalStore(subscribeCardChoice, () => cardChoiceOf(item.id), () => null);
  const headline = item.headline || "No headline";
  if (uploaded) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={uploaded} alt={`Card for: ${headline}`} loading="lazy" style={{ display: "block", width: "100%", height: "auto", borderRadius: 12 }} />;
  }
  const pick = live && org?.length ? thumbTemplate(org, own ?? null, storyTag(item), choice) : null;
  if (!pick) {
    return (
      <Box sx={noteSx}>
        <ImageOff size={13} aria-hidden />
        <span>No card yet</span>
      </Box>
    );
  }
  const { width: W, height: H } = pick.template;
  // StoryThumb draws only uploaded photos or the design; the queue's own "media" is the (absent) card link
  const drawable = { ...item, media: [] };
  return (
    <Box component="figure" sx={{ m: 0 }}>
      <Box role="img" aria-label={`Card preview for: ${headline}`} sx={{ width: "100%", aspectRatio: `${W || 1} / ${H || 1}`, borderRadius: "12px", overflow: "hidden", backgroundColor: "#111" }}>
        <StoryThumb item={drawable} boxW={480} boxH={Math.round((480 * (H || 1)) / (W || 1))} org={org} own={own} />
      </Box>
      <Typography component="figcaption" sx={{ mt: 0.75, fontSize: "0.6875rem", color: "text.secondary" }}>
        Card preview. Saved when you open and copy.
      </Typography>
    </Box>
  );
}

interface QueuePreviewPanelProps {
  /** The selected row's story; undefined while the list is empty */
  item: FtpNewsItem | undefined;
  /** Who else holds the story, or null */
  held: string | null;
  canAct: boolean;
  canReject: boolean;
  onOpen: (item: FtpNewsItem) => void;
  onReject: (item: FtpNewsItem) => void;
  /** The desk's designs and the operator's own background, as polled (same arrays between polls) */
  org: OrgCardTemplate[] | null | undefined;
  own: UserCardTemplate | null | undefined;
}

/** "As it will read on X": the selected ready post, its card and the two actions. Memoised on the selection. */
const QueuePreviewPanel = React.memo(function QueuePreviewPanel({ item, held, canAct, canReject, onOpen, onReject, org, own }: QueuePreviewPanelProps) {
  const live = item && isLiveItem(item) ? item.live : null;
  const text = live?.postText ?? item?.shortText ?? "";
  const used = live?.length ?? countChars(text, "X (Twitter)");
  const ref = useRef<HTMLElement>(null);
  useFitToWindow(ref);

  return (
    <Box component="aside" ref={ref} aria-labelledby="p1-preview-title" sx={panelSx}>
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
            <XPostPreview key={item.id} text={text} used={used} />
            <CardPreview item={item} org={org} own={own} />
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
        <Box sx={footerSx}>
          <Box sx={footerRowSx}>
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
              aria-keyshortcuts="Enter"
              sx={actionSx}
            >
              {held ? (
                "Open to read"
              ) : (
                <>
                  <Box component="span" sx={longLabelSx}>
                    Open to check and copy
                  </Box>
                  <Box component="span" sx={shortLabelSx}>
                    Open and copy
                  </Box>
                </>
              )}
              {/* In the label, not endIcon: MUI sizes endIcon children as 20px icons */}
              {canAct && (
                <Box component="span" sx={{ ml: 1, display: "inline-flex" }}>
                  <Key onPrimary={!held}>Enter</Key>
                </Box>
              )}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
});

export default QueuePreviewPanel;
