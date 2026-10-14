"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { FtpNewsItem, SocialPlatform } from "@/types/newsroom";
import { isLiveOn } from "@/data/socialDesk";
import FtpStatus from "./FtpStatus";
import { TagChip, timeAgo } from "./shared";

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  posted: { label: "Posted", color: "success.main" },
  saved: { label: "Draft", color: "text.secondary" },
  scheduled: { label: "Scheduled", color: "info.main" },
  rejected: { label: "Rejected", color: "error.main" },
};

/** Live FTP feed beside the editor: newest first, new arrivals marked, click to switch story. */
export default function FtpFeedPanel({ platform, currentId, onPick }: { platform: SocialPlatform; currentId: string; onPick: (item: FtpNewsItem) => void }) {
  const { ftpNews, socialPosts, socialDrafts } = useNewsroom();
  const listRef = useRef<HTMLDivElement>(null);
  const [openedAt] = useState(() => Date.now());
  const sorted = [...ftpNews].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const newest = sorted[0]?.id;

  // When a story arrives, bring the top of the feed into view so it is seen
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [newest]);

  const statusOf = (id: string) => {
    if (isLiveOn(socialPosts, id, platform)) return "posted";
    const draft = socialDrafts.find((d) => d.newsId === id && d.platform === platform && d.status !== "deleted");
    return draft?.status;
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, height: { lg: "100%" }, minHeight: 0 }}>
      <Box>
        <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>FTP feed</Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>Newest first. Pick a story to switch; your edits are kept as a draft.</Typography>
      </Box>
      <FtpStatus compact />
      <Box ref={listRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto", mx: -1, maxHeight: { xs: 360, lg: "none" } }}>
        {sorted.map((n) => {
          const current = n.id === currentId;
          const status = statusOf(n.id);
          const fresh = new Date(n.receivedAt).getTime() > openedAt;
          const cover = n.media[0];
          return (
            <Box
              key={n.id}
              component="button"
              onClick={() => !current && onPick(n)}
              aria-current={current ? "true" : undefined}
              sx={{
                display: "grid",
                gridTemplateColumns: "52px minmax(0, 1fr)",
                gap: 1,
                alignItems: "center",
                width: "100%",
                textAlign: "left",
                p: 1,
                border: 0,
                borderRadius: "8px",
                fontFamily: "inherit",
                color: "text.primary",
                cursor: current ? "default" : "pointer",
                backgroundColor: current ? "action.selected" : "transparent",
                "&:hover": { backgroundColor: current ? "action.selected" : "action.hover" },
              }}
            >
              <Box sx={{ position: "relative", width: 52, height: 38, borderRadius: "4px", overflow: "hidden", backgroundColor: "#111" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover.posterUrl ?? cover.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.headline}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.4, fontSize: "0.625rem", color: "text.secondary", whiteSpace: "nowrap" }}>
                  <TagChip tag={n.tag} />
                  {fresh && <Box component="span" sx={{ px: 0.5, borderRadius: "3px", backgroundColor: "success.main", color: "#fff", fontWeight: 700 }}>NEW</Box>}
                  <span>{timeAgo(n.receivedAt)}</span>
                  {status && STATUS_STYLE[status] && (
                    <Box component="span" sx={{ color: STATUS_STYLE[status].color, fontWeight: 600 }}>
                      {STATUS_STYLE[status].label}
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
