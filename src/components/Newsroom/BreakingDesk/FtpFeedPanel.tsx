"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, CircularProgress, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import { AlertTriangle, PenLine } from "lucide-react";
import { needsCheckHint, needsCheckLabel, shownNeedsCheck } from "./phase1/badges";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { BreakingTag, FtpNewsItem, SocialPlatform } from "@/types/newsroom";
import { isLiveOn } from "@/data/socialDesk";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { CategoryLabel, srOnly, storyCategory, storyTag, TAG_TINT, tagTint, postedTint, timeAgo } from "./shared";
import { usePermissions } from "@/lib/access/usePermissions";
import { REJECTED_NEWS_PERMISSION } from "@/lib/rejectedNews";
import { isLiveItem, stableQueueToNews, useLiveDesk } from "./live/LiveDesk";
import NewStoriesPill, { freshHighlightSx } from "./NewStoriesPill";
import StoryThumb, { THUMB_ROOT_ATTR } from "./live/StoryThumb";
import { canCorrect, editedLabel, needsCheckDescription } from "./live/correction";
import { RowPresence, RowPresenceSpace } from "./live/Presence";
import { placeLine, reporterWithDistrict } from "./reporterLabel";
import { pattiNumber } from "./deskRules";
import { Search } from "lucide-react";

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  posted: { label: "Posted", color: "success.main" },
  saved: { label: "Draft", color: "text.secondary" },
  scheduled: { label: "Scheduled", color: "info.main" },
  rejected: { label: "Rejected", color: "error.main" },
};

type FeedList = "queue" | "published" | "rejected";
const FEED_TABS: [FeedList, string][] = [
  ["queue", "New"],
  ["rejected", "Rejected"],
];
/** About how wide the needs-check tag is, for the headline's room beside the corner badges */
const CHECK_TAG_W = 28;
const newestFirst = (a: FtpNewsItem, b: FtpNewsItem) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();

/**
 * Live FTP feed beside the editor: the shown day's whole queue, newest first, new arrivals behind their own pill,
 * click to switch story. Its tabs show Posted today and Rejected in place (to read; the story stays open).
 */
