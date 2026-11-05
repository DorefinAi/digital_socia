"use client";

// Rejected news: the platform desk's rejected stories as cards (or a list), with the reason and note.
// "Send to X" opens a dialog with the headline, the full news text and the original file's path. It does not
// change the story yet (what sending does is still to be decided).

import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, TextField, Typography } from "@mui/material";
import { Check, Copy, LayoutGrid, List, MapPin, RefreshCw, Search, Send } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { FtpNewsItem, REJECT_REASONS, SocialPlatform } from "@/types/newsroom";
import { errorText, LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { CONTROL_HEIGHT, EmptyState, formatStamp, listFrameSx, PLATFORM_META, PlatformIcon, SegmentedControl, storyCategory, timeAgo } from "./shared";
import { countMedia, MediaCounts, StoryCategory, StoryTagChip } from "./QueueViews";
import { activeFilterCount, ActiveFilterChips, type FilterFacts, matchesOtherFilters, matchesPriority, QueueFiltersButton, type QueueFilterState, readQueueFilters, saveQueueFilters } from "./QueueFilters";
import { queueToNews } from "./live/LiveDesk";
import { fetchDraft } from "@/lib/socia/api";
import { useRejectedLive } from "./useRejectedLive";
import { USE_MOCKS } from "@/lib/socia/config";

const FILTERS_KEY = "socia_rejected_filters_v1";
const VIEW_KEY = "socia_rejected_view";

/** A rejected story, the same shape whether it came from the server or the demo data. */
interface RejectedStory {
  /** The draft id */
  id: string;
  item: FtpNewsItem;
  imageUrl: string;
  preview: string;
  /** The post's text (the draft: an excerpt of the story) */
  postText: string;
  /** The full story text when it is already at hand (demo data); live, the dialog loads it from the draft */
  newsText: string | null;
  /** Where the original file sits; null when the server does not know it */
  sourcePath: string | null;
  reason: string | null;
  note: string | null;
  rejectedAt?: string;
  rejectedBy?: string;
}

function readView(): "cards" | "list" {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

export default function RejectedStories({ platform }: { platform: SocialPlatform }) {
  const { socialDrafts, ftpNews } = useNewsroom();
  const { can } = usePermissions();
  // Live: just the rejected list and the counts (not the whole desk provider)
  const desk = useRejectedLive(!USE_MOCKS);
  const meta = PLATFORM_META[platform];
  // Send to X is a desk action: the same people who could take a story back in
  const canAct = can("story.take_in");

  const [view, setView] = useState<"cards" | "list">(readView);
  const changeView = (next: "cards" | "list") => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };
  const [query, setQuery] = useState("");
  const [filters, setFiltersState] = useState<QueueFilterState>(() => readQueueFilters(FILTERS_KEY));
  const setFilters = (next: QueueFilterState) => {
    setFiltersState(next);
    saveQueueFilters(next, FILTERS_KEY);
  };
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [sending, setSending] = useState<RejectedStory | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ─── The stories ───────────────────────────────────────────────────────────
  const stories: RejectedStory[] | null = desk
    ? desk.rejected.data
      ? desk.rejected.data.items.map((q) => {
          const item = queueToNews(q);
          return { id: q.id, item, imageUrl: item.media[0]?.url ?? "", preview: q.bodyText, postText: q.bodyText, newsText: null, sourcePath: q.sourcePath || null, reason: q.rejectReason ? REJECT_REASONS[q.rejectReason] : null, note: q.rejectNote ?? null };
        })
      : null
    : socialDrafts
        .filter((d) => d.platform === platform && d.status === "rejected")
        .map((d) => {
          const news = ftpNews.find((n) => n.id === d.newsId);
          const item: FtpNewsItem = news ?? { id: d.newsId, headline: d.headline, body: "", shortText: d.text, tag: "breaking", area: "", people: [], ftpPath: "", media: [{ kind: d.mediaKind, url: d.thumbUrl, fileName: "" }], receivedAt: d.updatedAt };
          return { id: d.id, item, imageUrl: d.thumbUrl, preview: d.text || item.shortText, postText: d.text || item.shortText, newsText: item.body || item.shortText, sourcePath: item.ftpPath || null, reason: d.rejectReason ? REJECT_REASONS[d.rejectReason] : null, note: d.rejectNote ?? null, rejectedAt: d.updatedAt, rejectedBy: d.postedBy };
        });

  const facts: FilterFacts = { media: countMedia, status: () => "new" };
  const q = query.trim().toLowerCase();
  const order = filters.sort === "oldest" ? 1 : -1;
  const visible = (stories ?? [])
    .filter((s) => !q || [s.item.headline, s.preview, s.item.area, storyCategory(s.item) ?? "", s.note ?? "", s.reason ?? ""].some((f) => f.toLowerCase().includes(q)))
    .filter((s) => matchesOtherFilters(s.item, filters, facts, now) && matchesPriority(s.item, filters.priority))
    .sort((a, b) => order * (new Date(a.item.receivedAt).getTime() - new Date(b.item.receivedAt).getTime()));
  const categories = [...new Set((stories ?? []).map((s) => storyCategory(s.item)).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const districts = [...new Set((stories ?? []).map((s) => s.item.area).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const total = desk ? (desk.counts.data?.byView.rejected ?? stories?.length) : stories?.length;

  // ─── Actions ───────────────────────────────────────────────────────────────
  const refresh = async () => {
    if (!desk) return;
    setRefreshing(true);
    await Promise.all([desk.rejected.refresh(), desk.counts.refresh()]);
    setRefreshing(false);
  };

  const actionProps = { canAct, onSend: setSending };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PlatformIcon platform={platform} size={16} />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              News - Desk Rejected
            </Typography>
            {total !== undefined && (
              <Box component="span" sx={{ px: 0.75, borderRadius: "6px", border: "1px solid", borderColor: "divider", fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                {total}
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
            Stories rejected on the {meta.short} desk, with the reason. Send to X shows a story&apos;s full text and its file path.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <SegmentedControl
            ariaLabel="Rejected view"
            value={view}
            onChange={changeView}
            options={[
              { value: "cards", label: (<><LayoutGrid size={14} /> Cards</>) },
              { value: "list", label: (<><List size={14} /> List</>) },
            ]}
          />
          {desk && (
            <Button
              variant="outlined"
              onClick={() => void refresh()}
              disabled={refreshing}
              startIcon={refreshing ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={14} />}
              sx={{ height: CONTROL_HEIGHT, flexShrink: 0, fontWeight: 600, borderColor: "divider", color: "text.primary", whiteSpace: "nowrap" }}
            >
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>
          )}
        </Box>
      </Box>

      {/* Search + filters */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <TextField
          placeholder="Search headline, reason, note"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="small"
          slotProps={{ input: { startAdornment: (<InputAdornment position="start"><Search size={15} /></InputAdornment>) }, htmlInput: { "aria-label": "Search rejected stories" } }}
          sx={{ flex: { xs: 1, sm: "none" }, minWidth: 0, width: { sm: 300 }, "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem", height: CONTROL_HEIGHT } }}
        />
        <QueueFiltersButton filters={filters} onChange={setFilters} categories={categories} districts={districts} live={!!desk} showStatus={false} />
      </Box>
      <ActiveFilterChips filters={filters} onChange={setFilters} live={!!desk} />
      {desk && stories && total !== undefined && total > stories.length && (
        <Typography role="status" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Showing the {stories.length} most recent of {total} rejected stories. Search and filters cover these {stories.length}.
        </Typography>
      )}

      {/* Stories */}
      {stories === null ? (
        desk?.rejected.error ? <LoadError error={desk.rejected.error} onRetry={() => void desk.rejected.refresh()} /> : <LoadingRows rows={3} height={120} />
      ) : !stories.length ? (
        <EmptyState title="No rejected stories" hint={`Stories rejected on the ${meta.short} desk are kept here with the reason.`} />
      ) : !visible.length ? (
        <EmptyState title="No rejected stories match" hint={q || activeFilterCount(filters) ? "Clear the search or the filters to see more." : ""} />
      ) : view === "cards" ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2.5 }}>
          {visible.map((s) => (
            <RejectedCard key={s.id} story={s} {...actionProps} />
          ))}
        </Box>
      ) : (
        <Box sx={listFrameSx}>
          {visible.map((s, i) => (
            <RejectedRow key={s.id} story={s} first={i === 0} {...actionProps} />
          ))}
        </Box>
      )}

      <SendToXDialog story={sending} onClose={() => setSending(null)} />
    </Box>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────
interface ActionProps {
  canAct: boolean;
  onSend: (s: RejectedStory) => void;
}

function Reason({ story }: { story: RejectedStory }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        {story.reason && <Chip label={story.reason} size="small" color="error" variant="outlined" sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px" }} />}
        {(story.rejectedBy || story.rejectedAt) && (
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
            {story.rejectedBy ? `Rejected by ${story.rejectedBy}` : "Rejected"}
            {story.rejectedAt ? `, ${formatStamp(story.rejectedAt)}` : ""}
          </Typography>
        )}
      </Box>
      {story.note && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.5, overflowWrap: "anywhere" }}>&ldquo;{story.note}&rdquo;</Typography>}
    </Box>
  );
}

function Actions({ story, canAct, onSend }: ActionProps & { story: RejectedStory }) {
  if (!canAct) return null;
  return (
    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
      <Button
        size="small"
        variant="contained"
        disableElevation
        startIcon={<Send size={13} />}
        onClick={() => onSend(story)}
        aria-haspopup="dialog"
        aria-label={`Send to X: ${story.item.headline}`}
        sx={{ minHeight: 32, px: 1.25, fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap", backgroundColor: "text.primary", color: "background.paper", "&:hover": { backgroundColor: "text.primary", opacity: 0.9 } }}
      >
        Send to X
      </Button>
    </Box>
  );
}

/** The story behind a rejected draft, loaded from GET /drafts/:id when the dialog opens (live only). */
type FullStory = { id: string; news: string; path: string | null } | { id: string; error: string };

/** What Send to X will work from: the headline, the full news, the post text and where the original file is. */
function SendToXDialog({ story, onClose }: { story: RejectedStory | null; onClose: () => void }) {
  // Keep showing the last story while the dialog closes
  const [shown, setShown] = useState<RejectedStory | null>(story);
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  if (story && story !== shown) {
    setShown(story);
    setCopied(null);
  }
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  // Live: the queue only has the post text, so the full story comes from the draft
  const [full, setFull] = useState<FullStory | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needsFetch = !!story && story.newsText === null;
  const fetchId = needsFetch ? story.id : null;
  useEffect(() => {
    if (!fetchId) return;
    let cancelled = false;
    fetchDraft(fetchId)
      .then((d) => {
        if (!cancelled) setFull({ id: fetchId, news: d.story.body, path: d.story.sourcePath ?? null });
      })
      .catch((err) => {
        if (!cancelled) setFull({ id: fetchId, error: errorText(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchId, attempt]);
  const loaded = shown && full?.id === shown.id ? full : null;
  const loading = !!shown && shown.newsText === null && !loaded;
  const retry = () => {
    setFull(null);
    setAttempt((n) => n + 1);
  };

  const newsText = shown?.newsText ?? (loaded && "news" in loaded ? loaded.news : null);
  const sourcePath = (loaded && "news" in loaded ? loaded.path : null) || shown?.sourcePath || null;

  const copyPath = async () => {
    if (!sourcePath) return;
    try {
      await navigator.clipboard.writeText(sourcePath);
      setCopied("done");
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied("failed");
    }
  };

  const labelSx = { fontSize: "0.6875rem", fontWeight: 600, color: "text.secondary", mb: 0.5 } as const;
  const textBoxSx = { overflowY: "auto", p: 1.5, borderRadius: "8px", border: "1px solid", borderColor: "divider", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } } as const;
  const textSx = { fontSize: "0.8125rem", lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;
  return (
    <Dialog open={!!story} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="send-to-x-title" slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none", mx: { xs: 2, sm: 4 }, width: { xs: "calc(100% - 32px)", sm: "calc(100% - 64px)" } } }, transition: { onExited: () => setCopied(null) } }}>
      <DialogTitle id="send-to-x-title" sx={{ display: "flex", alignItems: "center", gap: 1, fontSize: "1rem", fontWeight: 700, pb: 1 }}>
        <PlatformIcon platform="X (Twitter)" size={15} /> Send to X
      </DialogTitle>
      {shown && (
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "4px !important" }}>
          <Box>
            <Typography component="h3" sx={labelSx}>Headline</Typography>
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" }}>{shown.item.headline}</Typography>
          </Box>
          <Box>
            <Typography component="h3" id="send-to-x-news" sx={labelSx}>News</Typography>
            {loading ? (
              <Box role="status" sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, borderRadius: "8px", border: "1px solid", borderColor: "divider", fontSize: "0.8125rem", color: "text.secondary" }}>
                <CircularProgress size={14} color="inherit" /> Loading the story
              </Box>
            ) : loaded && "error" in loaded ? (
              <Box role="alert" sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", p: 1.5, borderRadius: "8px", border: "1px solid", borderColor: "error.main", fontSize: "0.8125rem", color: "error.main" }}>
                <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>Couldn’t load the story. {loaded.error}</Box>
                <Button size="small" onClick={retry} sx={{ fontWeight: 600, flexShrink: 0 }}>Try again</Button>
              </Box>
            ) : (
              <Box tabIndex={0} aria-labelledby="send-to-x-news" sx={{ ...textBoxSx, maxHeight: { xs: 240, sm: 300 }, backgroundColor: "action.hover" }}>
                <Typography sx={textSx}>{newsText?.trim() || "This story has no text."}</Typography>
              </Box>
            )}
          </Box>
          <Box>
            <Typography component="h3" id="send-to-x-post" sx={labelSx}>Post text</Typography>
            <Box tabIndex={0} aria-labelledby="send-to-x-post" sx={{ ...textBoxSx, maxHeight: 140 }}>
              <Typography sx={{ ...textSx, color: "text.secondary" }}>{shown.postText.trim() || "No post text."}</Typography>
            </Box>
          </Box>
          <Box>
            <Typography component="h3" sx={labelSx}>Content path</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", sm: "nowrap" } }}>
              {sourcePath ? (
                <Box component="code" sx={{ flex: 1, minWidth: 0, px: 1.25, py: 0.75, borderRadius: "8px", border: "1px solid", borderColor: "divider", fontSize: "0.75rem", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", overflowWrap: "anywhere", userSelect: "all" }}>
                  {sourcePath}
                </Box>
              ) : (
                <Typography sx={{ flex: 1, fontSize: "0.8125rem", color: "text.secondary", fontStyle: "italic" }}>{loading ? "Loading" : "Not available"}</Typography>
              )}
              <Button
                size="small"
                variant="outlined"
                onClick={() => void copyPath()}
                disabled={!sourcePath}
                startIcon={copied === "done" ? <Check size={13} /> : <Copy size={13} />}
                sx={{ minHeight: 32, px: 1.25, flexShrink: 0, fontSize: "0.75rem", fontWeight: 600, borderColor: "divider", color: "text.primary", whiteSpace: "nowrap" }}
              >
                {copied === "done" ? "Copied" : "Copy path"}
              </Button>
            </Box>
            <Typography role="status" aria-live="polite" sx={{ fontSize: "0.75rem", color: "error.main", mt: copied === "failed" ? 0.5 : 0 }}>
              {copied === "failed" ? "Could not copy. Select the path and copy it by hand." : ""}
            </Typography>
          </Box>
        </DialogContent>
      )}
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 600 }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function Meta({ story }: { story: RejectedStory }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap", fontSize: "0.6875rem", color: "text.secondary" }}>
      <StoryCategory item={story.item} />
      {story.item.area && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
          <MapPin size={12} /> {story.item.area}
        </Box>
      )}
      <MediaCounts item={story.item} />
      <span>received {timeAgo(story.item.receivedAt)}</span>
    </Box>
  );
}

function RejectedCard({ story, ...actions }: ActionProps & { story: RejectedStory }) {
  return (
    <Box component="article" sx={{ backgroundColor: "background.paper", borderRadius: "14px", overflow: "hidden", border: "1px solid", borderColor: "divider", boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Box sx={{ position: "relative", height: 150, backgroundColor: "#000" }}>
        {story.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={story.imageUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.85 }} />
        )}
        <Box sx={{ position: "absolute", left: 10, top: 10 }}>
          <StoryTagChip item={story.item} />
        </Box>
      </Box>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
        <Typography component="h2" sx={{ fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.45 }}>
          {story.item.headline}
        </Typography>
        {story.preview && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{story.preview}</Typography>}
        <Meta story={story} />
        <Box sx={{ mt: 0.5, pt: 1, borderTop: "1px dashed", borderColor: "divider" }}>
          <Reason story={story} />
        </Box>
        <Box sx={{ mt: "auto", pt: 1 }}>
          <Actions story={story} {...actions} />
        </Box>
      </Box>
    </Box>
  );
}

function RejectedRow({ story, first, ...actions }: ActionProps & { story: RejectedStory; first: boolean }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "64px minmax(0, 1fr)", md: "80px minmax(0, 1fr) auto" },
        gap: 1.5,
        alignItems: "start",
        px: 1.5,
        py: 1.25,
        borderTop: first ? "none" : "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ width: "100%", aspectRatio: "7 / 5", borderRadius: "6px", overflow: "hidden", backgroundColor: "#111" }}>
        {story.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={story.imageUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 0.85 }} />
        )}
      </Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.6 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.4, overflowWrap: "anywhere" }}>{story.item.headline}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <StoryTagChip item={story.item} />
          <Meta story={story} />
        </Box>
        <Reason story={story} />
      </Box>
      <Box sx={{ gridColumn: { xs: "2", md: "auto" }, alignSelf: "center" }}>
        <Actions story={story} {...actions} />
      </Box>
    </Box>
  );
}
