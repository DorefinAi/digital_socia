"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Box, Button, Typography, TextField, InputAdornment, Snackbar, LinearProgress } from "@mui/material";
import ResponsiveTabs from "@/components/Layout/ResponsiveTabs";
import { Search, LayoutGrid, List } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { BreakingTag, FtpNewsItem, PostPayload, SocialPlatform } from "@/types/newsroom";
import { usePermissions } from "@/lib/access/usePermissions";
import { DAILY_CAP, draftToPayload, isLiveOn } from "@/data/socialDesk";
import PostEditor from "./PostEditor";
import PostedPostsList from "./PostedPostsList";
import { RejectDialog } from "./actionDialogs";
import { ScheduledList } from "./DraftLists";
import TemplatesPanel from "./TemplatesPanel";
import CardBackgroundPanel from "./live/CardBackgroundPanel";
import UndoToast from "./UndoToast";
import { FtpRefresh } from "./FtpStatus";
import { countMedia, QueueCards, QueueTable } from "./QueueViews";
import NewStoriesPill from "./NewStoriesPill";
import { CONTROL_HEIGHT, EmptyState, isRejectedNotice, PLATFORM_META, PlatformIcon, rejectedNotice, SegmentedControl, storyCategory, storyTag, TAG_TINT } from "./shared";
import { activeFilterCount, ActiveFilterChips, type FilterFacts, matchesOtherFilters, matchesPriority, QueueFiltersButton, type QueueFilterState, readQueueFilters, saveQueueFilters, sortStories } from "./QueueFilters";
import { REJECTED_NEWS_PATH } from "@/lib/rejectedNews";
import { readPrefill, type TrendPrefill } from "@/lib/trendPrefill";
import { LiveSendingList } from "./DraftLists";
import LiveEditor from "./live/LiveEditor";
import { isLiveItem, useLiveDesk } from "./live/LiveDesk";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";

type ConsoleTab = "queue" | "scheduled" | "published" | "templates";

const VIEW_KEY = "socia_queue_view";

