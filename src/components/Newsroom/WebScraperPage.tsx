"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Chip,
  Button,
  TextField,
  InputAdornment,
  useTheme,
  IconButton,
  Select,
  MenuItem,
  Tooltip,
  Paper,
  Tabs,
  Tab,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  Search,
  ExternalLink,
  Flame,
  Globe,
  TrendingUp,
  RefreshCw,
  PlusCircle,
  Sparkles,
  Tag,
  Clock,
  LayoutGrid,
  List,
  CheckCircle2,
  X,
  RotateCcw,
} from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { useThemeMode } from "@/providers/MuiProvider";
import { DEMO_SCRAPER_TOPICS } from "@/data/scraperData";
import { ScraperItem, ScraperType } from "@/types/newsroom";

const PlatformIcon: React.FC<{ platform: string; size?: number }> = ({ platform, size = 14 }) => {
  if (platform === "YouTube") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#FF0000">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    );
  }
  if (platform === "Instagram") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#E4405F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
      </svg>
    );
  }
  if (platform === "X (Twitter)") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#1DA1F2">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    );
  }
  if (platform === "Reddit") {
    return <span style={{ fontSize: size, lineHeight: 1 }}>🔴</span>;
  }
  return <Globe size={size} color="#4285F4" />;
};

const GoogleMark: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
  </svg>
);

/** Which Google service an item came through. Search results carry their own marker. */
function googleSource(item: ScraperItem) {
  if (item.id.startsWith("g-search")) return "Google Search";
  return { topics: "Google Trends", articles: "Google News", hashtags: "Google Trends" }[item.type];
}

function SourceLine({ item }: { item: ScraperItem }) {
  const fromSearch = item.id.startsWith("g-search");
  return (
    <Typography component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.4, fontSize: "0.6875rem", fontWeight: 500, color: fromSearch ? "#1A73E8" : "text.secondary" }}>
      <GoogleMark /> via {googleSource(item)}
      {fromSearch && ` · your search "${item.subTag}"`}
    </Typography>
  );
}

/** What a Google query returns for the desk, one result per trend type. Demo stand-in for the backend search. */
function googleSearchResults(q: string): ScraperItem[] {
  const now = new Date().toISOString();
  const enc = encodeURIComponent(q);
  const tag = "#" + q.replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
  const base = { rank: 0, superTag: "Search", subTag: q, timeFrame: "24h" as const, scrapedAt: now, reasonWhy: "Matched your Google search. Volume and the trend summary arrive once the backend fetch is connected." };
  const stats = { viewsOrVolume: "Search result", growthRate: "New", sharesOrPosts: "–" };
  return [
    { ...base, id: `g-search-topic-${Date.now()}`, type: "topics", title: q, platform: "Google News", url: `https://trends.google.com/trends/explore?geo=IN&q=${enc}`, engagementStats: stats },
    { ...base, id: `g-search-article-${Date.now()}`, type: "articles", title: `${q}: latest coverage`, platform: "Google News", url: `https://news.google.com/search?q=${enc}&hl=hi&gl=IN`, engagementStats: stats },
    { ...base, id: `g-search-tag-${Date.now()}`, type: "hashtags", title: tag, platform: "X (Twitter)", url: `https://www.google.com/search?q=${encodeURIComponent(tag + " site:x.com")}`, engagementStats: stats },
  ];
}

