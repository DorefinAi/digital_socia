"use client";

// Web Scraper: what is trending in Rajasthan and India, from free public sources (Google News, Google
// Trends, GDELT, publishers' RSS; YouTube when a key is set). No AI: "why trending" is the matching
// headlines. Live, it reads the Socia API (contract: handoff/web-scraper-contract.md); in demo mode the
// demo data. Same kit as the X console: Cards | List, the Filters button, chips, the new-items pill.

import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, IconButton, InputAdornment, Popover, Snackbar, TextField, Typography } from "@mui/material";
import { ExternalLink, Flame, Globe, Hash, ImageOff, LayoutGrid, List, Newspaper, PlusCircle, RefreshCw, Search, TrendingUp, X } from "lucide-react";
import ResponsiveTabs from "@/components/Layout/ResponsiveTabs";
import { DEMO_SCRAPER_TOPICS } from "@/data/scraperData";
import { USE_MOCKS } from "@/lib/socia/config";
import { usePolled } from "@/lib/socia/usePolled";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import { fetchTrendDistricts, fetchTrends, refreshTrends, searchTrends, type TrendItem, type TrendSource, type TrendsResponse, type TrendType, type TrendWindow } from "@/lib/socia/trends";
import { errorText, LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";
import { CONTROL_HEIGHT, SegmentedControl } from "./ui/controls";
import { FilterChips, type FilterChip, FilterEmpty, FilterOption, FiltersButton, FilterSection, toggleValue } from "./ui/FilterKit";
import NewStoriesPill, { freshHighlightSx } from "./BreakingDesk/NewStoriesPill";
import { apiFileUrl } from "./BreakingDesk/live/LiveDesk";
import CreateDraftDialog from "./CreateDraftDialog";
import type { ScraperItem } from "@/types/newsroom";
import { DEMO_CHANNEL, DEMO_DISTRICT, demoSources } from "@/data/scraperDemoExtras";
import { KeywordWatchButton, NewMatchesBadge, useTrendWatches, WatchHits } from "./WebScraper/KeywordWatch";
import { ClusterSources, sourceCountOf } from "./WebScraper/ClusterSources";

const POLL_MS = 60_000;
const STORE_KEY = "socia_trends_view_v1";

type SortValue = "rank" | "newest" | "growth";
interface TrendFilters {
  /** Source groups (News, Publisher RSS, Government, Trends, Social, YouTube) */
  sources: string[];
  categories: string[];
  districts: string[];
  /** Only items that match one of the user's watch keywords */
  watched: boolean;
  sort: SortValue;
}
interface Remembered {
  type: TrendType;
  window: TrendWindow;
  view: "cards" | "list";
  filters: TrendFilters;
}
const EMPTY_FILTERS: TrendFilters = { sources: [], categories: [], districts: [], watched: false, sort: "rank" };
const DEFAULTS: Remembered = { type: "topics", window: "24h", view: "cards", filters: EMPTY_FILTERS };

function readRemembered(): Remembered {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<Remembered> | null;
    if (!raw || typeof raw !== "object") return DEFAULTS;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const f = (raw.filters ?? {}) as Partial<TrendFilters>;
    return {
      type: (["topics", "articles", "hashtags"] as const).find((t) => t === raw.type) ?? "topics",
      window: (["12h", "24h", "7d"] as const).find((w) => w === raw.window) ?? "24h",
      view: raw.view === "list" ? "list" : "cards",
      filters: { sources: list(f.sources).filter(isGroup), categories: list(f.categories), districts: list(f.districts), watched: f.watched === true, sort: (["rank", "newest", "growth"] as const).find((s) => s === f.sort) ?? "rank" },
    };
  } catch {
    return DEFAULTS;
  }
}

const TYPE_TABS: { value: TrendType; label: string; icon: React.ReactNode; noun: [string, string] }[] = [
  { value: "topics", label: "Topics", icon: <Flame size={14} />, noun: ["topic", "topics"] },
  { value: "articles", label: "Articles", icon: <Newspaper size={14} />, noun: ["article", "articles"] },
  { value: "hashtags", label: "Hashtags", icon: <Hash size={14} />, noun: ["hashtag", "hashtags"] },
];
const WINDOW_HOURS: Record<TrendWindow, number> = { "12h": 12, "24h": 24, "7d": 168 };

