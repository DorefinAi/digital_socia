"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Box, Typography, Button, TextField, InputAdornment, Tabs, Tab, Snackbar, CircularProgress, Tooltip } from "@mui/material";
import { Search, RefreshCw, Film, Image as ImageIcon, MapPin, PenLine, Lock, CheckCircle } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { BreakingTag, FtpNewsItem, SocialPlatform } from "@/types/newsroom";
import PostEditor from "./PostEditor";
import PostedPostsList from "./PostedPostsList";
import { PLATFORM_META, PlatformIcon, TagChip, timeAgo } from "./shared";

type TagFilter = "all" | BreakingTag;

const TAG_FILTERS: { value: TagFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "big_breaking", label: "Big breaking" },
  { value: "breaking", label: "Breaking" },
];

export default function BreakingDesk({ platform }: { platform: SocialPlatform }) {
  const { ftpNews, socialPosts, ftpSyncedAt, fetchFtpNews, permissions } = useNewsroom();
  const meta = PLATFORM_META[platform];
  const otherPlatform: SocialPlatform = platform === "Instagram" ? "X (Twitter)" : "Instagram";

  const [tab, setTab] = useState<"queue" | "posted">("queue");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [query, setQuery] = useState("");
  // The dashboard links straight into the composer with ?compose=<news id>
  const composeId = useSearchParams().get("compose");
  const [composing, setComposing] = useState<FtpNewsItem | null>(
    () => (permissions.canApproveSocialContent && ftpNews.find((n) => n.id === composeId)) || null
  );
  const [fetching, setFetching] = useState(false);
  const [notice, setNotice] = useState("");

  const postedHere = useMemo(() => new Set(socialPosts.filter((p) => p.platform === platform).map((p) => p.newsId)), [socialPosts, platform]);
  const postedElsewhere = useMemo(() => new Set(socialPosts.filter((p) => p.platform === otherPlatform).map((p) => p.newsId)), [socialPosts, otherPlatform]);

  const queue = ftpNews.filter((n) => !postedHere.has(n.id));
  const visible = queue.filter((n) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || [n.headline, n.shortText, n.area, n.ftpPath].some((field) => field.toLowerCase().includes(q));
    return matchesQuery && (tagFilter === "all" || n.tag === tagFilter);
  });

  const handleFetch = () => {
    setFetching(true);
    // Brief delay stands in for the FTP round-trip
    setTimeout(() => {
      const added = fetchFtpNews();
      setFetching(false);
      setNotice(added ? `${added} new breaking ${added === 1 ? "story" : "stories"} pulled from FTP` : "FTP checked. No new breaking stories.");
    }, 700);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PlatformIcon platform={platform} size={16} />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              {meta.short} breaking desk
            </Typography>
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
            Stories tagged Breaking or Big Breaking on the FTP, ready for the @{meta.handle} template.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>FTP checked {timeAgo(ftpSyncedAt)}</Typography>
          <Button
            variant="outlined"
            onClick={handleFetch}
            disabled={fetching}
            startIcon={fetching ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={15} />}
            sx={{ fontWeight: 600, borderColor: "divider", color: "text.primary" }}
          >
            {fetching ? "Checking FTP" : "Fetch from FTP"}
          </Button>
        </Box>
      </Box>

      {/* Tabs + filters */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderBottom: "1px solid", borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", px: 1.5, minWidth: 0 } }}
        >
          <Tab value="queue" label={`To post (${queue.length})`} />
          <Tab value="posted" label={`Posted (${postedHere.size})`} />
        </Tabs>
        {tab === "queue" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: { xs: 0, sm: "auto" }, width: { xs: "100%", sm: "auto" }, pb: 0.75, flexWrap: "wrap" }}>
            <Box role="group" aria-label="Filter by tag" sx={{ display: "flex", border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
              {TAG_FILTERS.map((f) => (
                <Box
                  key={f.value}
                  component="button"
                  onClick={() => setTagFilter(f.value)}
                  aria-pressed={tagFilter === f.value}
                  sx={{
                    border: 0,
                    px: 1.25,
                    py: 0.6,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    color: tagFilter === f.value ? "background.paper" : "text.secondary",
                    backgroundColor: tagFilter === f.value ? "text.primary" : "transparent",
                    "&:focus-visible": { outline: "2px solid", outlineOffset: "-2px" },
                  }}
                >
                  {f.label}
                </Box>
              ))}
            </Box>
            <TextField
              placeholder="Search headline, area, path"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={15} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ width: { xs: "100%", sm: 240 }, "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem", height: 32 } }}
            />
          </Box>
        )}
      </Box>

      {/* Queue */}
      {tab === "queue" &&
        (visible.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px" }}>
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600 }}>
              {queue.length === 0 ? "Queue is clear" : "No stories match these filters"}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>
              {queue.length === 0 ? "Every breaking story on the FTP has been posted. Fetch again to check for new ones." : "Clear the search or switch the tag filter."}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
            {visible.map((item, i) => {
              const cover = item.media[0];
              const videos = item.media.filter((m) => m.kind === "video").length;
              const images = item.media.length - videos;
              return (
                <Box
                  key={item.id}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "96px minmax(0, 1fr)", sm: "132px minmax(0, 1fr) auto" },
                    gap: 1.5,
                    alignItems: "center",
                    p: 1.25,
                    borderTop: i === 0 ? "none" : "1px solid",
                    borderColor: "divider",
                    borderLeft: "3px solid",
                    borderLeftColor: item.tag === "big_breaking" ? "#FFD400" : "transparent",
                  }}
                >
                  <Box sx={{ position: "relative", aspectRatio: "16 / 9", borderRadius: "6px", overflow: "hidden", backgroundColor: "#111" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover.posterUrl ?? cover.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <Box sx={{ position: "absolute", left: 6, top: 6 }}>
                      <TagChip tag={item.tag} />
                    </Box>
                  </Box>

                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.45 }}>{item.headline}</Typography>
                    <Typography
                      sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.55, mt: 0.25, display: { xs: "none", sm: "-webkit-box" }, WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                    >
                      {item.shortText}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mt: 0.5, fontSize: "0.6875rem", color: "text.secondary" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                        <MapPin size={12} /> {item.area}
                      </Box>
                      {images > 0 && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                          <ImageIcon size={12} /> {images}
                        </Box>
                      )}
                      {videos > 0 && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                          <Film size={12} /> {videos}
                        </Box>
                      )}
                      <span>{timeAgo(item.receivedAt)}</span>
                      {postedElsewhere.has(item.id) && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4, color: "success.main" }}>
                          <CheckCircle size={12} /> on {PLATFORM_META[otherPlatform].short}
                        </Box>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono), ui-monospace, monospace", color: "text.disabled", mt: 0.5, display: { xs: "none", sm: "block" }, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.ftpPath}
                    </Typography>
                  </Box>

                  <Tooltip title={permissions.canApproveSocialContent ? "" : "Your role can view posts but not publish them"}>
                    <Box component="span" sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}>
                      <Button
                        variant="contained"
                        onClick={() => setComposing(item)}
                        disabled={!permissions.canApproveSocialContent}
                        startIcon={permissions.canApproveSocialContent ? <PenLine size={15} /> : <Lock size={15} />}
                        sx={{ fontWeight: 600, whiteSpace: "nowrap", width: { xs: "100%", sm: "auto" } }}
                      >
                        Create post
                      </Button>
                    </Box>
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
        ))}

      {/* Posted */}
      {tab === "posted" && <PostedPostsList platform={platform} emptyHint={`Stories you post to ${meta.short} from the queue land here with their link.`} />}

      {composing && <PostEditor key={composing.id} item={composing} platform={platform} onClose={() => setComposing(null)} />}

      <Snackbar open={!!notice} autoHideDuration={3500} onClose={() => setNotice("")} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
