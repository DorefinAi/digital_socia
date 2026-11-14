"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, Button, IconButton, Tooltip, Typography, TextField, InputAdornment, Snackbar, Popover } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import ResponsiveTabs from "@/components/Layout/ResponsiveTabs";
import { Search, LayoutGrid, List, Keyboard, RefreshCw } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { BreakingTag, FtpNewsItem, PostPayload, SocialPlatform } from "@/types/newsroom";
import { usePermissions } from "@/lib/access/usePermissions";
import { DAILY_CAP, draftToPayload, isLiveOn } from "@/data/socialDesk";
import PostEditor from "./PostEditor";
import PostedPostsList from "./PostedPostsList";
import { RejectDialog } from "./actionDialogs";
import { ScheduledList } from "./DraftLists";
import UndoToast from "./UndoToast";
import RejectedNews from "../RejectedNews";
import { countMedia, QueueCards, QueueTable } from "./QueueViews";
import NewStoriesPill from "./NewStoriesPill";
import { CONTROL_HEIGHT, EmptyState, isRejectedNotice, PLATFORM_META, PlatformIcon, rejectedNotice, SegmentedControl, storyCategory, storyTag, TAG_TINT } from "./shared";
import { activeFilterCount, type FilterFacts, matchesOtherFilters, matchesPriority, phase1Filters, QueueFiltersButton, type QueueFilterState, readQueueFilters, saveQueueFilters, sortStories, toQueueQuery } from "./QueueFilters";
import { Phase1PostedList, Phase1QueueList } from "./phase1/Phase1Queue";
import SourceStatus from "./phase1/SourceStatus";
import * as socia from "@/lib/socia/api";
import { stableQueueToNews } from "./live/LiveDesk";
import { phase1RowId } from "./phase1/Phase1Queue";
import { readPrefill, type TrendPrefill } from "@/lib/trendPrefill";
import { REJECTED_NEWS_PERMISSION } from "@/lib/rejectedNews";
import { LiveSendingList } from "./DraftLists";
import LiveEditor from "./live/LiveEditor";
import { abandonCorrection, beginCorrection } from "./live/beginCorrection";
import { runEditFlow } from "./live/correction";
import { isLiveItem, useLiveDesk } from "./live/LiveDesk";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { useTabBusy } from "@/lib/browserTidy";
import { eventKey, keyLabel, keysById, QUEUE_KEYS, queueHint, queueKeyFor } from "./editorKeys";
import { QueueShortcutsSheet } from "./EditorShortcutsSheet";
import { useKeyBindings } from "./keyBindings";
import { dayChipLabel, dayPriorityCounts, isDayKey, istDay, priorityCounts } from "./deskRules";
import VolumeStrip, { VOLUME_STRIP_HEIGHT } from "./VolumeStrip";
import DayCalendar from "./DayCalendar";

type ConsoleTab = "queue" | "scheduled" | "published" | "rejected";
/** The templates live on their own page now: Post Studio → Templates */
const TEMPLATES_PATH = "/ai-content/templates";


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

/** A priority choice: the tag's colour dot (yellow BIG Breaking, pink Breaking), its name and count */
/** `more`: the day was read only up to the page cap, so the count is a floor ("2000+") */
function PriorityLabel({ value, count, more = false }: { value: "all" | BreakingTag; count?: number; more?: boolean }) {
  return (
    <>
      {value !== "all" && <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, backgroundColor: `rgb(${TAG_TINT[value].rgb})`, boxShadow: "0 0 0 1px rgba(0,0,0,0.18)" }} />}
      {value === "all" ? "All" : TAG_TINT[value].label}
      {typeof count === "number" && (
        <Box component="span" sx={{ fontVariantNumeric: "tabular-nums", opacity: 0.65 }}>
          {more ? `${count}+` : count}
        </Box>
      )}
    </>
  );
}

// Arrow keys belong to these widgets (tabs, menus, segmented controls) when they hold focus
const ARROW_OWNERS = "[role='tablist'], [role='menu'], [role='menubar'], [role='radiogroup'], [role='slider'], [role='combobox'], select";