/** "+180% in 6h" as a number for sorting; unknown sorts last. */
const growthOf = (item: TrendItem) => {
  const m = /([+-]?\d+(?:\.\d+)?)\s*%/.exec(item.engagementStats.growthRate);
  return m ? Number(m[1]) : -Infinity;
};
/** An item's source group: its feed's group when the list knows the feed, else from its platform */
function itemGroup(item: TrendItem, byName: ReadonlyMap<string, SourceGroup>): SourceGroup {
  const known = item.sourceName ? byName.get(item.sourceName) : undefined;
  if (known) return known;
  if (item.platform === "YouTube") return "YouTube";
  if (item.platform === "Google Trends") return "Trends";
  if (item.platform === "Google News") return "News";
  return item.sourceName ? guessGroup(item.sourceName) : "Publisher RSS";
}
/** Feed text as plain text: some RSS descriptions arrive as HTML (links, &amp;). Shown as text, never as HTML. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const plain = (s: string) =>
  s
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e: string) => ENTITIES[e])
    .replace(/<[^>]*>/g, " ")
    // A description cut off inside a tag ("<img border="0" styl")
    .replace(/<[^>]*$/, "")
    .replace(/\s+/g, " ")
    .trim();

const ago = (iso: string, now: number) => {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

/** Demo mode: the demo topics, plus article and hashtag versions of them, with districts, same-story groups and channel names. */
function demoItems(type: TrendType): TrendItem[] {
  let channel = 0;
  return DEMO_SCRAPER_TOPICS.map((base): TrendItem => {
    const sources = demoSources(base.id);
    const item: TrendItem = {
      ...base,
      district: DEMO_DISTRICT[base.id] ?? null,
      sourceName: base.platform === "YouTube" ? DEMO_CHANNEL[channel++ % DEMO_CHANNEL.length] : undefined,
      clusterId: sources.length ? `demo-cluster-${base.id}` : null,
      sourceCount: Math.max(1, sources.length),
      sources,
    };
    if (type === "articles") return { ...item, id: `${item.id}-a`, type, title: `${item.title}: the latest coverage` };
    if (type === "hashtags") return { ...item, id: `${item.id}-h`, type, title: "#" + item.subTag.replace(/[^\p{L}\p{M}\p{N}]+/gu, "") };
    return item;
  });
}