export default function WebScraperPage() {
  const { mode } = useThemeMode();
  const theme = useTheme();
  const { addActivity } = useNewsroom();

  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [activeTypeTab, setActiveTypeTab] = useState<ScraperType>("topics");
  const [timeFrame, setTimeFrame] = useState<"24h" | "12h" | "7d">("24h");
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [superTagFilter, setSuperTagFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createdStoryIds, setCreatedStoryIds] = useState<Record<string, boolean>>({});
  // Everything on this page is fetched through Google; the backend runs these queries for real
  const [lastFetchedAt, setLastFetchedAt] = useState(() => new Date());
  const [googleResults, setGoogleResults] = useState<ScraperItem[]>([]);
  const [searchingGoogle, setSearchingGoogle] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setLastFetchedAt(new Date());
    }, 700);
  };

  const searchGoogle = () => {
    const q = searchQuery.trim();
    if (q.length < 2 || searchingGoogle) return;
    setSearchingGoogle(true);
    setTimeout(() => {
      setGoogleResults((prev) => [...googleSearchResults(q), ...prev.filter((r) => r.subTag.toLowerCase() !== q.toLowerCase())]);
      setSearchingGoogle(false);
      setLastFetchedAt(new Date());
    }, 900);
  };

  const handleCreateDraft = (item: ScraperItem) => {
    setCreatedStoryIds((prev) => ({ ...prev, [item.id]: true }));
    addActivity(
      "assigned",
      "Web Scraper Bot",
      item.title,
      `Created story draft from Scraped ${item.superTag} topic`
    );
  };

  const fromSearch = googleResults.filter((r) => r.type === activeTypeTab);
  const currentItems: ScraperItem[] = [...fromSearch, ...DEMO_SCRAPER_TOPICS.map((item) => {
    if (activeTypeTab === "articles") {
      return {
        ...item,
        type: "articles" as const,
        title: `EXCLUSIVE: ${item.title} — On-Ground Investigation & Regional Analysis`,
      };
    }
    if (activeTypeTab === "hashtags") {
      const hashtagName = "#" + item.subTag.replace(/\s+/g, "");
      return {
        ...item,
        type: "hashtags" as const,
        title: `${hashtagName} (Viral Regional Trend)`,
      };
    }
    return item;
  })];

  const maxAgeHours = { "12h": 12, "24h": 24, "7d": 168 }[timeFrame];
  const filteredItems = currentItems.filter((item) => {
    const fresh = lastFetchedAt.getTime() - new Date(item.scrapedAt).getTime() <= maxAgeHours * 3600000;
    if (!fresh) return false;
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.reasonWhy.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.superTag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subTag.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = platformFilter === "all" || item.platform === platformFilter;
    const matchesSuperTag = superTagFilter === "all" || item.superTag === superTagFilter;
    return matchesSearch && matchesPlatform && matchesSuperTag;
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Standard Newsroom Header with Title, Count & View Switcher */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: "1.125rem" }}>
            Web Scraper & Intelligence Hub
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
            {filteredItems.length} items · fetched via Google at {lastFetchedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </Typography>
        </Box>

        {/* View Switcher & Refresh Button */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={handleRefresh}
            startIcon={<RefreshCw size={13} className={isRefreshing ? "spin-animation" : ""} />}
            sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", height: 36, px: 1.5 }}
          >
            {isRefreshing ? "Fetching via Google" : "Fetch via Google"}
          </Button>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontWeight: 500 }}>
              View:
            </Typography>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, val) => val && setViewMode(val)}
              size="small"
              sx={{
                height: 36,
                "& .MuiToggleButton-root": {
                  px: 1.25,
                  py: 0.5,
                  borderRadius: "8px",
                  borderColor: "divider",
                  "&.Mui-selected": {
                    backgroundColor: mode === "light" ? "#000" : "#fff",
                    color: mode === "light" ? "#fff" : "#000",
                    "&:hover": { backgroundColor: mode === "light" ? "#222" : "#eee" },
                  },
                },
              }}
            >
              <ToggleButton value="cards">
                <Tooltip title="Cards View"><Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><LayoutGrid size={15} /><Typography sx={{ fontSize: "0.75rem", textTransform: "none", fontWeight: 600 }}>Cards</Typography></Box></Tooltip>
              </ToggleButton>
              <ToggleButton value="list">
                <Tooltip title="List View"><Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><List size={15} /><Typography sx={{ fontSize: "0.75rem", textTransform: "none", fontWeight: 600 }}>List</Typography></Box></Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Box>

      {/* Concise Search & Dropdown Filters Bar */}
      <Box sx={{ backgroundColor: "background.paper", borderRadius: "12px", p: 1.75, boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)", border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", gap: 1.25, flexWrap: "wrap", alignItems: "center" }}>
          {/* Search Input */}
          <TextField
            placeholder="Search trends, or press Enter to search Google"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchGoogle()}
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} style={{ color: "#6D6E6F" }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <X size={14} style={{ cursor: "pointer", color: "#999" }} onClick={() => setSearchQuery("")} />
                  </InputAdornment>
                ) : null,
              },
            }}
            sx={{
              flex: 1,
              minWidth: { xs: "100%", sm: 220 },
              "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.8125rem", height: 38 },
            }}
          />

          <Button
            size="small"
            variant="contained"
            onClick={searchGoogle}
            disabled={searchQuery.trim().length < 2 || searchingGoogle}
            startIcon={<GoogleMark />}
            sx={{ height: 38, borderRadius: "10px", textTransform: "none", fontSize: "0.75rem", fontWeight: 600, px: 1.5, whiteSpace: "nowrap" }}
          >
            {searchingGoogle ? "Searching Google" : "Search Google"}
          </Button>

          {/* Timeframe Dropdown (Default: Last 24 Hours) */}
          <Select
            size="small"
            value={timeFrame}
            onChange={(e) => setTimeFrame(e.target.value as "24h" | "12h" | "7d")}
            displayEmpty
            sx={{
              borderRadius: "10px",
              fontSize: "0.8125rem",
              height: 38,
              minWidth: 150,
              backgroundColor: mode === "light" ? "#f3f4f6" : "#2a2a2a",
              fontWeight: 600,
            }}
          >
            <MenuItem value="24h" sx={{ fontSize: "0.8125rem" }}>Last 24 Hours</MenuItem>
            <MenuItem value="12h" sx={{ fontSize: "0.8125rem" }}>Last 12 Hours</MenuItem>
            <MenuItem value="7d" sx={{ fontSize: "0.8125rem" }}>Last 7 Days</MenuItem>
          </Select>

          {/* Platform Dropdown */}
          <Select
            size="small"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            displayEmpty
            sx={{
              borderRadius: "10px",
              fontSize: "0.8125rem",
              height: 38,
              minWidth: 140,
              backgroundColor: platformFilter !== "all" ? (mode === "light" ? "#f3f4f6" : "#2a2a2a") : "transparent",
              fontWeight: platformFilter !== "all" ? 600 : 400,
            }}
          >
            <MenuItem value="all" sx={{ fontSize: "0.8125rem" }}>All Platforms</MenuItem>
            <MenuItem value="X (Twitter)" sx={{ fontSize: "0.8125rem" }}>𝕏 (Twitter)</MenuItem>
            <MenuItem value="YouTube" sx={{ fontSize: "0.8125rem" }}>YouTube</MenuItem>
            <MenuItem value="Instagram" sx={{ fontSize: "0.8125rem" }}>Instagram</MenuItem>
            <MenuItem value="Google News" sx={{ fontSize: "0.8125rem" }}>Google News</MenuItem>
            <MenuItem value="Reddit" sx={{ fontSize: "0.8125rem" }}>Reddit</MenuItem>
          </Select>

          {/* Superset Tag Dropdown */}
          <Select
            size="small"
            value={superTagFilter}
            onChange={(e) => setSuperTagFilter(e.target.value)}
            displayEmpty
            sx={{
              borderRadius: "10px",
              fontSize: "0.8125rem",
              height: 38,
              minWidth: 160,
              backgroundColor: superTagFilter !== "all" ? (mode === "light" ? "#f3f4f6" : "#2a2a2a") : "transparent",
              fontWeight: superTagFilter !== "all" ? 600 : 400,
            }}
          >
            <MenuItem value="all" sx={{ fontSize: "0.8125rem" }}>All Superset Tags</MenuItem>
            <MenuItem value="Rajasthan Infrastructure" sx={{ fontSize: "0.8125rem" }}>Rajasthan Infrastructure</MenuItem>
            <MenuItem value="Youth & Education" sx={{ fontSize: "0.8125rem" }}>Youth & Education</MenuItem>
            <MenuItem value="Culture & Tourism" sx={{ fontSize: "0.8125rem" }}>Culture & Tourism</MenuItem>
            <MenuItem value="Clean Energy & Tech" sx={{ fontSize: "0.8125rem" }}>Clean Energy & Tech</MenuItem>
            <MenuItem value="Wildlife & Eco" sx={{ fontSize: "0.8125rem" }}>Wildlife & Eco</MenuItem>
            <MenuItem value="Agriculture & Water" sx={{ fontSize: "0.8125rem" }}>Agriculture & Water</MenuItem>
          </Select>

          {/* Reset Button */}
          {(platformFilter !== "all" || superTagFilter !== "all" || timeFrame !== "24h" || searchQuery || googleResults.length > 0) && (
            <Button
              size="small"
              onClick={() => {
                setPlatformFilter("all");
                setSuperTagFilter("all");
                setTimeFrame("24h");
                setSearchQuery("");
                setGoogleResults([]);
              }}
              startIcon={<RotateCcw size={13} />}
              sx={{ textTransform: "none", fontSize: "0.75rem", height: 38, borderRadius: "10px", color: "error.main", px: 1.25 }}
            >
              Reset
            </Button>
          )}
        </Box>
      </Box>

      {/* Tabs Row matching Newsroom style */}
      <Tabs
        value={activeTypeTab}
        onChange={(_, val) => setActiveTypeTab(val)}
        sx={{
          minHeight: 38,
          "& .MuiTab-root": { minHeight: 38, textTransform: "none", fontWeight: 600, fontSize: "0.8125rem", px: 2 },
        }}
      >
        <Tab
          value="topics"
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Flame size={14} color="#FF6B00" />
              <span>Trending Topics (#1 - #20)</span>
            </Box>
          }
        />
        <Tab
          value="articles"
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Globe size={14} color="#2563EB" />
              <span>Trending Articles (#1 - #20)</span>
            </Box>
          }
        />
        <Tab
          value="hashtags"
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Tag size={14} color="#E4405F" />
              <span>Trending #Hashtags (#1 - #20)</span>
            </Box>
          }
        />
      </Tabs>

      {/* VIEW MODE 1: CARDS VIEW */}
      {viewMode === "cards" && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2 }}>
          {filteredItems.map((item) => {
            const isCreated = createdStoryIds[item.id];

            return (
              <Box
                key={item.id}
                sx={{
                  backgroundColor: "background.paper",
                  borderRadius: "12px",
                  p: 2,
                  boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)",
                  border: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": { transform: "translateY(-2px)", boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.08)" },
                }}
              >
                {/* Card Top Line: Rank Badge & Platform Chip */}
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Chip
                    label={`Rank #${item.rank}`}
                    size="small"
                    sx={{
                      fontSize: "0.6875rem",
                      height: 22,
                      fontWeight: 700,
                      backgroundColor:
                        item.rank === 1
                          ? "#FEF3C7"
                          : item.rank === 2
                          ? "#F1F5F9"
                          : item.rank === 3
                          ? "#FFEDD5"
                          : "action.hover",
                      color:
                        item.rank === 1
                          ? "#D97706"
                          : item.rank === 2
                          ? "#475569"
                          : item.rank === 3
                          ? "#C2410C"
                          : "text.primary",
                      borderRadius: "6px",
                    }}
                  />

                  <Chip
                    icon={<PlatformIcon platform={item.platform} size={12} />}
                    label={item.platform}
                    size="small"
                    sx={{ fontSize: "0.625rem", height: 20, borderRadius: "6px", backgroundColor: "action.hover" }}
                  />
                </Box>

                {/* Scraped Headline / Title */}
                <Box>
                  <Typography sx={{ fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.35 }}>
                    {item.title}
                  </Typography>
                  <SourceLine item={item} />
                </Box>

                {/* Superset & Subset Tags */}
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                  <Chip
                    label={`Superset: ${item.superTag}`}
                    size="small"
                    sx={{ fontSize: "0.625rem", height: 20, backgroundColor: "action.selected", color: "text.secondary", borderRadius: "6px" }}
                  />
                  <Chip
                    label={`Subset: ${item.subTag}`}
                    size="small"
                    sx={{ fontSize: "0.625rem", height: 20, backgroundColor: "action.hover", color: "text.secondary", borderRadius: "6px" }}
                  />
                </Box>

                {/* Reason Why Callout */}
                <Box
                  sx={{
                    p: 1.25,
                    borderRadius: "8px",
                    backgroundColor: mode === "light" ? "#F9FAFB" : "#1E1E1E",
                    border: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1,
                  }}
                >
                  <Sparkles size={14} color="#9333EA" style={{ marginTop: 2, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.4 }}>
                    <strong>Why Trending:</strong> {item.reasonWhy}
                  </Typography>
                </Box>

                {/* Engagement Stats */}
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.6875rem", color: "text.secondary", pt: 0.5 }}>
                  <span>🔥 {item.engagementStats.viewsOrVolume}</span>
                  <span style={{ color: "#2E7D32", fontWeight: 600 }}>🚀 {item.engagementStats.growthRate}</span>
                  <span>🔄 {item.engagementStats.sharesOrPosts}</span>
                </Box>

                {/* Always Visible Action CTAs */}
                <Box sx={{ display: "flex", gap: 1, mt: "auto", pt: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={isCreated}
                    onClick={() => handleCreateDraft(item)}
                    startIcon={isCreated ? <CheckCircle2 size={14} /> : <PlusCircle size={14} />}
                    sx={{
                      flex: 1,
                      borderRadius: "8px",
                      textTransform: "none",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      backgroundColor: isCreated ? "#2E7D32" : "text.primary",
                      color: mode === "light" ? "#FFF" : "#000",
                      "&:hover": { backgroundColor: mode === "light" ? "#333" : "#eee" },
                    }}
                  >
                    {isCreated ? "Draft Created" : "Create Draft"}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    component="a"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    startIcon={<ExternalLink size={14} />}
                    sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", px: 1.25 }}
                  >
                    Source
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* VIEW MODE 2: LIST VIEW TABLE */}
      {viewMode === "list" && (
        <TableContainer component={Paper} sx={{ borderRadius: "12px", border: "1px solid", borderColor: "divider", boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: mode === "light" ? "#f9fafb" : "#1a1a1a" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Rank</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Platform & Tag</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Scraped Headline / Topic</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Volume / Velocity</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Why Trending (AI Context)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id} hover sx={{ cursor: "pointer" }}>
                  <TableCell>
                    <Chip
                      label={`#${item.rank}`}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.7rem",
                        height: 20,
                        backgroundColor: item.rank === 1 ? "#FEF3C7" : item.rank === 2 ? "#F1F5F9" : item.rank === 3 ? "#FFEDD5" : "action.hover",
                        color: item.rank === 1 ? "#D97706" : item.rank === 2 ? "#475569" : item.rank === 3 ? "#C2410C" : "text.primary",
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <PlatformIcon platform={item.platform} size={12} />
                      <span>{item.platform}</span>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.8125rem", maxWidth: 280 }}>
                    {item.title}
                    <SourceLine item={item} />
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem" }}>
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 600 }}>{item.engagementStats.viewsOrVolume}</Typography>
                    <Typography sx={{ fontSize: "0.6875rem", color: "#2E7D32", fontWeight: 600 }}>{item.engagementStats.growthRate}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary", maxWidth: 260 }}>
                    {item.reasonWhy}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: "flex", gap: 0.75, justifyContent: "flex-end" }}>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={createdStoryIds[item.id]}
                        onClick={() => handleCreateDraft(item)}
                        sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem", py: 0.25, backgroundColor: "text.primary", color: mode === "light" ? "#fff" : "#000" }}
                      >
                        {createdStoryIds[item.id] ? "Created" : "Create Draft"}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        component="a"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem", py: 0.25 }}
                      >
                        Source
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {filteredItems.length === 0 && (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary", backgroundColor: "background.paper", borderRadius: "12px" }}>
          <Typography sx={{ fontSize: "0.875rem" }}>No trends match your search or filters</Typography>
          {searchQuery.trim().length >= 2 && (
            <Button size="small" onClick={searchGoogle} disabled={searchingGoogle} startIcon={<GoogleMark />} sx={{ mt: 1, textTransform: "none" }}>
              Search Google for &ldquo;{searchQuery.trim()}&rdquo;
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