function readView(): "cards" | "list" {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** A web trend as a story the editor can open (demo editor; nothing is posted from it). */
function trendToNews(p: TrendPrefill): FtpNewsItem {
  const body = [p.text, p.source && `Source: ${p.source}`].filter(Boolean).join("\n\n");
  return {
    id: `trend-${p.headline.slice(0, 40)}`,
    headline: p.headline,
    body,
    shortText: p.text || p.headline,
    tag: "breaking",
    area: p.district,
    people: [],
    ftpPath: p.source,
    media: [{ kind: "image", url: "", fileName: "No photo: drafted from a web trend" }],
    receivedAt: new Date().toISOString(),
  };
}

const tileSx = { backgroundColor: "background.paper", borderRadius: "12px", px: 2, py: 1.5, border: "1px solid", borderColor: "divider", boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)" };

export default function BreakingDesk({ platform }: { platform: SocialPlatform }) {
  const { ftpNews, socialPosts, socialDrafts, pendingPosts, rejectDraft } = useNewsroom();
  const { can, roleLabel } = usePermissions();
  // Live desk (NEXT_PUBLIC_USE_MOCKS off): the same screen on the server's drafts; null on the demo data
  const desk = useLiveDesk();
  // Open a story in the editor (draft.edit); reject it from the queue
  const canAct = desk ? desk.canAct : can("draft.edit");
  // The server lets post.publish decline a draft too (Digital Team rejects on the desk)
  const canReject = canAct && (can("draft.reject") || can("post.publish"));
  const meta = PLATFORM_META[platform];
  const otherPlatforms = (["X (Twitter)", "Instagram", "Facebook"] as SocialPlatform[]).filter((p) => p !== platform);

  // ?tab=templates opens the Templates tab (the profile page links there for card backgrounds)
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<ConsoleTab>(() => (initialTab === "templates" || initialTab === "published" || initialTab === "scheduled" ? initialTab : "queue"));
  const [viewMode, setViewMode] = useState<"cards" | "list">(readView);
  const changeView = (next: "cards" | "list") => {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };
  // More filters (Filters button), remembered in this browser
  const [filters, setFiltersState] = useState<QueueFilterState>(readQueueFilters);
  // The clock the "received" filters read; ticks each minute so "last hour" keeps moving
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const setFilters = (next: QueueFilterState) => {
    setFiltersState(next);
    saveQueueFilters(next);
  };
  const [query, setQuery] = useState("");
  // The dashboard links straight into the editor with ?compose=<news id>
  const searchParams = useSearchParams();
  const composeId = searchParams.get("compose");
  // The Web Scraper's "Create draft for…" opens platforms without a Socia backend on a trend (?prefill=)
  const prefill = readPrefill(searchParams);
  const [composing, setComposing] = useState<FtpNewsItem | null>(() => {
    // Live: the editor loads the draft by id, so the link can open it before the queue has loaded
    if (desk) return canAct && composeId ? ({ id: composeId } as FtpNewsItem) : null;
    if (!can("draft.edit")) return null;
    if (prefill) return trendToNews(prefill);
    return ftpNews.find((n) => n.id === composeId) || null;
  });
  const [rejecting, setRejecting] = useState<FtpNewsItem | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  // Stories the operator has already seen; new arrivals wait behind the "new stories" pill so the list never moves under the cursor
  const [seenUntil, setSeenUntil] = useState(() => Date.now());
  // Live drafts count as new from when the server made them (a story can be filed long before it is approved)
  const stampOf = (n: FtpNewsItem) => new Date(isLiveItem(n) ? (n.live.createdAt ?? n.receivedAt) : n.receivedAt).getTime();
  // A story without a readable time counts as seen, so it can never hold the pill (or seenUntil) open
  const isSeen = (n: FtpNewsItem) => {
    const t = stampOf(n);
    return !Number.isFinite(t) || t <= seenUntil;
  };
  // Stories just shown, highlighted for a moment: the ones stamped inside this window. A window rather than
  // a list of ids, so a Refresh highlights what its fetch brought in even though that arrives after the click.
  const [flash, setFlash] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);
  /** Marks everything stamped up to `to` as seen, and highlights what that reveals. */
  const revealUntil = (to: number) => {
    if (!Number.isFinite(to) || to <= seenUntil) return;
    setFlash({ from: seenUntil, to });
    setSeenUntil(to);
  };
  // The list merges new stories by itself only while the operator is at its top and not pointing at it
  const listRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [pointerInList, setPointerInList] = useState(false);
  useEffect(() => {
    const onScroll = () => setAtTop((listRef.current?.getBoundingClientRect().top ?? 0) >= -4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
  const facts: FilterFacts = {
    media: countMedia,
    status: (n) => {
      if (isLiveItem(n)) return n.live.claim ? (n.live.claim.mine ? "mine" : "held") : "new";
      return draftFor(n.id)?.status === "saved" ? "mine" : "new";
    },
  };
  const q = query.trim().toLowerCase();
  const matchesSearchAndFilters = (n: FtpNewsItem) => (!q || [n.headline, n.shortText, n.area, n.ftpPath, storyCategory(n) ?? ""].some((field) => field.toLowerCase().includes(q))) && matchesOtherFilters(n, filters, facts, now);
  // Seen stories matching the search and every filter but priority; the priority switch counts within these
  const matching = queue.filter((n) => isSeen(n) && matchesSearchAndFilters(n));
  // New stories waiting behind the pill; only the ones the filters would show are counted
  const unseen = queue.filter((n) => !isSeen(n));
  const arrived = unseen.filter((n) => matchesSearchAndFilters(n) && matchesPriority(n, filters.priority));
  // The newest waiting story's time (isSeen already counts unreadable times as seen, so this stays finite)
  const latestUnseen = unseen.reduce((latest, n) => Math.max(latest, stampOf(n)), seenUntil);
  const highlight: ReadonlySet<string> = new Set(
    flash
      ? queue.filter((n) => {
          const t = stampOf(n);
          return t > flash.from && t <= flash.to;
        }).map((n) => n.id)
      : [],
  );
  /** Merges the waiting stories into the list (highlighted for a moment). */
  const mergeArrived = () => revealUntil(latestUnseen);
  /** The pill: merge, then bring the top of the list into view. */
  const showArrived = () => {
    mergeArrived();
    if (!listRef.current) return;
    const y = listRef.current.getBoundingClientRect().top + window.scrollY - 16;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: "smooth" });
  };
  // At the top and not pointing at the list: nothing moves under the operator, so merge straight away.
  // Guarded so it runs once per arrival: after it, latestUnseen equals seenUntil and nothing is waiting.
  if (tab === "queue" && arrived.length > 0 && latestUnseen > seenUntil && atTop && !pointerInList && !composing) mergeArrived();
  const priorityCounts = { all: matching.length, big_breaking: 0, breaking: 0 };
  for (const n of matching) {
    const t = storyTag(n);
    if (t) priorityCounts[t] += 1;
  }
  const visible = sortStories(
    matching.filter((n) => matchesPriority(n, filters.priority)),
    filters.sort,
  );
  const narrowed = !!q || activeFilterCount(filters) > 0;
  // The quick priority switch mirrors a single-priority choice made in Filters
  const quickPriority: "all" | BreakingTag | null = !filters.priority.length ? "all" : filters.priority.length === 1 && filters.priority[0] !== "normal" ? filters.priority[0] : null;
  const categoriesInQueue = [...new Set(queue.map(storyCategory).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const districtsInQueue = [...new Set(queue.map((n) => n.area).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const postsHere = socialPosts.filter((p) => p.platform === platform);
  const counts = desk?.counts.data;
  const liveCap = counts?.cap ?? desk?.inbox.data?.cap;
  const publishedToday = desk ? (counts?.publishedToday ?? 0) : postsHere.filter((p) => p.status !== "recalled" && isToday(p.postedAt)).length;
  // Live: the server sends posts on approval, so "Scheduled" becomes what is on its way (and what failed)
  const scheduledCount = desk ? (counts?.byView.sending ?? 0) + (counts?.byView.failed ?? 0) : drafts.filter((d) => d.status === "scheduled").length;
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
      postedBy: roleLabel,
    };
  };

  // Queue shortcuts from the spec: J/K move, Enter or E opens, R rejects
  useEffect(() => {
    if (tab !== "queue" || composing || rejecting) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, [contenteditable='true'], [role='dialog']")) return;
      const key = e.key.toLowerCase();
      // Enter on a focused button or link (the new-stories pill, card actions) presses that control instead
      if (key === "enter" && target.closest("button, a, [role='button']")) return;
      if (key === "j" || key === "k") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, Math.min(visible.length - 1, i + (key === "j" ? 1 : -1))));
      } else if ((key === "enter" || key === "e") && focused && canAct) {
        e.preventDefault();
        setComposing(focused);
      } else if (key === "r" && focused && canReject && !(isLiveItem(focused) && focused.live.claim && !focused.live.claim.mine)) {
        e.preventDefault();
        setRejecting(focused);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, composing, rejecting, visible.length, focused, canAct, canReject]);


  const openStory = (newsId: string) => {
    const item = ftpNews.find((n) => n.id === newsId);
    if (item) setComposing(item);
  };

  const stats = [
    { label: "To post", value: queue.length, tone: "text.primary" },
    { label: desk ? "Sending" : "Scheduled", value: scheduledCount, tone: "text.primary" },
    { label: "Published today", value: publishedToday, tone: "success.main" },
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
          <SegmentedControl
            ariaLabel="Queue view"
            value={viewMode}
            onChange={changeView}
            options={[
              { value: "cards", label: (<><LayoutGrid size={14} /> Cards</>) },
              { value: "list", label: (<><List size={14} /> List</>) },
            ]}
          />
          <FtpRefresh
            onDone={(added) => {
              // A check the operator asked for shows everything it found straight away, highlighted
              revealUntil(Date.now() + 1000);
              setNotice(added ? `${added} new breaking ${added === 1 ? "story" : "stories"} pulled from FTP` : "Up to date. No new breaking stories.");
            }}
          />
        </Box>
      </Box>

      {/* Today */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", md: "repeat(3, 1fr) 1.4fr" }, gap: 1.5 }}>
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
            { value: "queue", label: narrowed ? `Queue (${visible.length} of ${queue.length})` : `Queue (${queue.length})` },
            { value: "scheduled", label: `${desk ? "Sending" : "Scheduled"} (${scheduledCount})` },
            { value: "published", label: `Published (${publishedCount})` },
            { value: "templates", label: "Templates" },
          ]}
          tabsSx={{ minHeight: 40, maxWidth: "100%", "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", px: 1.5, minWidth: 0 } }}
        />
        {tab === "queue" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: { xs: 0, sm: "auto" }, width: { xs: "100%", sm: "auto" }, pb: 0.75, flexWrap: "wrap" }}>
            <SegmentedControl<"all" | BreakingTag>
              ariaLabel="Filter by priority"
              value={quickPriority}
              onChange={(v) => setFilters({ ...filters, priority: v === "all" ? [] : [v] })}
              options={(["all", "big_breaking", "breaking"] as const).map((v) => ({
                value: v,
                label: (
                  <>
                    {v === "all" ? "All" : TAG_TINT[v].label}
                    <Box component="span" sx={{ fontVariantNumeric: "tabular-nums", opacity: 0.65 }}>
                      {priorityCounts[v]}
                    </Box>
                  </>
                ),
              }))}
            />
            <TextField
              placeholder="Search headline, area, category"
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
              sx={{ flex: { xs: 1, sm: "none" }, minWidth: 0, width: { sm: 240 }, "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem", height: CONTROL_HEIGHT } }}
            />
            <QueueFiltersButton filters={filters} onChange={setFilters} categories={categoriesInQueue} districts={districtsInQueue} live={!!desk} />
          </Box>
        )}
      </Box>

      {/* Queue */}
      {tab === "queue" && (
        <>
          <ActiveFilterChips filters={filters} onChange={setFilters} live={!!desk} />
          <Box ref={listRef} onPointerEnter={() => setPointerInList(true)} onPointerLeave={() => setPointerInList(false)} sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <NewStoriesPill count={arrived.length} onShow={showArrived} top={12} />
          {desk && !desk.inbox.data ? (
            desk.inbox.error ? <LoadError error={desk.inbox.error} onRetry={() => void desk.inbox.refresh()} /> : <LoadingRows rows={3} height={120} />
          ) : visible.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px" }}>
              <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600 }}>{queue.length === 0 ? "All drafts cleared" : "No stories match these filters"}</Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>
                {queue.length === 0 ? "New breaking stories appear here as the FTP is checked automatically." : "Clear the search or the filters to see more."}
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
                canReject,
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
              return viewMode === "list" ? <QueueTable {...props} highlightIds={highlight} /> : <QueueCards {...props} highlightIds={highlight} />;
            })()
          )}
          </Box>
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", display: { xs: "none", md: "block" } }}>
            Keyboard: J / K to move, Enter or E to open, R to reject.
          </Typography>
        </>
      )}

      {tab === "scheduled" && (desk ? <LiveSendingList /> : <ScheduledList platform={platform} onEdit={openStory} />)}
      {tab === "published" && <PostedPostsList platform={platform} allowRecall emptyHint={`No posts on ${meta.short} yet. Approved stories land here with their link.`} />}
      {tab === "templates" &&
        (desk ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <CardBackgroundPanel />
            <EmptyState title="Hashtag rules and handles live on the server" hint="The live desk suggests hashtags and @handles from the Socia library. Editing that library from this screen is not wired up yet." />
          </Box>
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
              void desk.rejectFromQueue(id, reason, note).then((error) => setNotice(error ?? rejectedNotice(headline)));
              return;
            }
            const saved = draftFor(rejecting.id);
            rejectDraft(saved?.status === "saved" ? draftToPayload(saved) : quickPayload(rejecting), reason, note);
            setNotice(rejectedNotice(rejecting.headline));
            setRejecting(null);
          }}
        />
      )}

      <UndoToast />
      <Snackbar
        open={!!notice}
        autoHideDuration={isRejectedNotice(notice) ? 6000 : 3500}
        onClose={() => setNotice("")}
        message={notice}
        action={
          isRejectedNotice(notice) ? (
            <Button component={Link} href={REJECTED_NEWS_PATH} size="small" sx={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>
              Open Rejected news
            </Button>
          ) : undefined
        }
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