export default function WebScraperPage() {
  const live = !USE_MOCKS;
  const { me } = useSociaSession();
  const canRunSources = me?.user.role === "editor" || me?.user.role === "admin";

  const [remembered, setRemembered] = useState<Remembered>(readRemembered);
  const remember = (patch: Partial<Remembered>) => {
    const next = { ...remembered, ...patch };
    setRemembered(next);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {}
  };
  const { type, window: win, view, filters } = remembered;
  const setFilters = (f: TrendFilters) => remember({ filters: f });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ─── Data ──────────────────────────────────────────────────────────────────
  const trends = usePolled<TrendsResponse>(() => fetchTrends(type, win), POLL_MS, `trends-${type}-${win}`, live);
  const [demoFetchedAt, setDemoFetchedAt] = useState(() => new Date().toISOString());
  const all: TrendItem[] | null = live
    ? (trends.data?.items ?? null)
    : demoItems(type).filter((i) => new Date(demoFetchedAt).getTime() - new Date(i.scrapedAt).getTime() <= WINDOW_HOURS[win] * 3600_000);
  const fetchedAt = live ? (trends.data?.fetchedAt ?? null) : demoFetchedAt;

  // New items from a poll wait behind the pill, so the list does not reorder under the operator
  const listKey = `${type}-${win}`;
  const [shown, setShown] = useState<{ key: string; ids: ReadonlySet<string> } | null>(null);
  if (all && shown?.key !== listKey) setShown({ key: listKey, ids: new Set(all.map((i) => i.id)) });
  const shownIds = shown?.key === listKey ? shown.ids : null;
  const [highlight, setHighlight] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!highlight.size) return;
    const t = setTimeout(() => setHighlight(new Set()), 2200);
    return () => clearTimeout(t);
  }, [highlight]);
  const listRef = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);
  const [pointerInList, setPointerInList] = useState(false);
  useEffect(() => {
    const onScroll = () => setAtTop((listRef.current?.getBoundingClientRect().top ?? 0) >= -4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ─── Keyword watch ─────────────────────────────────────────────────────────
  const watch = useTrendWatches(live, live ? [] : demoItems("topics"), () => void trends.refresh());
  const showWatched = () => {
    watch.markSeen();
    setFilters({ ...filters, watched: true });
  };
  // Districts of the last 24 h with counts (live), to order the District filter by how busy each is
  const districtCounts = usePolled(fetchTrendDistricts, POLL_MS, "trend-districts", live);

  // ─── Search and filters ────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // Feed name to group, from the source list (live only)
  const groupByName: ReadonlyMap<string, SourceGroup> = new Map((trends.data?.sources ?? []).map((src) => [src.name, groupOfSource(src)]));
  const matches = (i: TrendItem) =>
    (!q || [i.title, i.reasonWhy, i.superTag, i.subTag, i.sourceName ?? "", i.district ?? ""].some((f) => f.toLowerCase().includes(q))) &&
    (!filters.sources.length || filters.sources.includes(itemGroup(i, groupByName))) &&
    (!filters.categories.length || filters.categories.includes(i.superTag)) &&
    (!filters.districts.length || filters.districts.includes(i.district ?? "")) &&
    (!filters.watched || watch.hitsOf(i).length > 0);
  const sortItems = (items: TrendItem[]) =>
    [...items].sort((a, b) =>
      filters.sort === "newest" ? new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime() : filters.sort === "growth" ? growthOf(b) - growthOf(a) || a.rank - b.rank : a.rank - b.rank,
    );
  const waiting = all && shownIds ? all.filter((i) => !shownIds.has(i.id) && matches(i)) : [];
  const visible = all ? sortItems(all.filter((i) => (!shownIds || shownIds.has(i.id)) && matches(i))) : [];
  const facets = (pick: (i: TrendItem) => string | null | undefined) => [...new Set((all ?? []).map(pick).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  const groupsPresent = new Set((all ?? []).map((i) => itemGroup(i, groupByName)));
  const sources = SOURCE_GROUPS.filter((g) => groupsPresent.has(g));
  const categories = facets((i) => i.superTag);
  // District options with how many loaded items name each; busiest first (the last 24 h live, else this list)
  const districtCount = new Map<string, number>();
  for (const i of all ?? []) if (i.district) districtCount.set(i.district, (districtCount.get(i.district) ?? 0) + 1);
  const recent = new Map((districtCounts.data?.districts ?? []).map((d) => [d.name, d.count]));
  const districts = [...districtCount.keys()].sort((a, b) => (recent.get(b) ?? 0) - (recent.get(a) ?? 0) || districtCount.get(b)! - districtCount.get(a)! || a.localeCompare(b));
  const activeCount = filters.sources.length + filters.categories.length + filters.districts.length + (filters.watched ? 1 : 0);

  const mergeWaiting = () => {
    if (!all) return;
    setShown({ key: listKey, ids: new Set(all.map((i) => i.id)) });
    setHighlight(new Set(waiting.map((i) => i.id)));
  };
  const showWaiting = () => {
    mergeWaiting();
    if (!listRef.current) return;
    const y = listRef.current.getBoundingClientRect().top + window.scrollY - 16;
    if (window.scrollY > y) window.scrollTo({ top: y, behavior: "smooth" });
  };
  if (waiting.length > 0 && atTop && !pointerInList) mergeWaiting();

  // ─── Live search (Enter) ───────────────────────────────────────────────────
  const [search, setSearch] = useState<{ q: string; items: TrendItem[] | null; error: string | null } | null>(null);
  const runSearch = async () => {
    const text = query.trim();
    if (!live || text.length < 2 || (search && search.q === text && !search.items && !search.error)) return;
    setSearch({ q: text, items: null, error: null });
    try {
      const res = await searchTrends(text);
      setSearch({ q: text, items: res.items, error: null });
    } catch (err) {
      setSearch({ q: text, items: [], error: errorText(err) });
    }
  };

  // ─── Actions ───────────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  const refresh = async () => {
    if (!live) {
      setDemoFetchedAt(new Date().toISOString());
      return;
    }
    setRefreshing(true);
    // Only editors and admins may start a run of the sources; everyone else reloads what the last run found
    if (!canRunSources) {
      await trends.refresh();
      setNotice({ text: "Reloaded. The sources are checked every 15 minutes." });
      setRefreshing(false);
      return;
    }
    try {
      await refreshTrends();
      setNotice({ text: "Checking the sources now. New items appear here in a minute or two." });
      // The run takes a while; look again shortly
      setTimeout(() => void trends.refresh(), 8000);
      setTimeout(() => void trends.refresh(), 30000);
    } catch (err) {
      setNotice({ text: errorText(err) });
    }
    setRefreshing(false);
  };

  // "Create draft" asks which platform (CreateDraftDialog), then opens that platform's editor on the trend
  const [drafting, setDrafting] = useState<TrendItem | null>(null);
  const cardProps: CardActions = { onDraft: setDrafting, now, hitsOf: watch.hitsOf };
  const tab = TYPE_TABS.find((t) => t.value === type)!;
  const loadError = live && !trends.data ? trends.error : null;
  const staleError = live && trends.data ? trends.error : null;

  const chips: FilterChip[] = [
    ...(filters.watched ? [{ key: "watched", label: "Watched keywords", onRemove: () => setFilters({ ...filters, watched: false }) }] : []),
    ...filters.sources.map((s) => ({ key: `s-${s}`, label: isGroup(s) ? GROUP_TITLE[s] : s, onRemove: () => setFilters({ ...filters, sources: filters.sources.filter((x) => x !== s) }) })),
    ...filters.categories.map((c) => ({ key: `c-${c}`, label: c, onRemove: () => setFilters({ ...filters, categories: filters.categories.filter((x) => x !== c) }) })),
    ...filters.districts.map((d) => ({ key: `d-${d}`, label: d, onRemove: () => setFilters({ ...filters, districts: filters.districts.filter((x) => x !== d) }) })),
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Header, as on the X console */}
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ flex: "1 1 360px", minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Globe size={16} />
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.01em" }}>
              Web Scraper
            </Typography>
            <SourceStatus live={live} data={trends.data} fetchedAt={fetchedAt} now={now} onRetry={() => void refresh()} retrying={refreshing} />
            <NewMatchesBadge count={watch.newCount} onShow={showWatched} />
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>What&apos;s trending in Rajasthan and India — Google News, Google Trends, GDELT and publishers&apos; feeds.</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <SegmentedControl
            ariaLabel="Trends view"
            value={view}
            onChange={(v) => remember({ view: v })}
            options={[
              { value: "cards", label: (<><LayoutGrid size={14} /> Cards</>) },
              { value: "list", label: (<><List size={14} /> List</>) },
            ]}
          />
          <Button
            variant="outlined"
            onClick={() => void refresh()}
            disabled={refreshing}
            startIcon={refreshing ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={14} />}
            sx={{ height: CONTROL_HEIGHT, flexShrink: 0, fontWeight: 600, borderColor: "divider", color: "text.primary", whiteSpace: "nowrap" }}
          >
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        </Box>
      </Box>

      {/* Tabs + window, search, filters */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", borderBottom: "1px solid", borderColor: "divider" }}>
        <ResponsiveTabs<TrendType>
          value={type}
          onChange={(t) => remember({ type: t })}
          ariaLabel="Trend types"
          items={TYPE_TABS.map((t) => ({ value: t.value, label: t.value === type && all ? `${t.label} (${visible.length})` : t.label }))}
          tabsSx={{ minHeight: 40, maxWidth: "100%", "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", px: 1.5, minWidth: 0 } }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: { xs: 0, sm: "auto" }, width: { xs: "100%", sm: "auto" }, pb: 0.75, flexWrap: "wrap" }}>
          <SegmentedControl
            ariaLabel="Time window"
            value={win}
            onChange={(w) => remember({ window: w })}
            options={[
              { value: "12h", label: "12 h", ariaLabel: "Last 12 hours" },
              { value: "24h", label: "24 h", ariaLabel: "Last 24 hours" },
              { value: "7d", label: "7 days", ariaLabel: "Last 7 days" },
            ]}
          />
          <TextField
            placeholder={live ? "Filter, or Enter to search Google News" : "Search trends"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch()}
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={15} />
                  </InputAdornment>
                ),
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Clear search" onClick={() => setQuery("")} sx={{ mr: -0.75 }}>
                      <X size={14} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
              htmlInput: { "aria-label": live ? "Filter trends; press Enter to search Google News" : "Search trends" },
            }}
            sx={{ order: { xs: -1, sm: 0 }, flex: { xs: "1 1 100%", sm: "none" }, minWidth: 0, width: { sm: 270 }, "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem", height: CONTROL_HEIGHT } }}
          />
          <KeywordWatchButton watch={watch} />
          <FiltersButton activeCount={activeCount} onClearAll={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
            <FilterSection title="Sort">
              <SegmentedControl<SortValue>
                ariaLabel="Sort"
                value={filters.sort}
                onChange={(sort) => setFilters({ ...filters, sort })}
                options={[
                  { value: "rank", label: "Rank" },
                  { value: "newest", label: "Newest" },
                  { value: "growth", label: "Growth" },
                ]}
              />
            </FilterSection>
            <FilterSection title="Watched">
              {watch.keywords.length ? (
                <FilterOption on={filters.watched} onClick={() => setFilters({ ...filters, watched: !filters.watched })}>
                  Only items with my keywords
                </FilterOption>
              ) : (
                <FilterEmpty>Add keywords under Keyword watch to use this.</FilterEmpty>
              )}
            </FilterSection>
            <FilterSection title="Source">
              {sources.length ? sources.map((s) => (
                <FilterOption key={s} on={filters.sources.includes(s)} onClick={() => setFilters({ ...filters, sources: toggleValue(filters.sources, s) })}>
                  {GROUP_TITLE[s]}
                </FilterOption>
              )) : <FilterEmpty>Nothing loaded yet.</FilterEmpty>}
            </FilterSection>
            <FilterSection title="Category">
              {categories.length ? categories.map((c) => (
                <FilterOption key={c} on={filters.categories.includes(c)} onClick={() => setFilters({ ...filters, categories: toggleValue(filters.categories, c) })}>
                  {c}
                </FilterOption>
              )) : <FilterEmpty>No item here has a category.</FilterEmpty>}
            </FilterSection>
            <FilterSection title="District">
              {districts.length ? districts.map((d) => (
                <FilterOption key={d} on={filters.districts.includes(d)} onClick={() => setFilters({ ...filters, districts: toggleValue(filters.districts, d) })}>
                  {d}
                  <Box component="span" sx={{ ml: 0.6, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
                    {districtCount.get(d)}
                  </Box>
                </FilterOption>
              )) : <FilterEmpty>No item here is tagged with a district.</FilterEmpty>}
            </FilterSection>
          </FiltersButton>
        </Box>
      </Box>
      <FilterChips chips={chips} onClearAll={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} />

      {/* Live search results */}
      {search && (
        <Box component="section" aria-label={`Google News search: ${search.q}`} sx={{ display: "flex", flexDirection: "column", gap: 1.25, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: "12px", backgroundColor: "background.paper" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, minWidth: 0 }}>
              Google News for &ldquo;{search.q}&rdquo;
              {search.items && !search.error && (
                <Box component="span" sx={{ ml: 0.75, fontWeight: 500, color: "text.secondary" }}>
                  {search.items.length} {search.items.length === 1 ? "result" : "results"}
                </Box>
              )}
            </Typography>
            <IconButton size="small" aria-label="Close search results" onClick={() => setSearch(null)} sx={{ borderRadius: "8px" }}>
              <X size={15} />
            </IconButton>
          </Box>
          {!search.items ? (
            <LoadingRows rows={2} height={64} />
          ) : search.error ? (
            <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main" }}>
              {search.error}
            </Typography>
          ) : !search.items.length ? (
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>Nothing found. Try fewer or other words.</Typography>
          ) : (
            <TrendList items={search.items} {...cardProps} />
          )}
        </Box>
      )}

      {staleError && (
        <Typography role="status" sx={{ fontSize: "0.75rem", color: "warning.main" }}>
          Could not update just now: {errorText(staleError)} Showing the last results.
        </Typography>
      )}

      {/* Trends */}
      <Box ref={listRef} onPointerEnter={() => setPointerInList(true)} onPointerLeave={() => setPointerInList(false)} sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <NewStoriesPill count={waiting.length} onShow={showWaiting} top={12} noun={tab.noun} />
        {loadError ? (
          <LoadError error={loadError} onRetry={() => void trends.refresh()} />
        ) : !all ? (
          <LoadingRows rows={3} height={140} />
        ) : !all.length ? (
          <EmptyBox title={`No trending ${tab.label.toLowerCase()} yet`} hint={live ? "The sources are checked every 15 minutes. Refresh to check now." : "Pick a longer time window."} />
        ) : !visible.length ? (
          <EmptyBox title={`No ${tab.label.toLowerCase()} match`} hint={filters.watched && !q ? "Nothing here names your keywords. Add more under Keyword watch, or turn off the Watched filter." : live && q ? "Clear the search or the filters, or press Enter to search Google News." : "Clear the search or the filters to see more."} />
        ) : view === "cards" ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2.5 }}>
            {visible.map((i) => (
              <TrendCard key={i.id} item={i} fresh={highlight.has(i.id)} {...cardProps} />
            ))}
          </Box>
        ) : (
          <TrendList items={visible} highlight={highlight} {...cardProps} />
        )}
      </Box>

      <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice(null)} message={notice?.text} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
      {/* "Create a draft for…": one tile per platform; X makes a real draft, the others open their editor prefilled.
          The dialog reads only the ScraperItem fields (plus district/sourceName); the live source names are wider than
          ScraperItem's platform union, hence the cast. */}
      <CreateDraftDialog item={drafting as ScraperItem | null} open={!!drafting} onClose={() => setDrafting(null)} />
    </Box>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────
