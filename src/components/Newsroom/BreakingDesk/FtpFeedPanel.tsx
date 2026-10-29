"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { BreakingTag, FtpNewsItem, SocialPlatform } from "@/types/newsroom";
import { isLiveOn } from "@/data/socialDesk";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { CategoryLabel, srOnly, storyCategory, storyTag, TAG_TINT, tagTint, timeAgo } from "./shared";
import { isLiveItem, useLiveDesk } from "./live/LiveDesk";
import NewStoriesPill, { freshHighlightSx } from "./NewStoriesPill";

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  posted: { label: "Posted", color: "success.main" },
  saved: { label: "Draft", color: "text.secondary" },
  scheduled: { label: "Scheduled", color: "info.main" },
  rejected: { label: "Rejected", color: "error.main" },
};

/** Live FTP feed beside the editor: newest first, new arrivals marked, click to switch story. */
export default function FtpFeedPanel({ platform, currentId, onPick }: { platform: SocialPlatform; currentId: string; onPick: (item: FtpNewsItem) => void }) {
  const { ftpNews, socialPosts, socialDrafts } = useNewsroom();
  const desk = useLiveDesk();
  const listRef = useRef<HTMLDivElement>(null);
  const [openedAt] = useState(() => Date.now());
  // Live: the stories waiting in the X queue, newest first
  const stories: FtpNewsItem[] = desk ? desk.queue : ftpNews;
  const sorted = [...stories].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const loading = !!desk && !desk.inbox.data;

  // Stories that arrive while the feed is open wait behind the "new stories" pill, so the list never jumps
  const [shown, setShown] = useState<ReadonlySet<string> | null>(null);
  if (shown === null && !loading) setShown(new Set(sorted.map((n) => n.id)));
  const waiting = shown ? sorted.filter((n) => !shown.has(n.id) && n.id !== currentId) : [];
  const listed = shown ? sorted.filter((n) => shown.has(n.id) || n.id === currentId) : sorted;
  const [highlight, setHighlight] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!highlight.size) return;
    const t = setTimeout(() => setHighlight(new Set()), 2200);
    return () => clearTimeout(t);
  }, [highlight]);
  // Merged by itself only while the feed is scrolled to its top and the pointer is elsewhere
  const [atTop, setAtTop] = useState(true);
  const [pointerIn, setPointerIn] = useState(false);
  const mergeWaiting = () => {
    setShown(new Set([...(shown ?? []), ...waiting.map((n) => n.id)]));
    setHighlight(new Set(waiting.map((n) => n.id)));
  };
  if (waiting.length > 0 && atTop && !pointerIn) mergeWaiting();

  const statusOf = (id: string) => {
    if (desk) return undefined;
    if (isLiveOn(socialPosts, id, platform)) return "posted";
    const draft = socialDrafts.find((d) => d.newsId === id && d.platform === platform && d.status !== "deleted");
    return draft?.status;
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, height: { lg: "100%" }, minHeight: 0 }}>
      <Box>
        <Typography component="h2" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>
          FTP feed
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
          {loading ? "Loading stories" : `${listed.length} ${listed.length === 1 ? "story" : "stories"}, newest first`}
        </Typography>
      </Box>
      <Box aria-hidden sx={{ display: "flex", flexWrap: "wrap", columnGap: 1.5, rowGap: 0.5 }}>
        {(Object.keys(TAG_TINT) as BreakingTag[]).map((tag) => (
          <Box key={tag} sx={{ display: "flex", alignItems: "center", gap: 0.6, fontSize: "0.6875rem", color: "text.secondary", whiteSpace: "nowrap" }}>
            <Box sx={{ width: 18, height: 10, borderRadius: "3px", background: (t) => tagTint(tag, t.palette.mode, 1.6) }} />
            {TAG_TINT[tag].label}
          </Box>
        ))}
      </Box>
      <Box
        ref={listRef}
        onScroll={(e) => setAtTop(e.currentTarget.scrollTop <= 2)}
        onPointerEnter={() => setPointerIn(true)}
        onPointerLeave={() => setPointerIn(false)}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          mx: -1,
          px: 0.5,
          maxHeight: { xs: 360, lg: "none" },
          scrollbarWidth: "thin",
          scrollbarGutter: "stable",
        }}
      >
        <NewStoriesPill
          count={waiting.length}
          onShow={() => {
            mergeWaiting();
            listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
        {desk && !desk.inbox.data ? (
          desk.inbox.error ? (
            <LoadError error={desk.inbox.error} onRetry={() => void desk.inbox.refresh()} />
          ) : (
            <LoadingRows rows={6} height={54} />
          )
        ) : listed.length === 0 ? (
          <Box sx={{ py: 4, px: 2, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "8px" }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>No stories waiting</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.5 }}>New stories from the FTP appear here on their own.</Typography>
          </Box>
        ) : (
          listed.map((n) => {
            const current = n.id === currentId;
            const status = statusOf(n.id);
            const live = isLiveItem(n) ? n.live : null;
            const tag = storyTag(n);
            const category = storyCategory(n);
            const fresh = new Date(live?.createdAt ?? n.receivedAt).getTime() > openedAt;
            const cover = n.media[0];
            // Live: who has the story open; never when their hold runs out
            const holder = live?.claim && !current ? (live.claim.mine ? "With you" : `${live.claim.name} is editing`) : null;
            return (
              <Box
                key={n.id}
                component="button"
                onClick={() => !current && onPick(n)}
                aria-current={current ? "true" : undefined}
                sx={{
                  // Positioned so the screen-reader label stays inside the scrolling list
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "52px minmax(0, 1fr)",
                  gap: 1,
                  alignItems: "center",
                  width: "100%",
                  textAlign: "left",
                  p: 1,
                  mb: 0.5,
                  border: 0,
                  borderRadius: "8px",
                  fontFamily: "inherit",
                  color: "text.primary",
                  cursor: current ? "default" : "pointer",
                  // Flagged stories carry their tag colour; the rest stay neutral
                  background: (t) => (tag ? tagTint(tag, t.palette.mode, current ? 1.6 : 1) : current ? t.palette.action.selected : "transparent"),
                  // The open story is outlined so it stays distinct from the tint
                  boxShadow: (t) => (current ? `inset 0 0 0 2px ${t.palette.text.primary}` : "none"),
                  "&:hover": { background: (t) => (tag ? tagTint(tag, t.palette.mode, current ? 1.6 : 1.35) : current ? t.palette.action.selected : t.palette.action.hover) },
                  "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" },
                  ...(highlight.has(n.id) ? freshHighlightSx : {}),
                }}
              >
                <Box sx={{ position: "relative", width: 52, height: 38, borderRadius: "4px", overflow: "hidden", backgroundColor: "#111" }}>
                  {cover?.url || cover?.posterUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={cover.posterUrl ?? cover.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : null}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.headline}</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.4, minWidth: 0, overflow: "hidden", fontSize: "0.625rem", color: "text.secondary", whiteSpace: "nowrap"}}>
                    {tag && (
                      <Box component="span" sx={srOnly}>
                        {TAG_TINT[tag].label}
                      </Box>
                    )}
                    {fresh && <Box component="span" sx={{ px: 0.5, borderRadius: "3px", backgroundColor: "success.main", color: "#fff", fontWeight: 700 }}>NEW</Box>}
                    {category && <CategoryLabel category={category} />}
                    <span>{timeAgo(n.receivedAt)}</span>
                    {holder && (
                      <Box component="span" sx={{ color: "info.main", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {holder}
                      </Box>
                    )}
                    {status && STATUS_STYLE[status] && (
                      <Box component="span" sx={{ color: STATUS_STYLE[status].color, fontWeight: 600 }}>
                        {STATUS_STYLE[status].label}
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