export default function FtpFeedPanel({
  platform,
  currentId,
  onPick,
  onEdit,
  editingId = null,
}: {
  platform: SocialPlatform;
  currentId: string;
  onPick: (item: FtpNewsItem) => void;
  /** Posted today: fix a posted story (the row's Edit, shown where the server allows it). It stays posted. */
  onEdit?: (item: FtpNewsItem) => void;
  /** The story whose Edit is starting, so its button shows it is working */
  editingId?: string | null;
}) {
  const { ftpNews, socialPosts, socialDrafts } = useNewsroom();
  const desk = useLiveDesk();
  const { can } = usePermissions();
  const listRef = useRef<HTMLDivElement>(null);
  const tabs = FEED_TABS.filter(([t]) => t !== "rejected" || can(REJECTED_NEWS_PERMISSION));
  const [list, setList] = useState<FeedList>("queue");
  const otherList = desk && list !== "queue" ? (list === "published" ? desk.postedView : desk.rejected) : null;
  const otherItems = useMemo(() => (otherList?.data?.items ?? []).map(stableQueueToNews), [otherList?.data]);
  const [openedAt] = useState(() => Date.now());
  // Live: the stories waiting in the X queue for the shown day, newest first
  const stories: FtpNewsItem[] = desk ? desk.queue : ftpNews;
  // Posted today's stories stay in the list where they were, marked Posted in green (no Posted tab)
  const postedItems = useMemo(() => (desk?.postedView.data?.items ?? []).map(stableQueueToNews), [desk?.postedView.data]);
  const postedIds = useMemo(() => new Set(postedItems.map((n) => n.id)), [postedItems]);
  const sorted = otherList ? otherItems : [...stories, ...postedItems.filter((p) => !stories.some((n) => n.id === p.id))].sort(newestFirst);
  const loading = !!desk && !(otherList ?? desk.inbox).data;

  // Stories that arrive while the feed is open wait behind the "new stories" pill, so the list never jumps
  const [shownState, setShown] = useState<ReadonlySet<string> | null>(null);
  const shown = otherList ? new Set(sorted.map((n) => n.id)) : shownState;
  if (!otherList && shownState === null && !loading) setShown(new Set(sorted.map((n) => n.id)));
  const waiting = shown ? sorted.filter((n) => !shown.has(n.id) && !postedIds.has(n.id) && n.id !== currentId) : [];
  const allListed = shown ? sorted.filter((n) => shown.has(n.id) || postedIds.has(n.id) || n.id === currentId) : sorted;
  // BIG Breaking / Breaking tabs (BIG Breaking first) and a small headline search; the open story always stays listed
  const tabOf = (n: FtpNewsItem): BreakingTag => (storyTag(n) === "big_breaking" ? "big_breaking" : "breaking");
  // The tab follows the open story (Prev/Next, the next story after posting), so it is always listed in its own tab
  const currentItem = sorted.find((n) => n.id === currentId);
  const currentTab = currentItem ? tabOf(currentItem) : null;
  const [tagTab, setTagTab] = useState<BreakingTag>(currentTab ?? "big_breaking");
  const [tabFor, setTabFor] = useState<string | null>(currentTab ? currentId : null);
  if (currentTab && tabFor !== currentId) {
    setTabFor(currentId);
    setTagTab(currentTab);
  }
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  /** Switching tab opens that tab's top story (saved first by the editor's switch); an empty tab switches nothing */
  const chooseTab = (tag: BreakingTag) => {
    setTagTab(tag);
    if (otherList || tag === tagTab) return;
    const top = allListed.find((n) => tabOf(n) === tag);
    if (!top || top.id === currentId) return;
    const live = isLiveItem(top) ? top.live : undefined;
    const fixable = postedIds.has(top.id) && !!onEdit && !!desk?.canAct && canCorrect(live);
    if (fixable) {
      if (!editingId) onEdit?.(top);
    } else onPick(top);
  };
  const listed = allListed.filter((n) => ((!!q || tabOf(n) === tagTab) && (!q || `${n.headline} ${isLiveItem(n) ? n.live.sourcePath ?? "" : ""}`.toLowerCase().includes(q))));
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
      {desk && (
        <Tabs
          value={list}
          onChange={(_, t: FeedList) => setList(t)}
          aria-label="Desk lists"
          variant="scrollable"
          scrollButtons={false}
          sx={{ minHeight: 34, borderBottom: "1px solid", borderColor: "divider", mx: -0.5, "& .MuiTabs-indicator": { backgroundColor: "text.primary" } }}
        >
          {tabs.map(([t, label]) => (
            <Tab
              key={t}
              value={t}
              label={label}
              id={`ftp-feed-tab-${t}`}
              aria-controls="ftp-feed-panel"
              sx={{ minWidth: 0, minHeight: 34, px: 1, py: 0.5, textTransform: "none", fontSize: "0.8125rem", fontWeight: 700, color: "text.secondary", "&.Mui-selected": { color: "text.primary" } }}
            />
          ))}
        </Tabs>
      )}
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h2" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>
            {list === "queue" ? "FTP feed" : list === "published" ? "Posted today" : "Rejected"}
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {loading ? "Loading stories" : `${listed.length} ${listed.length === 1 ? "story" : "stories"}${otherList ? "" : ", newest first"}`}
          </Typography>
        </Box>
        <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 0.5, width: 112, flexShrink: 0, height: 26, px: 0.75, border: "1px solid", borderColor: "divider", borderRadius: "6px", color: "text.secondary", "&:focus-within": { borderColor: "text.primary" } }}>
          <Search size={12} aria-hidden />
          <Box component="input" type="search" value={query} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} placeholder="Search" aria-label="Search stories" sx={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", color: "text.primary", font: "inherit", fontSize: "0.75rem", p: 0 }} />
        </Box>
      </Box>
      <Box role="tablist" aria-label="Story priority" sx={{ display: "flex", gap: 0.75 }}>
        {(Object.keys(TAG_TINT) as BreakingTag[]).map((tag) => {
          const on = tagTab === tag;
          return (
            <Box
              key={tag}
              component="button"
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => chooseTab(tag)}
              sx={{ display: "flex", alignItems: "center", gap: 0.6, px: 1, py: 0.4, borderRadius: "6px", border: "1px solid", borderColor: on ? "text.primary" : "divider", background: (t) => (on ? tagTint(tag, t.palette.mode, 1.6) : "transparent"), color: on ? "text.primary" : "text.secondary", fontFamily: "inherit", fontSize: "0.6875rem", fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" } }}
            >
              <Box sx={{ width: 14, height: 8, borderRadius: "2px", background: (t) => tagTint(tag, t.palette.mode, 1.6) }} />
              {TAG_TINT[tag].label}
            </Box>
          );
        })}
      </Box>
      <Box
        ref={listRef}
        id="ftp-feed-panel"
        role={desk ? "tabpanel" : undefined}
        aria-labelledby={desk ? `ftp-feed-tab-${list}` : undefined}
        {...{ [THUMB_ROOT_ATTR]: "" }}
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
        {desk && !(otherList ?? desk.inbox).data ? (
          (otherList ?? desk.inbox).error ? (
            <LoadError error={(otherList ?? desk.inbox).error!} onRetry={() => void (otherList ?? desk.inbox).refresh()} />
          ) : (
            <LoadingRows rows={6} height={54} />
          )
        ) : listed.length === 0 ? (
          <Box sx={{ py: 4, px: 2, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "8px" }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{list === "queue" ? "No stories waiting" : list === "published" ? "Nothing posted today yet" : "Nothing rejected"}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.5 }}>{list === "queue" ? "New stories from the FTP appear here on their own." : list === "published" ? "Stories land here after Copy & Mark Posted." : "Stories rejected today are listed here."}</Typography>
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
            // A posted story held by someone is being fixed, not edited for posting
            const holder = live?.claim && !current ? (live.claim.mine ? "With you" : list === "published" ? `${live.claim.name} is fixing` : `${live.claim.name} is editing`) : null;
            // Posted today and Rejected are lists to read: plain rows, not buttons that do nothing
            const pickable = !otherList;
            // Why the post needs a second look (no district, two districts, headline cut...), as the queue outside shows
            const checks = live ? shownNeedsCheck(live.needsCheck) : [];
            // Posted today: a small Edit to fix the post (the row itself stays plain), and a mark once it was fixed
            const posted = !otherList && postedIds.has(n.id);
            // A posted row opens its fix on click (it stays posted); no separate Edit button
            const fixable = posted && !!onEdit && !!desk?.canAct && canCorrect(live);
            const editable = false;
            const edited = list === "published" ? editedLabel(live?.corrected) : null;
            // "BHANWAR (Rajsamand)" and "Rajsamand · रेलमगरा", as on the desk's rows
            const reporter = reporterWithDistrict(live?.reporter, live?.district);
            const place = live ? placeLine(live.district, live.town) : "";
            return (
              <Box
                key={n.id}
                component={pickable ? "button" : "div"}
                type={pickable ? "button" : undefined}
                onClick={pickable ? () => !current && (fixable ? !editingId && onEdit?.(n) : onPick(n)) : undefined}
                aria-current={current ? "true" : undefined}
                sx={{
                  // Positioned so the screen-reader label stays inside the scrolling list
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: editable ? "52px minmax(0, 1fr) auto" : "52px minmax(0, 1fr)",
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
                  cursor: (pickable && !current) || (editable && !editingId) ? "pointer" : "default",
                  // Flagged stories carry their tag colour; the rest stay neutral
                  background: (t) => (posted ? postedTint(t.palette.mode, current ? 1.6 : 1) : tag ? tagTint(tag, t.palette.mode, current ? 1.6 : 1) : current ? t.palette.action.selected : "transparent"),
                  // The open story is outlined so it stays distinct from the tint
                  boxShadow: (t) => (current ? `inset 0 0 0 2px ${t.palette.text.primary}` : "none"),
                  ...(pickable ? { "&:hover": { background: (t) => (posted ? postedTint(t.palette.mode, current ? 1.6 : 1.35) : tag ? tagTint(tag, t.palette.mode, current ? 1.6 : 1.35) : current ? t.palette.action.selected : t.palette.action.hover) } } : {}),
                  "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" },
                  ...(highlight.has(n.id) ? freshHighlightSx : {}),
                }}
              >
                <Box sx={{ position: "relative", width: 52, height: 38, borderRadius: "4px", overflow: "hidden", backgroundColor: "#111" }}>
                  {platform === "X (Twitter)" ? (
                    <StoryThumb item={n} boxW={52} boxH={38} org={desk?.orgCardTemplates.data} own={desk?.cardTemplate.data?.template} />
                  ) : cover?.url || cover?.posterUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={cover.posterUrl ?? cover.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : null}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {/* Live: the first line keeps clear of the corner badges (and the needs-check tag beside them) */}
                    {/* One block inside the clamp box, so the badge float wraps the first line instead of taking a line of its own */}
                    <Box component="span" sx={{ display: "block" }}>
                      {live && <RowPresenceSpace draftId={n.id} besideWidth={checks.length ? CHECK_TAG_W + 6 : 0} />}
                      {pattiNumber(live?.sourcePath) && <Box component="span" sx={{ fontWeight: 800 }}>{pattiNumber(live?.sourcePath)} · </Box>}
                      {n.headline}
                    </Box>
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.4, minWidth: 0, overflow: "hidden", fontSize: "0.625rem", color: "text.secondary", whiteSpace: "nowrap" }}>
                    {/* The tint carries the tag on screen; screen readers hear it */}
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
                    {edited && (
                      // Focusable, so keyboard users get the tooltip too; screen readers hear "Edited" and then who and when
                      <>
                        <Tooltip title={edited} describeChild>
                          <Box component="span" tabIndex={0} aria-describedby={`edited-${n.id}`} data-testid="edited-mark" sx={{ flexShrink: 0, px: 0.5, borderRadius: "3px", border: "1px solid", borderColor: "divider", color: "text.secondary", fontWeight: 600, "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" } }}>
                            Edited
                          </Box>
                        </Tooltip>
                        <Box component="span" id={`edited-${n.id}`} sx={srOnly}>
                          {edited}
                        </Box>
                      </>
                    )}
                    {/* Last on the line, so a narrow panel cuts the place, never the status or who holds it */}
                    {reporter && (
                      <Box component="span" title={`Reporter: ${reporter}`} sx={{ flexShrink: 0, fontWeight: 600 }}>
                        <Box component="span" sx={srOnly}>
                          Reporter:{" "}
                        </Box>
                        {reporter}
                      </Box>
                    )}
                    {place && (
                      <Box component="span" title={place} sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {place}
                      </Box>
                    )}
                  </Box>
                </Box>
                {posted && (
                  <Box component="span" sx={{ position: "absolute", right: 6, bottom: 5, px: 0.6, borderRadius: "4px", backgroundColor: "success.main", color: "#fff", fontSize: "0.5625rem", fontWeight: 800, lineHeight: 1.6, letterSpacing: "0.02em" }}>
                    {editingId === n.id ? <CircularProgress size={8} color="inherit" /> : "Posted"}
                  </Box>
                )}
                {editable && (
                  // Sits at the row's foot, clear of the needs-check tag in the top corner
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.(n);
                    }}
                    disabled={!!editingId}
                    aria-label={`Edit the posted story: ${n.headline || "No headline"}`}
                    startIcon={editingId === n.id ? <CircularProgress size={11} color="inherit" /> : <PenLine size={12} aria-hidden />}
                    sx={{ alignSelf: "end", minWidth: 0, minHeight: 26, px: 0.75, py: 0, borderRadius: "6px", borderColor: "divider", textTransform: "none", fontSize: "0.6875rem", fontWeight: 700, whiteSpace: "nowrap", "& .MuiButton-startIcon": { mr: 0.5 }, "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" } }}
                  >
                    Edit
                  </Button>
                )}
                {/* The row's top-right corner: the needs-check tag, then who else is on the story (live presence).
                    Placed over the row, so the row keeps its height */}
                {(checks.length > 0 || live) && (
                  <Box sx={{ position: "absolute", top: 4, right: 4, display: "flex", alignItems: "center", gap: "6px" }}>
                    {checks.length > 0 && (
                      // Hover for the details. The details are also in the row's text (srOnly, below), so screen readers
                      // and keyboard users get them; describeChild keeps the tooltip from naming the mark a second time.
                      <Tooltip
                        placement="right"
                        arrow
                        describeChild
                        title={
                          <Box sx={{ py: 0.25 }}>
                            {checks.map((r) => (
                              <Box key={r} sx={{ fontSize: "0.75rem", lineHeight: 1.45, "& + &": { mt: 0.75 } }}>
                                <b>{needsCheckLabel(r)}.</b> {needsCheckHint(r)}
                              </Box>
                            ))}
                          </Box>
                        }
                      >
                        <Box
                          component="span"
                          data-testid="needs-check-mark"
                          // In the plain Posted / Rejected rows it takes focus, so keyboard users can open the details;
                          // its text already holds them, so the tooltip doesn't describe it again
                          tabIndex={pickable ? undefined : 0}
                          aria-describedby={undefined}
                          // A small red tag, just left of the presence badges in the row's top-right corner
                          sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "1px", minWidth: 22, height: 17, px: "4px", borderRadius: "4px", backgroundColor: "error.main", color: "#fff", fontSize: "0.625rem", fontWeight: 700, lineHeight: 1, "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" } }}
                        >
                          <AlertTriangle size={11} aria-hidden />
                          <span aria-hidden>{checks.length > 1 && checks.length}</span>
                          <Box component="span" sx={srOnly}>
                            {needsCheckDescription(checks, needsCheckLabel, needsCheckHint)}
                          </Box>
                        </Box>
                      </Tooltip>
                    )}
                    {live && <RowPresence draftId={n.id} />}
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