function EmptyBox({ title, hint }: { title: string; hint: string }) {
  return (
    <Box sx={{ py: 6, px: 2, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px" }}>
      <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600 }}>{title}</Typography>
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>{hint}</Typography>
    </Box>
  );
}

/** Source groups, in the order the popover lists them. The API sends `group` on each source (newer backends);
 * older answers send names only, so the group is guessed from the name. */
const SOURCE_GROUPS = ["News", "Publisher RSS", "Government", "Trends", "Volume", "Social", "YouTube"] as const;
type SourceGroup = (typeof SOURCE_GROUPS)[number];
const GROUP_TITLE: Record<SourceGroup, string> = { News: "News", "Publisher RSS": "Publishers", Government: "Government", Trends: "Trends", Volume: "Volume", Social: "Social", YouTube: "YouTube" };
/** One source in the list; a whole group of them is a "channel" for YouTube */
const GROUP_NOUN: Partial<Record<SourceGroup, [string, string]>> = { YouTube: ["channel", "channels"] };
const isGroup = (g: unknown): g is SourceGroup => typeof g === "string" && (SOURCE_GROUPS as readonly string[]).includes(g);
function guessGroup(name: string): SourceGroup {
  if (/google news|bing news/i.test(name)) return "News";
  if (/google trends|wikipedia/i.test(name)) return "Trends";
  if (/gdelt/i.test(name)) return "Volume";
  if (/youtube/i.test(name)) return "YouTube";
  if (/reddit/i.test(name)) return "Social";
  if (/\bpib\b|ndma|government|govt/i.test(name)) return "Government";
  return "Publisher RSS";
}
const groupOfSource = (src: TrendSource): SourceGroup => (isGroup(src.group) ? src.group : guessGroup(src.name));
/** Groups with more sources than this start folded */
const FOLD_OVER = 6;

