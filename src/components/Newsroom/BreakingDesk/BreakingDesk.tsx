"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Box, Typography, TextField, InputAdornment, Snackbar, LinearProgress, ToggleButtonGroup, ToggleButton } from "@mui/material";
import ResponsiveTabs from "@/components/Layout/ResponsiveTabs";
import { Search, LayoutGrid, List, ArrowUp } from "lucide-react";
import { useThemeMode } from "@/providers/MuiProvider";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { BreakingTag, FtpNewsItem, PostPayload, ROLE_LABELS, SocialPlatform } from "@/types/newsroom";
import { DAILY_CAP, draftToPayload, isLiveOn } from "@/data/socialDesk";
import PostEditor from "./PostEditor";
import PostedPostsList from "./PostedPostsList";
import { RejectDialog } from "./actionDialogs";
import { RejectedList, ScheduledList } from "./DraftLists";
import TemplatesPanel from "./TemplatesPanel";
import UndoToast from "./UndoToast";
import { FtpRefresh } from "./FtpStatus";
import { QueueCards, QueueTable } from "./QueueViews";
import { EmptyState, PLATFORM_META, PlatformIcon } from "./shared";
import { LiveSendingList } from "./DraftLists";
import LiveEditor from "./live/LiveEditor";
import { isLiveItem, useLiveDesk } from "./live/LiveDesk";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";

type TagFilter = "all" | BreakingTag;
type ConsoleTab = "queue" | "scheduled" | "published" | "rejected" | "templates";

const TAG_FILTERS: { value: TagFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "big_breaking", label: "Big breaking" },
  { value: "breaking", label: "Breaking" },
];

const VIEW_KEY = "socia_queue_view";

