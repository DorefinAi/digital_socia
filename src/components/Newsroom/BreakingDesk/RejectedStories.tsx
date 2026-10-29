"use client";

// Rejected news: the platform desk's rejected stories as cards (or a list), with the reason and note.
// "Take in" restores a story to the desk's queue; "Take in & edit" restores it and opens it in the editor.

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Box, Button, Chip, CircularProgress, Dialog, IconButton, InputAdornment, Snackbar, TextField, Tooltip, Typography } from "@mui/material";
import { LayoutGrid, List, MapPin, Pencil, RefreshCw, Search, Trash2, Undo2 } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { FtpNewsItem, REJECT_REASONS, SocialPlatform } from "@/types/newsroom";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { CONTROL_HEIGHT, EmptyState, formatStamp, listFrameSx, PLATFORM_META, PlatformIcon, SegmentedControl, storyCategory, timeAgo } from "./shared";
import { countMedia, MediaCounts, StoryCategory, StoryTagChip } from "./QueueViews";
import { activeFilterCount, ActiveFilterChips, type FilterFacts, matchesOtherFilters, matchesPriority, QueueFiltersButton, type QueueFilterState, readQueueFilters, saveQueueFilters } from "./QueueFilters";
import { queueToNews } from "./live/LiveDesk";
import { useRejectedLive } from "./useRejectedLive";
import { USE_MOCKS } from "@/lib/socia/config";

const FILTERS_KEY = "socia_rejected_filters_v1";
const VIEW_KEY = "socia_rejected_view";

/** A rejected story, the same shape whether it came from the server or the demo data. */
interface RejectedStory {
  /** The draft id (what Restore takes) */
  id: string;
  /** What the X console's ?compose= link opens */
  composeId: string;
  item: FtpNewsItem;
  imageUrl: string;
  preview: string;
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
  const { socialDrafts, ftpNews, restoreDraft, deleteDraft, permissions } = useNewsroom();
  // Live: just the rejected list and the counts (not the whole desk provider)
  const desk = useRejectedLive(!USE_MOCKS);
  const router = useRouter();
  const meta = PLATFORM_META[platform];
  const canAct = desk ? desk.canAct : permissions.canApproveSocialContent;

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<RejectedStory | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ─── The stories ───────────────────────────────────────────────────────────
  const stories: RejectedStory[] | null = desk
    ? desk.rejected.data
      ? desk.rejected.data.items.map((q) => {
          const item = queueToNews(q);
          return { id: q.id, composeId: q.id, item, imageUrl: item.media[0]?.url ?? "", preview: q.bodyText, reason: q.rejectReason ? REJECT_REASONS[q.rejectReason] : null, note: q.rejectNote ?? null };
        })
      : null
    : socialDrafts
        .filter((d) => d.platform === platform && d.status === "rejected")
        .map((d) => {
          const news = ftpNews.find((n) => n.id === d.newsId);
          const item: FtpNewsItem = news ?? { id: d.newsId, headline: d.headline, body: "", shortText: d.text, tag: "breaking", area: "", people: [], ftpPath: "", media: [{ kind: d.mediaKind, url: d.thumbUrl, fileName: "" }], receivedAt: d.updatedAt };
          return { id: d.id, composeId: d.newsId, item, imageUrl: d.thumbUrl, preview: d.text || item.shortText, reason: d.rejectReason ? REJECT_REASONS[d.rejectReason] : null, note: d.rejectNote ?? null, rejectedAt: d.updatedAt, rejectedBy: d.postedBy };
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
  const takeIn = async (s: RejectedStory, edit: boolean) => {
    setBusyId(s.id);
    setError(null);
    const failed = desk ? await desk.restore(s.id) : (restoreDraft(s.id), null);
    setBusyId(null);
    if (failed) return setError(failed);
    if (edit) router.push(`${meta.path}?compose=${encodeURIComponent(s.composeId)}`);
    else setNotice("Back in the queue");
  };

  const refresh = async () => {
    if (!desk) return;
    setRefreshing(true);
    await Promise.all([desk.rejected.refresh(), desk.counts.refresh()]);
    setRefreshing(false);
  };

  const actionProps = { canAct, busyId, onTakeIn: (s: RejectedStory) => void takeIn(s, false), onTakeInEdit: (s: RejectedStory) => void takeIn(s, true), onDelete: desk ? undefined : setDeleting };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PlatformIcon platform={platform} size={16} />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              Rejected news
            </Typography>
            {total !== undefined && (
              <Box component="span" sx={{ px: 0.75, borderRadius: "6px", border: "1px solid", borderColor: "divider", fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                {total}
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
            Stories rejected on the {meta.short} desk, with the reason. Take one in to work on it again.
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
      {error && (
        <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main" }}>
          {error}
        </Typography>
      )}

      {/* Stories */}
      {stories === null ? (
        desk?.rejected.error ? <LoadError error={desk.rejected.error} onRetry={() => void desk.rejected.refresh()} /> : <LoadingRows rows={3} height={120} />
      ) : !stories.length ? (
        <EmptyState title="No rejected stories" hint={`Stories rejected on the ${meta.short} desk are kept here with the reason, and can be taken back in.`} />
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

      <Snackbar
        open={!!notice}
        autoHideDuration={5000}
        onClose={() => setNotice("")}
        message={notice}
        action={
          <Button component={Link} href={meta.path} size="small" sx={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>
            Open
          </Button>
        }
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      {/* Demo mode only: delete for good */}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
        <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>Delete this rejected draft?</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>The draft and its reason are removed for good. The story stays on the FTP and will not come back to the queue.</Typography>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                if (deleting) deleteDraft(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────
interface ActionProps {
  canAct: boolean;
  busyId: string | null;
  onTakeIn: (s: RejectedStory) => void;
  onTakeInEdit: (s: RejectedStory) => void;
  onDelete?: (s: RejectedStory) => void;
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

function Actions({ story, canAct, busyId, onTakeIn, onTakeInEdit, onDelete }: ActionProps & { story: RejectedStory }) {
  if (!canAct) return null;
  const busy = busyId === story.id;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {onDelete && (
        <Tooltip title="Delete">
          <IconButton size="small" aria-label={`Delete ${story.item.headline}`} onClick={() => onDelete(story)} sx={{ width: 32, height: 32, borderRadius: "8px", color: "text.secondary", "&:hover": { color: "error.main" } }}>
            <Trash2 size={15} />
          </IconButton>
        </Tooltip>
      )}
      <Button size="small" variant="outlined" startIcon={<Pencil size={13} />} disabled={busy} onClick={() => onTakeInEdit(story)} sx={{ minHeight: 32, px: 1.25, fontSize: "0.75rem", fontWeight: 600, borderColor: "divider", color: "text.primary", whiteSpace: "nowrap" }}>
        Take in &amp; edit
      </Button>
      <Button
        size="small"
        variant="contained"
        disableElevation
        startIcon={busy ? <CircularProgress size={12} color="inherit" /> : <Undo2 size={13} />}
        disabled={busy}
        onClick={() => onTakeIn(story)}
        sx={{ minHeight: 32, px: 1.25, fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap", backgroundColor: "text.primary", color: "background.paper", "&:hover": { backgroundColor: "text.primary", opacity: 0.9 } }}
      >
        Take in
      </Button>
    </Box>
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