/** A source's error in plain words */
function plainError(raw: string | undefined): string {
  const e = raw ?? "";
  if (/time ?out|timed out|abort/i.test(e)) return "Took too long to answer.";
  if (/\b429\b|rate/i.test(e)) return "Asked too often; it is tried again on the next run.";
  if (/\b40[13]\b|forbidden|unauthori/i.test(e)) return "Refused access.";
  if (/\b404\b|not found/i.test(e)) return "The feed was not found at its address.";
  if (/\b5\d\d\b/.test(e)) return "Its server had an error.";
  if (/ENOTFOUND|EAI_AGAIN|ECONN|network|fetch failed|socket/i.test(e)) return "Could not be reached.";
  if (/parse|xml|json|unexpected token/i.test(e)) return "Sent something that could not be read.";
  return e ? (e.length > 90 ? `${e.slice(0, 89)}…` : e) : "Failed on the last run.";
}

const TONE = { ok: "#2E7D32", some: "#B26A00", most: "#C62828" } as const;
const dot = (color: string) => <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, flexShrink: 0, display: "inline-block" }} />;

/** "7 of 8 sources live · updated 2 min ago": a pill that opens the per-source list. */
function SourceStatus({ live, data, fetchedAt, now, onRetry, retrying }: { live: boolean; data: TrendsResponse | null; fetchedAt: string | null; now: number; onRetry: () => void; retrying: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!live) {
    return (
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.6, height: 24, px: 1, borderRadius: "999px", border: "1px solid", borderColor: "divider", fontSize: "0.6875rem", fontWeight: 600, color: "text.secondary" }}>
        Demo data
      </Box>
    );
  }
  if (!data) return null;
  const sources = data.sources;
  const okCount = sources.filter((s) => s.ok).length;
  const failing = sources.length - okCount;
  const tone = failing === 0 ? TONE.ok : failing * 2 >= sources.length ? TONE.most : TONE.some;
  const summary = `${okCount} of ${sources.length} sources live`;
  const updated = fetchedAt ? `updated ${ago(fetchedAt, now)}` : "";

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        aria-label={`${summary}${updated ? `, ${updated}` : ""}. Show the sources`}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          height: 26,
          px: 1.1,
          border: "1px solid",
          borderColor: failing ? tone : "divider",
          borderRadius: "999px",
          backgroundColor: "background.paper",
          color: "text.primary",
          fontFamily: "inherit",
          fontSize: "0.6875rem",
          fontWeight: 600,
          whiteSpace: "nowrap",
          cursor: "pointer",
          "&:hover": { backgroundColor: "action.hover" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" },
        }}
      >
        {dot(tone)}
        <span>{summary}</span>
        {updated && (
          <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
            {updated}
          </Box>
        )}
      </Box>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { mt: 0.75, width: 360, maxWidth: "calc(100vw - 32px)", maxHeight: "min(560px, 75vh)", borderRadius: "12px", border: "1px solid", borderColor: "divider", backgroundImage: "none" } } }}
      >
        <Box role="dialog" aria-label="Trend sources" sx={{ display: "flex", flexDirection: "column" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>Sources</Typography>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                {summary}
                {updated ? `, ${updated}` : ""}
              </Typography>
            </Box>
            <IconButton size="small" aria-label="Close sources" onClick={() => setAnchor(null)} sx={{ borderRadius: "8px" }}>
              <X size={16} />
            </IconButton>
          </Box>
          <Box sx={{ overflowY: "auto", px: 2, py: 1, display: "flex", flexDirection: "column", gap: 1.25 }}>
            {SOURCE_GROUPS.map((g) => {
              const rows = sources.filter((src) => groupOfSource(src) === g);
              return rows.length ? <SourceGroupRows key={g} group={g} rows={rows} now={now} onRetry={onRetry} retrying={retrying} /> : null;
            })}
          </Box>
        </Box>
      </Popover>
    </>
  );
}