function readView(): "cards" | "list" {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const tileSx = { backgroundColor: "background.paper", borderRadius: "12px", px: 2, py: 1.5, border: "1px solid", borderColor: "divider", boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)" };

export default function BreakingDesk({ platform }: { platform: SocialPlatform }) {
  const { ftpNews, socialPosts, socialDrafts, pendingPosts, rejectDraft, permissions, currentRole } = useNewsroom();
  // Live desk (NEXT_PUBLIC_USE_MOCKS off): the same screen on the server's drafts; null on the demo data
  const desk = useLiveDesk();
  const canAct = desk ? desk.canAct : permissions.canApproveSocialContent;
  const meta = PLATFORM_META[platform];
  const otherPlatforms = (["X (Twitter)", "Instagram", "Facebook"] as SocialPlatform[]).filter((p) => p !== platform);

  const { mode } = useThemeMode();
  const [tab, setTab] = useState<ConsoleTab>("queue");
  const [viewMode, setViewMode] = useState<"cards" | "list">(readView);
  const changeView = (next: "cards" | "list") => {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [query, setQuery] = useState("");
  // The dashboard links straight into the editor with ?compose=<news id>
  const composeId = useSearchParams().get("compose");
  const [composing, setComposing] = useState<FtpNewsItem | null>(() => {
    // Live: the editor loads the draft by id, so the link can open it before the queue has loaded
    if (desk) return canAct && composeId ? ({ id: composeId } as FtpNewsItem) : null;
    return (permissions.canApproveSocialContent && ftpNews.find((n) => n.id === composeId)) || null;
  });
  const [rejecting, setRejecting] = useState<FtpNewsItem | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  // Stories the operator has already seen; new arrivals wait behind a banner so the list never moves under the cursor
  const [seenUntil, setSeenUntil] = useState(() => Date.now());
  // A second of slack covers stories stamped by a fetch that is finishing as the operator clicks
  const revealNew = () => setSeenUntil(Date.now() + 1000);
  // Live drafts count as new from when the server made them (a story can be filed long before it is approved)
  const isSeen = (n: FtpNewsItem) => new Date(isLiveItem(n) ? (n.live.createdAt ?? n.receivedAt) : n.receivedAt).getTime() <= seenUntil;
  const [notice, setNotice] = useState("");

  const drafts = useMemo(() => socialDrafts.filter((d) => d.platform === platform), [socialDrafts, platform]);
  const draftFor = (newsId: string) => drafts.find((d) => d.newsId === newsId);
  const pendingHere = new Set(pendingPosts.filter((p) => p.payload.platform === platform && !p.post).map((p) => p.payload.newsId));

  // The queue holds every story not yet live here, not waiting to post, and not scheduled, rejected or dismissed
  const queue: FtpNewsItem[] = desk
    ? desk.queue.filter((n) => !desk.pending.some((p) => p.draftId === n.id && !p.outcome))
    : ftpNews.filter((n) => {
        const status = draftFor(n.id)?.status;
        return !isLiveOn(socialPosts, n.id, platform) && !pendingHere.has(n.id) && (!status || status === "saved");
      });
  const arrived = queue.filter((n) => !isSeen(n));
  const visible = queue.filter((n) => {
    if (!isSeen(n)) return false;
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || [n.headline, n.shortText, n.area, n.ftpPath].some((field) => field.toLowerCase().includes(q));
    return matchesQuery && (tagFilter === "all" || n.tag === tagFilter);
  });

  const postsHere = socialPosts.filter((p) => p.platform === platform);
  const counts = desk?.counts.data;
  const liveCap = counts?.cap ?? desk?.inbox.data?.cap;
  const publishedToday = desk ? (counts?.publishedToday ?? 0) : postsHere.filter((p) => p.status !== "recalled" && isToday(p.postedAt)).length;
  // Live: the server sends posts on approval, so "Scheduled" becomes what is on its way (and what failed)
  const scheduledCount = desk ? (counts?.byView.sending ?? 0) + (counts?.byView.failed ?? 0) : drafts.filter((d) => d.status === "scheduled").length;
  const rejectedCount = desk ? (counts?.byView.rejected ?? desk.rejected.data?.items.length ?? 0) : drafts.filter((d) => d.status === "rejected").length;
  const rejectedToday = drafts.filter((d) => d.status === "rejected" && isToday(d.updatedAt)).length;
  const publishedCount = desk ? (desk.posts.data?.items.length ?? 0) : postsHere.length;
  const cap = desk && liveCap ? liveCap.cap : DAILY_CAP[platform];
  const capUsed = desk && liveCap ? liveCap.used : publishedToday;
  const capShare = capUsed / cap;

  const focused = visible[Math.min(focusIndex, visible.length - 1)];

  const quickPayload = (item: FtpNewsItem): PostPayload => {
    const cover = item.media[0];
    return {
      newsId: item.id,
      platform,
      headline: item.headline,
      text: item.shortText,
      caption: item.shortText,
      hashtags: [],
      mentions: [],
      mediaKind: cover.kind,
      thumbUrl: cover.posterUrl ?? cover.url,
      postedBy: ROLE_LABELS[currentRole],
    };
  };

  // Queue shortcuts from the spec: J/K move, Enter or E opens, R rejects
  useEffect(() => {
    if (tab !== "queue" || composing || rejecting) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, [contenteditable='true'], [role='dialog']")) return;
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, Math.min(visible.length - 1, i + (key === "j" ? 1 : -1))));
      } else if ((key === "enter" || key === "e") && focused && canAct) {
        e.preventDefault();
        setComposing(focused);
      } else if (key === "r" && focused && canAct && !(isLiveItem(focused) && focused.live.claim && !focused.live.claim.mine)) {
        e.preventDefault();
        setRejecting(focused);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, composing, rejecting, visible.length, focused, canAct]);


  const openStory = (newsId: string) => {
    const item = ftpNews.find((n) => n.id === newsId);
    if (item) setComposing(item);
  };

  const stats = [
    { label: "To post", value: queue.length, tone: "text.primary" },
    { label: desk ? "Sending" : "Scheduled", value: scheduledCount, tone: "text.primary" },
    { label: "Published today", value: publishedToday, tone: "success.main" },
    // The server keeps no reject time on the queue, so the live desk shows every rejected story
    desk ? { label: "Rejected", value: rejectedCount, tone: "error.main" } : { label: "Rejected today", value: rejectedToday, tone: "error.main" },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PlatformIcon platform={platform} size={16} />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              {meta.short} draft console
            </Typography>
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
            Stories tagged Breaking or Big Breaking on the FTP, ready for the @{meta.handle} template.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, val) => val && changeView(val)}
            size="small"
            aria-label="Queue view"
            sx={{
              height: 36,
              "& .MuiToggleButton-root": {
                px: 1.25,
                borderRadius: "8px",
                borderColor: "divider",
                textTransform: "none",
                gap: 0.5,
                fontSize: "0.75rem",
                fontWeight: 600,
                "&.Mui-selected": { backgroundColor: mode === "light" ? "#000" : "#fff", color: mode === "light" ? "#fff" : "#000", "&:hover": { backgroundColor: mode === "light" ? "#000" : "#fff" } },
              },
            }}
          >
            <ToggleButton value="cards" aria-label="Cards view">
              <LayoutGrid size={15} /> Cards
            </ToggleButton>
            <ToggleButton value="list" aria-label="List view">
              <List size={15} /> List
            </ToggleButton>
          </ToggleButtonGroup>
          <FtpRefresh
            onDone={(added) => {
              // A check the operator asked for shows its results straight away
              revealNew();
              setNotice(added ? `${added} new breaking ${added === 1 ? "story" : "stories"} pulled from FTP` : "Up to date. No new breaking stories.");
            }}
          />
        </Box>
      </Box>

      {/* Today */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr) 1.4fr" }, gap: 1.5 }}>
        {stats.map((s) => (
          <Box key={s.label} sx={tileSx}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{s.label}</Typography>
            <Typography sx={{ fontSize: "1.375rem", fontWeight: 700, color: s.tone, fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}>{s.value}</Typography>
          </Box>
        ))}
        <Box sx={{ ...tileSx, gridColumn: { xs: "1 / -1", md: "auto" } }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{meta.short} volume today</Typography>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {capUsed} / {cap}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, capShare * 100)}
            color={capShare >= 0.95 ? "error" : capShare >= 0.8 ? "warning" : "success"}
            sx={{ mt: 1, height: 6, borderRadius: 3 }}
          />
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.75 }}>
            {platform === "Instagram" ? "Meta allows 100 API posts per 24 hours" : "Daily plan for the X desk"}
          </Typography>
        </Box>
      </Box>

      {/* Tabs + filters */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderBottom: "1px solid", borderColor: "divider" }}>
        <ResponsiveTabs<ConsoleTab>
          value={tab}
          onChange={setTab}
          ariaLabel="Draft console sections"
          items={[
            { value: "queue", label: `Queue (${queue.length})` },
            { value: "scheduled", label: `${desk ? "Sending" : "Scheduled"} (${scheduledCount})` },
            { value: "published", label: `Published (${publishedCount})` },
            { value: "rejected", label: `Rejected (${rejectedCount})` },
            { value: "templates", label: "Templates" },
          ]}
          tabsSx={{ minHeight: 40, maxWidth: "100%", "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", px: 1.5, minWidth: 0 } }}
        />
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
      {tab === "queue" && (
        <>
          {arrived.length > 0 && (
            <Box
              component="button"
              onClick={revealNew}
              sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, py: 1, border: "1px solid", borderColor: "success.main", borderRadius: "10px", backgroundColor: (t) => (t.palette.mode === "light" ? "#E8F5E9" : "#12301A"), color: "success.main", fontFamily: "inherit", fontSize: "0.8125rem", fontWeight: 700, cursor: "pointer", "&:hover": { filter: "brightness(0.97)" } }}
            >
              <ArrowUp size={15} />
              {arrived.length} new breaking {arrived.length === 1 ? "story" : "stories"} from FTP · Show
            </Box>
          )}
          {desk && !desk.inbox.data ? (
            desk.inbox.error ? <LoadError error={desk.inbox.error} onRetry={() => void desk.inbox.refresh()} /> : <LoadingRows rows={3} height={120} />
          ) : visible.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px" }}>
              <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600 }}>{queue.length === 0 ? "All drafts cleared" : "No stories match these filters"}</Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>
                {queue.length === 0 ? "New breaking stories appear here as the FTP is checked automatically." : "Clear the search or switch the tag filter."}
              </Typography>
            </Box>
          ) : (
            (() => {
              const props = {
                items: visible,
                focusedId: focused?.id,
                onFocus: setFocusIndex,
                onOpen: setComposing,
                onReject: setRejecting,
                isSaved: (newsId: string) => (desk ? !!desk.queue.find((n) => n.id === newsId)?.live.claim?.mine : draftFor(newsId)?.status === "saved"),
                liveElsewhere: (newsId: string) => (desk ? null : otherPlatforms.filter((p) => isLiveOn(socialPosts, newsId, p)).map((p) => PLATFORM_META[p].short).join(", ") || null),
                canAct,
                ...(desk
                  ? {
                      savedLabel: "With you",
                      heldBy: (newsId: string) => {
                        const claim = desk.queue.find((n) => n.id === newsId)?.live.claim;
                        return claim && !claim.mine ? claim.name : null;
                      },
                    }
                  : {}),
              };
              return viewMode === "list" ? <QueueTable {...props} /> : <QueueCards {...props} />;
            })()
          )}
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", display: { xs: "none", md: "block" } }}>
            Keyboard: J / K to move, Enter or E to open, R to reject.
          </Typography>
        </>
      )}

      {tab === "scheduled" && (desk ? <LiveSendingList /> : <ScheduledList platform={platform} onEdit={openStory} />)}
      {tab === "published" && <PostedPostsList platform={platform} allowRecall emptyHint={`No posts on ${meta.short} yet. Approved stories land here with their link.`} />}
      {tab === "rejected" && <RejectedList platform={platform} />}
      {tab === "templates" &&
        (desk ? (
          <EmptyState title="Hashtag rules and handles live on the server" hint="The live desk suggests hashtags and @handles from the Socia library. Editing that library from this screen is not wired up yet." />
        ) : (
          <TemplatesPanel />
        ))}

      {composing &&
        (desk ? (
          <LiveEditor item={composing} platform={platform} onClose={() => setComposing(null)} onSwitch={setComposing} onSaved={setNotice} />
        ) : (
          <PostEditor item={composing} platform={platform} onClose={() => setComposing(null)} onSwitch={setComposing} onSaved={setNotice} />
        ))}
      {rejecting && (
        <RejectDialog
          open
          headline={rejecting.headline}
          onClose={() => setRejecting(null)}
          onConfirm={(reason, note) => {
            if (desk) {
              const { id, headline } = rejecting;
              setRejecting(null);
              void desk.rejectFromQueue(id, reason, note).then((error) => setNotice(error ?? `Rejected. "${headline}" moved to Rejected.`));
              return;
            }
            const saved = draftFor(rejecting.id);
            rejectDraft(saved?.status === "saved" ? draftToPayload(saved) : quickPayload(rejecting), reason, note);
            setRejecting(null);
          }}
        />
      )}

      <UndoToast />
      <Snackbar open={!!notice} autoHideDuration={3500} onClose={() => setNotice("")} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