const spin = keyframes`to { transform: rotate(360deg); }`;
// The refresh icon turns while a refresh runs; still for people who ask for less motion
const spinSx = { animation: `${spin} 0.9s linear infinite`, "@media (prefers-reduced-motion: reduce)": { animation: "none" } } as const;
// The date chip's green dot while today is shown: a slow blink, steady for anyone who asks for less motion
const blink = keyframes`50% { opacity: 0.25; }`;
const todayDotSx = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  flexShrink: 0,
  mr: 0.75,
  bgcolor: "success.main",
  animation: `${blink} 1.4s ease-in-out infinite`,
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
} as const;

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
  // Phase 1 (set on the server): breaking files as ready posts, Copy & Mark Posted, nothing sent through the X API
  const p1 = !!desk?.phase1;
  const otherPlatforms = (["X (Twitter)", "Instagram", "Facebook"] as SocialPlatform[]).filter((p) => p !== platform);

  // ?tab= opens a tab; an old ?tab=templates link goes to Post Studio → Templates, where the templates live now
  const initialTab = useSearchParams().get("tab");
  const router = useRouter();
  // The templates there are the X desk's; another desk just drops the old tab from its address
  useEffect(() => {
    if (initialTab === "templates") router.replace(platform === "X (Twitter)" ? TEMPLATES_PATH : window.location.pathname);
  }, [initialTab, router, platform]);
  const [tabState, setTab] = useState<ConsoleTab>(() => (initialTab === "published" || initialTab === "scheduled" || initialTab === "rejected" ? initialTab : "queue"));
  // Phase 1 has no Sending tab (nothing is sent through the X API)
  // Rejected needs page.rejected_news (the same as the Rejected news page)
  const canSeeRejected = can(REJECTED_NEWS_PERMISSION);
  const tab: ConsoleTab = (p1 && tabState === "scheduled") || (tabState === "rejected" && !canSeeRejected) ? "queue" : tabState;
  // The saved view is applied after mount: the page is prerendered, and reading storage while rendering would not match the server's HTML
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewMode(readView());
  }, []);
  const changeView = (next: "cards" | "list") => {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };
  // More filters (Filters button), remembered in this browser
  const [savedFilters, setFiltersState] = useState<QueueFilterState>(readQueueFilters);
  // Phase 1 reads them through phase1Filters: priority is the All / Big breaking / Breaking tabs (an old
  // BIG-only choice becomes Big breaking) and a remembered desk code is dropped, as that filter is gone
  const filters = useMemo(() => (p1 ? phase1Filters(savedFilters) : savedFilters), [p1, savedFilters]);
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
  // Date filter (phase 1): one IST day, today by default. null = today, so the desk rolls over at midnight IST
  // on its own; a picked day that is not a real day, or is later than today, falls back to today.
  const [pickedDay, setDay] = useState<string | null>(null);
  const today = istDay(now) ?? "";
  const day = pickedDay && isDayKey(pickedDay) && pickedDay <= today ? pickedDay : today;
  const pastDay = p1 && day !== today;
  // Phase 1: district, priority (BIG or not), UPDATE, needs-check and the day are applied by the server
  const serverQuery = JSON.stringify({ ...toQueueQuery(filters), ...(day ? { day } : {}) });
  const setQueueQuery = desk?.setQueueQuery;
  useEffect(() => {
    if (p1 && setQueueQuery) setQueueQuery(JSON.parse(serverQuery));
  }, [p1, serverQuery, setQueueQuery]);
  const [query, setQuery] = useState("");
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);
  // Today leaves the page when pressed, so focus goes to the date chip rather than to the page's start
  const dateChipRef = useRef<HTMLButtonElement>(null);
  const backToToday = () => {
    setDay(null);
    requestAnimationFrame(() => dateChipRef.current?.focus());
  };
  const [notice, setNotice] = useState("");
  // Last time the queue answered, and a manual refresh
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inboxAnswer = desk?.inbox.data;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (inboxAnswer) setUpdatedAt(Date.now());
  }, [inboxAnswer]);
  // "Updated" moves only when the queue really answered; a failed refresh says so and keeps the last time
  const refreshStrict = desk?.refreshStrict;
  const scanNow = desk?.scanNow;
  const refreshNow = useCallback(async () => {
    if (!refreshStrict || refreshing) return;
    setRefreshing(true);
    try {
      // The worker reads the share now too (new stories show within a few seconds), then the lists refresh
      await scanNow?.();
      await refreshStrict();
      setUpdatedAt(Date.now());
    } catch (err) {
      setNotice(`Couldn't refresh the queue: ${err instanceof Error && err.message ? err.message : "the server didn't answer"}`);
    } finally {
      setRefreshing(false);
    }
  }, [refreshStrict, scanNow, refreshing, setNotice]);
  const updatedLabel = updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Updating";
  const [keysOpen, setKeysOpen] = useState(false);
  // Links into the editor: ?story=<linkSlug> (readable, resolved to a draft below) or the older ?compose=<news id>
  const searchParams = useSearchParams();
  const composeId = searchParams.get("compose");
  const storyParam = searchParams.get("story");
  // The Web Scraper's "Create draft for…" opens platforms without a Socia backend on a trend (?prefill=)
  const prefill = readPrefill(searchParams);
  const [composing, setComposing] = useState<FtpNewsItem | null>(() => {
    // Live: the editor loads the draft by id, so the link can open it before the queue has loaded
    if (desk) return canAct && composeId ? ({ id: composeId } as FtpNewsItem) : null;
    if (!can("draft.edit")) return null;
    if (prefill) return trendToNews(prefill);
    return ftpNews.find((n) => n.id === composeId) || null;
  });
  // An open editor holds back the nightly reload (lib/browserTidy)
  useTabBusy(!!composing);
  // A ?story= link still being matched to its draft (live desk only), and whether the server could not match it
  const [storyLink, setStoryLink] = useState<string | null>(() => (desk && canAct && !composeId ? storyParam : null));
  const [storyLookupFailed, setStoryLookupFailed] = useState(false);
  useEffect(() => {
    if (!storyLink) return;
    let gone = false;
    socia.resolveStory(storyLink).then(
      ({ id }) => {
        if (gone) return;
        setStoryLink(null);
        setComposing((c) => c ?? ({ id } as FtpNewsItem));
      },
      // 404, or an older server without /drafts/resolve: the loaded lists may still hold it (checked while rendering)
      () => {
        if (!gone) setStoryLookupFailed(true);
      },
    );
    return () => {
      gone = true;
    };
  }, [storyLink]);
  // Link names the editor learnt from the drafts it opened (a story not in the loaded lists)
  const [learntSlugs, setLearntSlugs] = useState<Record<string, string>>({});
  const onLinkSlug = useCallback((id: string, slug: string) => setLearntSlugs((m) => (m[id] === slug ? m : { ...m, [id]: slug })), []);
  const [rejecting, setRejecting] = useState<FtpNewsItem | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  // Stories the operator has already seen; new arrivals wait behind the "new stories" pill so the list never moves under the cursor
  const [seenUntil, setSeenUntil] = useState(() => Date.now());
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

  const drafts = useMemo(() => socialDrafts.filter((d) => d.platform === platform), [socialDrafts, platform]);
  const draftFor = useCallback((newsId: string) => drafts.find((d) => d.newsId === newsId), [drafts]);

  // The queue holds every story not yet live here, not waiting to post, and not scheduled, rejected or dismissed
  const deskQueue = desk?.queue;
  const deskPending = desk?.pending;
  const queue: FtpNewsItem[] = useMemo(() => {
    if (deskQueue) return deskQueue.filter((n) => !deskPending?.some((p) => p.draftId === n.id && !p.outcome));
    const pendingHere = new Set(pendingPosts.filter((p) => p.payload.platform === platform && !p.post).map((p) => p.payload.newsId));
    return ftpNews.filter((n) => {
      const status = draftFor(n.id)?.status;
      return !isLiveOn(socialPosts, n.id, platform) && !pendingHere.has(n.id) && (!status || status === "saved");
    });
  }, [deskQueue, deskPending, ftpNews, draftFor, socialPosts, pendingPosts, platform]);
  const facts: FilterFacts = useMemo(
    () => ({
      media: countMedia,
      status: (n) => {
        if (isLiveItem(n)) return n.live.claim ? (n.live.claim.mine ? "mine" : "held") : "new";
        return draftFor(n.id)?.status === "saved" ? "mine" : "new";
      },
    }),
    [draftFor],
  );
  const q = query.trim().toLowerCase();
  const matchesSearchAndFilters = useCallback(
    (n: FtpNewsItem) =>
      (!q || [n.headline, n.shortText, n.area, n.ftpPath, storyCategory(n) ?? "", (isLiveItem(n) && n.live.postText) || ""].some((field) => field.toLowerCase().includes(q))) &&
      matchesOtherFilters(n, filters, facts, now),
    [q, filters, facts, now],
  );
  // Each story's IST day, worked out once per story object (unchanged stories keep their objects across polls)
  const [dayOf] = useState(() => new WeakMap<FtpNewsItem, string | null>());
  const storyDay = useCallback(
    (n: FtpNewsItem) => {
      if (!dayOf.has(n)) dayOf.set(n, istDay(n.receivedAt));
      return dayOf.get(n) ?? null;
    },
    [dayOf],
  );
  // Live drafts count as new from when the server made them (a story can be filed long before it is approved);
  // a story without a readable time counts as seen, so it can never hold the pill (or seenUntil) open
  const stampOfItem = useCallback((n: FtpNewsItem) => new Date(isLiveItem(n) ? (n.live.createdAt ?? n.receivedAt) : n.receivedAt).getTime(), []);
  const seenBy = useCallback(
    (n: FtpNewsItem) => {
      const t = stampOfItem(n);
      return !Number.isFinite(t) || t <= seenUntil;
    },
    [stampOfItem, seenUntil],
  );
  // Seen stories on the shown day matching the search and every filter but priority; the priority switch counts within these.
  // The server already sends only that day (?day=); checking it here too keeps an older server's answer to one day.
  const matching = useMemo(
    () => queue.filter((n) => seenBy(n) && (!p1 || storyDay(n) === day) && matchesSearchAndFilters(n)),
    [queue, seenBy, p1, day, storyDay, matchesSearchAndFilters],
  );
  // New stories waiting behind the pill: today's, also while an earlier day is shown (the desk watches today then)
  const todayQueue = desk?.todayQueue;
  const arrivalsFrom = useMemo(() => (pastDay ? (todayQueue ?? []) : queue), [pastDay, todayQueue, queue]);
  const unseen = useMemo(() => arrivalsFrom.filter((n) => !seenBy(n)), [arrivalsFrom, seenBy]);
  const arrived = useMemo(
    () => unseen.filter((n) => (!p1 || storyDay(n) === today) && matchesSearchAndFilters(n) && matchesPriority(n, filters.priority)),
    [unseen, p1, storyDay, today, matchesSearchAndFilters, filters.priority],
  );
  // The newest waiting story's time (unreadable times count as seen, so this stays finite)
  const latestUnseen = unseen.reduce((latest, n) => Math.max(latest, stampOfItem(n)), seenUntil);
  const highlight: ReadonlySet<string> = useMemo(
    () =>
      new Set(
        flash
          ? queue
              .filter((n) => {
                const t = stampOfItem(n);
                return t > flash.from && t <= flash.to;
              })
              .map((n) => n.id)
          : [],
      ),
    [flash, queue, stampOfItem],
  );
  /** Merges the waiting stories into the list (highlighted for a moment). */
  const mergeArrived = () => revealUntil(latestUnseen);
  /** The pill: back to today if an earlier day is shown, merge, then bring the top of the list into view. */
  const showArrived = () => {
    if (pastDay) setDay(null);
    mergeArrived();
    if (!listRef.current) return;
    const y = listRef.current.getBoundingClientRect().top + window.scrollY - 16;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: "smooth" });
  };
  // At the top and not pointing at the list: nothing moves under the operator, so merge straight away.
  // Guarded so it runs once per arrival: after it, latestUnseen equals seenUntil and nothing is waiting.
  // Not while an earlier day is shown: today's arrivals wait behind the pill until the operator goes back.
  if (tab === "queue" && !pastDay && arrived.length > 0 && latestUnseen > seenUntil && atTop && !pointerInList && !composing) mergeArrived();
  const visible = useMemo(() => sortStories(matching.filter((n) => matchesPriority(n, filters.priority)), filters.sort), [matching, filters.priority, filters.sort]);
  const narrowed = !!q || activeFilterCount(filters) > 0;
  // The priority tabs mirror a single-priority choice made in Filters (phase 1 has no priority in Filters)
  const quickPriority: "all" | BreakingTag | null = !filters.priority.length ? "all" : filters.priority.length === 1 && filters.priority[0] !== "normal" ? filters.priority[0] : null;
  // Phase 1 queue: the date box's whole day (every page, stories waiting behind the pill too), so the numbers
  // are the day's: the priority switch, the search and the filters narrow only the list. Posted: today's, from
  // the facets. Phase 2: the stories the search and filters leave, as before.
  const tabFacets = p1 && tab === "published" ? desk?.facets.posted.data : null;
  const shownCounts = useMemo(() => (p1 ? dayPriorityCounts(queue, day, storyDay, storyTag) : priorityCounts(matching, storyTag)), [p1, queue, day, storyDay, matching]);
  const countsCut = p1 && tab === "queue" && !!desk?.inbox.data?.truncated;
  const tabCounts: Record<"all" | BreakingTag, number | undefined> = !p1
    ? shownCounts
    : tab === "published"
      ? { all: tabFacets?.total, big_breaking: tabFacets?.big, breaking: tabFacets ? Math.max(0, tabFacets.total - tabFacets.big) : undefined }
      : desk?.inbox.data
        ? shownCounts
        : { all: undefined, big_breaking: undefined, breaking: undefined };
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

  // Queue shortcuts (editorKeys.QUEUE_KEYS, or the person's own from their profile): J/K move (phase 1 also the
  // up and down arrows), Enter or E opens, R rejects
  useKeyBindings();
  useEffect(() => {
    if (tab !== "queue" || composing || rejecting) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Not while typing, and not behind a dialog, popover or menu (the date picker, Filters): its keys are its own
      if (e.isComposing || target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu'], .MuiPopover-root")) return;
      if (document.querySelector(".MuiPopover-root, .MuiDialog-root")) return;
      const cmd = queueKeyFor(e, p1);
      if (!cmd) return;
      if (cmd.id === "queue.search") {
        e.preventDefault();
        document.getElementById("desk-search")?.focus();
        return;
      }
      if (cmd.id === "queue.help") {
        e.preventDefault();
        setKeysOpen(true);
        return;
      }
      if (cmd.id === "queue.clear") {
        setQuery("");
        return;
      }
      const combo = eventKey(e);
      // Enter or Space on a focused button or link (the new-stories pill, card actions) presses that control instead
      if ((combo === "enter" || combo === "space" || combo === "shift+enter") && target.closest("button, a, [role='button']")) return;
      // Arrow keys belong to the focused tabs, menus and segmented controls
      if (/arrow/.test(combo) && target.closest(ARROW_OWNERS)) return;
      if (cmd.id === "queue.next" || cmd.id === "queue.prev") {
        e.preventDefault();
        if (!visible.length) return;
        const next = Math.max(0, Math.min(visible.length - 1, Math.min(focusIndex, visible.length - 1) + (cmd.id === "queue.next" ? 1 : -1)));
        setFocusIndex(next);
        // Phase 1: keep the selected row in view, and move keyboard focus with it when a row holds focus
        const row = p1 ? document.getElementById(phase1RowId(visible[next].id)) : null;
        if (row) {
          if (target.getAttribute("role") === "option") row.focus({ preventScroll: true });
          row.scrollIntoView({ block: "nearest" });
        }
      } else if (cmd.id === "queue.open" && focused && canAct) {
        e.preventDefault();
        setComposing(focused);
      } else if (cmd.id === "queue.reject" && focused && canReject && !(isLiveItem(focused) && focused.live.claim && !focused.live.claim.mine)) {
        e.preventDefault();
        setRejecting(focused);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, composing, rejecting, visible, focusIndex, focused, canAct, canReject, p1]);


  // Phase 1: when the editor closes, focus goes back to the queue: the story's row if it is still there,
  // else the row now in its place (the next story after a Copy & Mark Posted), else the list's tab
  const returnFocus = useRef<{ id: string; index: number } | null>(null);
  // A fix of a posted story ends on New ("queue"), not on the tab it was opened from; focus then takes New's first row
  const closeEditor = (returnTo?: "queue") => {
    if (p1 && composing) returnFocus.current = { id: composing.id, index: returnTo ? 0 : Math.max(0, visible.findIndex((n) => n.id === composing.id)) };
    if (returnTo) setTab(returnTo);
    setComposing(null);
  };
  const visibleIds = visible.map((n) => n.id).join(",");
  useEffect(() => {
    const target = returnFocus.current;
    if (!p1 || composing || !target) return;
    // Wait a frame so the dialog has released focus
    const raf = requestAnimationFrame(() => {
      const ids = visibleIds ? visibleIds.split(",") : [];
      const stillThere = ids.indexOf(target.id);
      const index = stillThere >= 0 && !desk?.pending.some((x) => x.copied && x.draftId === target.id) ? stillThere : Math.min(target.index, ids.length - 1);
      const id = ids.filter((x) => !desk?.pending.some((pp) => pp.copied && pp.draftId === x))[index] ?? ids[index];
      const el = id ? document.getElementById(phase1RowId(id)) : null;
      if (el) {
        setFocusIndex(ids.indexOf(id));
        el.focus();
      } else document.querySelector<HTMLElement>("[role=tab][aria-selected=true]")?.focus();
      returnFocus.current = null;
    });
    return () => cancelAnimationFrame(raf);
  }, [p1, composing, visibleIds, desk?.pending]);

  /** Edit on a Posted row: hold the posted story for a fix, then open it in the editor (it stays posted). No story is open here. */
  const editPosted = async (n: FtpNewsItem) => {
    const error = await runEditFlow({
      leave: async () => true,
      start: () => beginCorrection(n.id),
      open: () => setComposing(n),
      abandon: () => abandonCorrection(n.id),
    });
    if (error) setNotice(error);
  };

  const openStory = (newsId: string) => {
    const item = ftpNews.find((n) => n.id === newsId);
    if (item) setComposing(item);
  };

  const facetsInbox = desk?.facets.inbox.data ?? null;
  const inboxToday = facetsInbox?.today ?? null;
  const facetsPosted = desk?.facets.posted.data ?? null;
  const stats = p1
    ? [
        // Today's stories (IST) from the facets; the whole view on an older server, the loaded page as a last fallback
        { label: "To post", value: inboxToday?.total ?? facetsInbox?.total ?? queue.length, tone: "text.secondary" },
        { label: "Needs check", value: inboxToday?.needsCheck ?? facetsInbox?.needsCheck ?? 0, tone: (inboxToday?.needsCheck ?? facetsInbox?.needsCheck ?? 0) > 0 ? "warning.main" : "text.primary" },
        { label: "Posted today", value: publishedToday, tone: "success.main" },
      ]
    : [
        { label: "To post", value: queue.length, tone: "text.secondary" },
        { label: desk ? "Sending" : "Scheduled", value: scheduledCount, tone: "text.primary" },
        { label: "Published today", value: publishedToday, tone: "success.main" },
      ];

  // Phase 1 Posted tab: drafts marked with Copy & Mark Posted, filtered like the queue
  const postedData = desk?.postedView.data;
  // Mapped once per answer; unchanged stories keep their objects, so the rows skip re-rendering
  const postedNews = useMemo(() => (p1 ? (postedData?.items ?? []).map(stableQueueToNews) : []), [p1, postedData]);
  // The priority switch narrows Posted too (the server no longer does), and its "Posted today (N)" follows
  const postedItems = postedNews.filter((n) => matchesSearchAndFilters(n) && matchesPriority(n, filters.priority));
  const postedTotal = facetsPosted?.total ?? desk?.postedView.data?.items.length ?? 0;
  const p1Narrowed = activeFilterCount(filters) > 0 || !!q;

  // ?story=<linkSlug>: the loaded queue and Posted list first; failing those, /drafts/resolve (the effect above).
  // Matched while rendering (as mergeArrived does) so a link to a loaded story opens without a round trip.
  if (storyLink && desk) {
    const hit = desk.queue.find((n) => n.live.linkSlug === storyLink) ?? postedNews.find((n) => n.live.linkSlug === storyLink);
    if (hit) {
      setStoryLink(null);
      setComposing(hit);
    } else if (storyLookupFailed && desk.inbox.data) {
      setStoryLink(null);
      setStoryLookupFailed(false);
      setNotice("That story link didn't match a story on the desk. It may have been posted, rejected or removed.");
    }
  }
  // The open story's readable link name: from its row, from the draft the editor loaded, else from the loaded lists
  const composingId = composing?.id ?? null;
  const composingSlug = composing
    ? ((isLiveItem(composing) ? composing.live.linkSlug : undefined) ?? learntSlugs[composing.id] ?? desk?.queue.find((n) => n.id === composing.id)?.live.linkSlug ?? postedNews.find((n) => n.id === composing.id)?.live.linkSlug)
    : undefined;
  // The address bar follows the editor: ?story=<linkSlug> while a story is open (?compose=<id> on an older server
  // without slugs), nothing once it closes. Left alone until the editor has opened, so a link is never stripped early.
  const liveDesk = !!desk;
  const urlOwned = useRef(false);
  useEffect(() => {
    if (!liveDesk || storyLink) return;
    if (composingId) urlOwned.current = true;
    if (!urlOwned.current) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("compose");
    url.searchParams.delete("story");
    if (composingId) url.searchParams.set(composingSlug ? "story" : "compose", composingSlug ?? composingId);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
  }, [liveDesk, storyLink, composingId, composingSlug]);

  // Until /me has said which phase this is, show neither desk (phase 2 must not flash on a phase 1 desk)
  if (desk && !desk.phaseKnown) {
    return (
      <Box sx={{ mt: 2 }} role="status" aria-label="Loading the desk">
        <LoadingRows rows={4} height={96} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Volume today: a thin strip that stays at the top while scrolling */}
      <VolumeStrip name={meta.short} used={capUsed} cap={cap} />
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PlatformIcon platform={platform} size={16} />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              {p1 ? "Post Draft" : `${meta.short} draft console`}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
            {p1
              ? "This dashboard is linked with FTP. Click on Open, check the content and click on \"Copy & Mark Posted\"."
              : `Stories tagged Breaking or BIG Breaking on the FTP, ready for the @${meta.handle} template.`}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", minWidth: 0 }}>
          {p1 && <SourceStatus />}
          {!p1 && (
          <SegmentedControl
            ariaLabel="Queue view"
            value={viewMode}
            onChange={changeView}
            options={[
              { value: "cards", label: (<><LayoutGrid size={14} /> Cards</>) },
              { value: "list", label: (<><List size={14} /> List</>) },
            ]}
          />
          )}
          {p1 && (
            <Tooltip title={keysById(QUEUE_KEYS, "queue.help").length ? `Shortcuts (${keyLabel(keysById(QUEUE_KEYS, "queue.help")[0])})` : "Shortcuts"}>
              <IconButton size="small" onClick={() => setKeysOpen(true)} aria-label="Shortcuts" sx={{ color: "text.secondary" }}>
                <Keyboard size={16} />
              </IconButton>
            </Tooltip>
          )}
          {desk && (
            <Tooltip title="Check for new stories now (F5)">
              <Box
                component="button"
                type="button"
                onClick={() => void refreshNow()}
                aria-label={`${updatedLabel}. Refresh now`}
                aria-busy={refreshing}
                sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, border: 0, background: "none", p: 0.5, minHeight: 32, cursor: "pointer", color: "text.secondary", fontSize: "0.6875rem", fontFamily: "inherit", "&:hover": { color: "text.primary" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: "4px" } }}
              >
                <Box component="span" aria-hidden sx={{ display: "inline-flex", ...(refreshing ? spinSx : {}) }}>
                  <RefreshCw size={12} />
                </Box>
                {updatedLabel}
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Today */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.5 }}>
        {stats.map((s) => (
          <Box key={s.label} sx={tileSx}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{s.label}</Typography>
            <Typography sx={{ fontSize: "1.375rem", fontWeight: 700, color: s.tone, fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}>{s.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* Tabs + filters */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderBottom: "1px solid", borderColor: "divider" }}>
        <ResponsiveTabs<ConsoleTab>
          value={tab}
          onChange={setTab}
          ariaLabel="Draft console sections"
          items={
            p1
              ? [
                  { value: "queue", label: `New (${p1Narrowed || pastDay ? visible.length : inboxToday?.total ?? facetsInbox?.total ?? queue.length})` },
                  { value: "published", label: `Posted today (${p1Narrowed ? postedItems.length : postedTotal})` },
                  ...(canSeeRejected ? [{ value: "rejected" as const, label: "Rejected" }] : []),
                ]
              : [
                  { value: "queue", label: narrowed ? `Queue (${visible.length} of ${queue.length})` : `Queue (${queue.length})` },
                  { value: "scheduled", label: `${desk ? "Sending" : "Scheduled"} (${scheduledCount})` },
                  { value: "published", label: `Published (${publishedCount})` },
                  ...(canSeeRejected ? [{ value: "rejected" as const, label: "Rejected" }] : []),
                ]
          }
          tabsSx={{ minHeight: 40, maxWidth: "100%", "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", px: 1.5, minWidth: 0 } }}
        />
        {(tab === "queue" || (p1 && tab === "published")) && (
          // One line from sm up: the search keeps one width (it no longer grows on focus) and Today takes no room
          // until an earlier day is picked, so nothing drops below
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: { xs: 0, sm: "auto" }, width: { xs: "100%", sm: "auto" }, minWidth: 0, pb: 0.75, flexWrap: { xs: "wrap", sm: "nowrap" } }}>
            <SegmentedControl<"all" | BreakingTag>
              ariaLabel="Filter by priority"
              value={quickPriority}
              onChange={(v) => setFilters({ ...filters, priority: v === "all" ? [] : [v] })}
              options={(["all", "big_breaking", "breaking"] as const).map((v) => ({ value: v, label: <PriorityLabel value={v} count={tabCounts[v]} more={countsCut} /> }))}
            />
            <TextField
              placeholder={p1 ? "Search" : "Search headline, area, category"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Esc empties the search, then leaves the box
                if (e.key !== "Escape") return;
                if (query) setQuery("");
                else (e.target as HTMLElement).blur();
              }}
              size="small"
              id="desk-search"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={15} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ flex: { xs: "1 1 160px", sm: "0 1 180px" }, minWidth: { xs: 0, sm: 112 }, "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem", height: CONTROL_HEIGHT } }}
            />
            {p1 && tab === "queue" && (
              <Box sx={{ position: "relative", flexShrink: 0 }}>
                <Button
                  size="small"
                  variant="outlined"
                  ref={dateChipRef}
                  onClick={(e) => setDateAnchor(e.currentTarget)}
                  aria-label={`${pastDay ? "" : "Today, "}${dayChipLabel(day)}, pick a day`}
                  aria-haspopup="dialog"
                  aria-expanded={!!dateAnchor}
                  sx={{ height: CONTROL_HEIGHT, borderRadius: "8px", textTransform: "none", fontWeight: 600, fontSize: "0.8125rem", borderColor: "divider", color: "text.primary", whiteSpace: "nowrap", px: 1.25 }}
                >
                  {!pastDay && <Box component="span" aria-hidden sx={todayDotSx} />}
                  {dayChipLabel(day)}
                </Button>
                <Popover open={!!dateAnchor} anchorEl={dateAnchor} onClose={() => setDateAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} slotProps={{ paper: { sx: { borderRadius: "10px", mt: 0.5 } } }}>
                  <DayCalendar value={day} today={today} onPick={(d) => { setDay(d === today ? null : d); setDateAnchor(null); }} />
                </Popover>
              </Box>
            )}
            {p1 && tab === "queue" && pastDay && (
              <Button size="small" onClick={backToToday} sx={{ height: CONTROL_HEIGHT, minWidth: 56, flexShrink: 0, textTransform: "none", fontWeight: 600 }}>
                Today
              </Button>
            )}
            <QueueFiltersButton
              filters={filters}
              onChange={setFilters}
              categories={categoriesInQueue}
              districts={districtsInQueue}
              live={!!desk}
              {...(p1 ? { facets: tab === "published" ? facetsPosted : facetsInbox, showStatus: false } : {})}
            />
          </Box>
        )}
      </Box>

      {/* Queue */}
      {tab === "queue" && (
        <>
          <Box ref={listRef} onPointerEnter={() => setPointerInList(true)} onPointerLeave={() => setPointerInList(false)} sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <NewStoriesPill count={arrived.length} onShow={showArrived} top={VOLUME_STRIP_HEIGHT + 10} noun={p1 ? ["post", "posts"] : undefined} />
          {desk && !desk.inbox.data ? (
            desk.inbox.error ? <LoadError error={desk.inbox.error} onRetry={() => void desk.inbox.refresh()} /> : <LoadingRows rows={3} height={120} />
          ) : visible.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px" }}>
              <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600 }}>
                {p1
                  ? p1Narrowed
                    ? "No posts match these filters"
                    : pastDay
                      ? `No stories waiting from ${dayChipLabel(day)}`
                      : "Nothing waiting to post"
                  : queue.length === 0
                    ? "All drafts cleared"
                    : "No stories match these filters"}
              </Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>
                {p1
                  ? p1Narrowed
                    ? "Clear the search or the filters to see more."
                    : pastDay
                      ? "Pick another day, or press Today."
                      : "New breaking files show up here within seconds of landing on the share."
                  : queue.length === 0
                    ? "New breaking stories appear here as the FTP is checked automatically."
                    : "Clear the search or the filters to see more."}
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
              if (p1) return <Phase1QueueList {...props} highlightIds={highlight} now={now} />;
              return viewMode === "list" ? <QueueTable {...props} highlightIds={highlight} /> : <QueueCards {...props} highlightIds={highlight} />;
            })()
          )}
          </Box>
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", display: { xs: "none", md: "block" } }}>
            {queueHint(p1)}
          </Typography>
        </>
      )}

      {tab === "scheduled" && (desk ? <LiveSendingList /> : <ScheduledList platform={platform} onEdit={openStory} />)}
      {tab === "published" && p1 && desk && (
        <>
          {!desk.postedView.data ? (
            desk.postedView.error ? <LoadError error={desk.postedView.error} onRetry={() => void desk.postedView.refresh()} /> : <LoadingRows rows={3} height={96} />
          ) : postedItems.length === 0 ? (
            <EmptyState
              title={p1Narrowed ? "No posts match these filters" : "Nothing posted today yet"}
              hint={p1Narrowed ? "Clear the search or the filters to see more." : "Today's posts land here when someone presses Copy & Mark Posted."}
            />
          ) : (
            <Phase1PostedList items={sortStories(postedItems, filters.sort)} onNotice={setNotice} onEdit={editPosted} />
          )}
        </>
      )}
      {tab === "rejected" && <RejectedNews platform={platform} />}
      {tab === "published" && !p1 && <PostedPostsList platform={platform} allowRecall emptyHint={`No posts on ${meta.short} yet. Approved stories land here with their link.`} />}
      {composing &&
        (desk ? (
          <LiveEditor queueOrder={visible} item={composing} platform={platform} onClose={closeEditor} onSwitch={setComposing} onSaved={setNotice} onLinkSlug={onLinkSlug} />
        ) : (
          <PostEditor queueOrder={visible} item={composing} platform={platform} onClose={() => setComposing(null)} onSwitch={setComposing} onSaved={setNotice} />
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

      <QueueShortcutsSheet open={keysOpen} onClose={() => setKeysOpen(false)} phase1={p1} />

      <UndoToast keyboardUndo={!composing} />
      <Snackbar
        open={!!notice}
        autoHideDuration={isRejectedNotice(notice) ? 6000 : 3500}
        onClose={() => setNotice("")}
        message={notice}
        action={
          isRejectedNotice(notice) && canSeeRejected ? (
            <Button onClick={() => { setNotice(""); setTab("rejected"); }} size="small" sx={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>
              Open Rejected
            </Button>
          ) : undefined
        }
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