/** One group in the sources popover. A big group (YouTube channels) folds to a summary line. */
function SourceGroupRows({ group, rows, now, onRetry, retrying }: { group: SourceGroup; rows: TrendSource[]; now: number; onRetry: () => void; retrying: boolean }) {
  const [open, setOpen] = useState(rows.length <= FOLD_OVER);
  const okCount = rows.filter((r) => r.ok).length;
  const [one, many] = GROUP_NOUN[group] ?? ["source", "sources"];
  const title = GROUP_TITLE[group];
  const listId = `sources-${group.replace(/\W+/g, "-")}`;
  return (
    <Box component="section" aria-label={title}>
      {rows.length > FOLD_OVER ? (
        <Box
          component="button"
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          sx={{ display: "flex", alignItems: "center", gap: 0.75, width: "100%", p: 0, mb: 0.5, border: 0, background: "none", color: "text.secondary", fontFamily: "inherit", fontSize: "0.6875rem", fontWeight: 700, cursor: "pointer", textAlign: "left", "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" } }}
        >
          {dot(okCount === rows.length ? TONE.ok : okCount * 2 <= rows.length ? TONE.most : TONE.some)}
          <span>
            {title}: {rows.length} {rows.length === 1 ? one : many}, {okCount} live
          </span>
          <Box component="span" aria-hidden sx={{ ml: "auto", fontWeight: 600 }}>
            {open ? "Hide" : "Show"}
          </Box>
        </Box>
      ) : (
        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", mb: 0.5 }}>{title}</Typography>
      )}
      {open && (
        <Box component="ul" id={listId} sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.75 }}>
          {rows.map((src) => (
            <Box component="li" key={src.name} sx={{ display: "grid", gridTemplateColumns: "12px minmax(0, 1fr) auto", columnGap: 1, alignItems: "baseline" }}>
              <Box sx={{ alignSelf: "center" }}>{dot(src.ok ? TONE.ok : TONE.most)}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, overflowWrap: "anywhere" }}>{src.name}</Typography>
                <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                  {src.ok ? `Worked ${ago(src.at, now)}` : `Failed ${ago(src.at, now)}`}
                  {typeof src.items === "number" && src.ok ? `, ${src.items} ${src.items === 1 ? "item" : "items"}` : ""}
                </Typography>
                {!src.ok && <Typography sx={{ fontSize: "0.6875rem", color: "error.main", mt: 0.25 }}>{plainError(src.lastError)}</Typography>}
              </Box>
              {!src.ok && (
                <Button size="small" onClick={onRetry} disabled={retrying} aria-label={`Retry ${src.name}`} sx={{ minHeight: 28, px: 1, fontSize: "0.75rem", fontWeight: 600 }}>
                  Retry
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** An NDMA (disaster) alert carried by the item. Field name assumed `alert` (or `ndmaAlert`) until the contract names it. */
function alertOf(item: TrendItem): string | null {
  const a = item.alert ?? item.ndmaAlert;
  if (!a) return null;
  if (typeof a === "object") return [a.level, a.title].filter(Boolean).join(": ") || "Alert";
  return typeof a === "string" ? a : "Alert";
}
function AlertBadge({ item }: { item: TrendItem }) {
  const text = alertOf(item);
  if (!text) return null;
  return (
    <Box component="span" title={text} sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, px: 0.75, py: "1px", borderRadius: "6px", backgroundColor: "#C62828", color: "#fff", fontSize: "0.6875rem", fontWeight: 800 }}>
      Alert
      <Box component="span" sx={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {text !== "Alert" ? `: ${text}` : ""}
      </Box>
    </Box>
  );
}

const RANK_STYLE: Record<number, { bg: string; fg: string }> = { 1: { bg: "#FEF3C7", fg: "#B45309" }, 2: { bg: "#F1F5F9", fg: "#475569" }, 3: { bg: "#FFEDD5", fg: "#C2410C" } };
function RankBadge({ rank }: { rank: number }) {
  if (!rank) return null;
  const st = RANK_STYLE[rank] ?? { bg: "rgba(255,255,255,0.92)", fg: "#111" };
  return (
    <Box component="span" sx={{ display: "inline-block", px: 0.75, py: "1px", borderRadius: "6px", backgroundColor: st.bg, color: st.fg, fontSize: "0.6875rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
      #{rank}
    </Box>
  );
}

/** The publisher's preview picture (preview only: it is their copyright), or a quiet placeholder. */
function TrendImage({ item, compact }: { item: TrendItem; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = item.imageUrl && !failed ? apiFileUrl(item.imageUrl) : "";
  const Icon = item.type === "articles" ? Newspaper : item.type === "hashtags" ? Hash : Flame;
  return (
    <Box sx={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", backgroundColor: (t) => (t.palette.mode === "light" ? "#EEF0F3" : "#1E1F22"), borderRadius: compact ? "6px" : 0 }}>
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "text.disabled" }}>
          {item.imageUrl ? <ImageOff size={compact ? 14 : 22} aria-hidden /> : <Icon size={compact ? 14 : 22} aria-hidden />}
        </Box>
      )}
      {src && item.imageSource && !compact && (
        <Box component="span" sx={{ position: "absolute", right: 6, bottom: 6, maxWidth: "70%", px: 0.6, borderRadius: "4px", backgroundColor: "rgba(0,0,0,0.6)", color: "#fff", fontSize: "0.625rem", lineHeight: 1.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Photo: {item.imageSource}
        </Box>
      )}
    </Box>
  );
}

function SourceIcon({ platform }: { platform: string }) {
  if (platform === "Google Trends") return <TrendingUp size={12} color="#1A73E8" aria-hidden />;
  if (platform === "YouTube") return <Box component="span" aria-hidden sx={{ width: 12, height: 9, borderRadius: "2px", backgroundColor: "#FF0000", display: "inline-block" }} />;
  return <Globe size={12} color="#1A73E8" aria-hidden />;
}

/** Source, publisher and district on one line */
function SourceLine({ item }: { item: TrendItem }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, flexWrap: "wrap", fontSize: "0.6875rem", color: "text.secondary", minWidth: 0 }}>
      <SourceIcon platform={item.platform} />
      <span>
        {item.platform === "YouTube" && item.sourceName ? (
          <>
            <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
              {item.sourceName}
            </Box>{" "}
            on YouTube
          </>
        ) : item.sourceName && item.sourceName !== item.platform ? (
          `${item.sourceName}, via ${item.platform}`
        ) : (
          item.platform
        )}
      </span>
      {item.district && (
        <Box component="span" sx={{ px: 0.6, borderRadius: "4px", border: "1px solid", borderColor: "divider", fontWeight: 600 }}>
          {item.district}
        </Box>
      )}
    </Box>
  );
}

function Stats({ item }: { item: TrendItem }) {
  const { viewsOrVolume, growthRate, sharesOrPosts } = item.engagementStats;
  if (!viewsOrVolume && !growthRate && !sharesOrPosts) return null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap", fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
      {viewsOrVolume && <span>{viewsOrVolume}</span>}
      {growthRate && (
        <Box component="span" sx={{ color: growthRate.trim().startsWith("-") ? "error.main" : "success.main", fontWeight: 700 }}>
          {growthRate}
        </Box>
      )}
      {sharesOrPosts && <span>{sharesOrPosts}</span>}
    </Box>
  );
}

interface CardActions {
  onDraft: (item: TrendItem) => void;
  now: number;
  hitsOf: (item: TrendItem) => string[];
}

function Actions({ item, onDraft, compact }: Pick<CardActions, "onDraft"> & { item: TrendItem; compact?: boolean }) {
  const btn = { minHeight: 32, px: 1.25, fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" } as const;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", justifyContent: compact ? "flex-end" : "flex-start" }}>
      <Button
        size="small"
        variant="contained"
        disableElevation
        aria-haspopup="dialog"
        onClick={() => onDraft(item)}
        startIcon={<PlusCircle size={13} />}
        sx={{ ...btn, fontWeight: 700, backgroundColor: "text.primary", color: "background.paper", "&:hover": { backgroundColor: "text.primary", opacity: 0.9 } }}
      >
        Create draft
      </Button>
      {item.url && (
        <Button size="small" variant="outlined" component="a" href={item.url} target="_blank" rel="noopener noreferrer" startIcon={<ExternalLink size={13} />} sx={{ ...btn, borderColor: "divider", color: "text.primary" }}>
          Source
        </Button>
      )}
    </Box>
  );
}

function WhyTrending({ text: raw, clamp }: { text: string; clamp?: number }) {
  const text = plain(raw);
  if (!text) return null;
  return (
    <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.5, ...(clamp ? { display: "-webkit-box", WebkitLineClamp: clamp, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }}>
      <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
        Why trending:{" "}
      </Box>
      {text}
    </Typography>
  );
}

function TrendCard({ item, fresh, now, hitsOf, ...actions }: CardActions & { item: TrendItem; fresh: boolean }) {
  return (
    <Box
      component="article"
      sx={{
        backgroundColor: "background.paper",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        ...(fresh ? freshHighlightSx : {}),
      }}
    >
      <Box sx={{ position: "relative" }}>
        <TrendImage item={item} />
        <Box sx={{ position: "absolute", left: 10, top: 10, display: "flex", gap: 0.5 }}>
          <RankBadge rank={item.rank} />
          <AlertBadge item={item} />
        </Box>
      </Box>
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
        <SourceLine item={item} />
        <Typography component="h2" sx={{ fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" }}>
          {item.title}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {item.superTag && <Chip label={item.superTag} size="small" sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px" }} />}
          {item.subTag && item.subTag !== item.superTag && <Chip label={item.subTag} size="small" variant="outlined" sx={{ height: 22, fontSize: "0.6875rem", borderRadius: "6px", maxWidth: 200 }} />}
        </Box>
        <WatchHits hits={hitsOf(item)} />
        <WhyTrending text={item.reasonWhy} clamp={3} />
        <Stats item={item} />
        <ClusterSources item={item} now={now} />
        <Box sx={{ mt: "auto", pt: 1 }}>
          <Actions item={item} {...actions} />
        </Box>
      </Box>
    </Box>
  );
}

function TrendList({ items, highlight, now, hitsOf, ...actions }: CardActions & { items: TrendItem[]; highlight?: ReadonlySet<string> }) {
  return (
    <Box sx={{ backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", overflow: "hidden" }}>
      {items.map((item, i) => (
        <Box
          key={item.id}
          component="article"
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "36px 72px minmax(0, 1fr)", md: "36px 96px minmax(0, 1fr) minmax(0, 0.9fr) auto" },
            gap: 1.5,
            alignItems: "center",
            px: 1.5,
            py: 1.25,
            borderTop: i ? "1px solid" : "none",
            borderColor: "divider",
            ...(highlight?.has(item.id) ? freshHighlightSx : {}),
          }}
        >
          <Box sx={{ alignSelf: "start", pt: 0.25, display: "flex", flexDirection: "column", gap: 0.5, alignItems: "flex-start" }}>
            <RankBadge rank={item.rank} />
            <AlertBadge item={item} />
          </Box>
          <Box sx={{ alignSelf: "start" }}>
            <TrendImage item={item} compact />
            {item.imageUrl && item.imageSource && (
              <Typography sx={{ fontSize: "0.5625rem", color: "text.secondary", mt: 0.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Photo: {item.imageSource}</Typography>
            )}
          </Box>
          <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.4, overflowWrap: "anywhere" }}>{item.title}</Typography>
            <SourceLine item={item} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              {item.superTag && <Chip label={item.superTag} size="small" sx={{ height: 20, fontSize: "0.625rem", fontWeight: 600, borderRadius: "6px" }} />}
              <Stats item={item} />
            </Box>
            <WatchHits hits={hitsOf(item)} />
            {sourceCountOf(item) > 1 && <ClusterSources item={item} now={now} />}
            <Box sx={{ display: { xs: "block", md: "none" } }}>
              <WhyTrending text={item.reasonWhy} clamp={2} />
            </Box>
          </Box>
          <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
            <WhyTrending text={item.reasonWhy} clamp={3} />
          </Box>
          <Box sx={{ gridColumn: { xs: "3", md: "auto" } }}>
            <Actions item={item} {...actions} compact />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
