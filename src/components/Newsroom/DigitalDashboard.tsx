"use client";

import React, { useMemo, useRef, useState } from "react";
import { Box, Typography, Button, Tabs, Tab, ToggleButtonGroup, ToggleButton, CircularProgress, Snackbar, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Link as MuiLink } from "@mui/material";
import { Download, ExternalLink, LayoutGrid } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { useThemeMode } from "@/providers/MuiProvider";
import {
  ANALYTICS_PLATFORMS,
  AnalyticsPlatform,
  METRICS,
  PLATFORM_COLOR,
  RANGES,
  REACH_KEY,
  RangeKey,
  bucketRows,
  periodRows,
  postingHeatmap,
  sumMetric,
  topPosts,
} from "@/data/analyticsData";
import { InstagramIcon, XIcon } from "./BreakingDesk/shared";
import { KpiTile, PostingHeatmap, cardSx } from "./Analytics/AnalyticsParts";
import { exportElementToPdf, formatIndian } from "./Analytics/exportPdf";

type View = "all" | AnalyticsPlatform;
type MetricKey = "reach" | "engagements" | "rate" | "followers" | "posts";

const YoutubeIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#FF0000" aria-hidden>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const PLATFORM_ICON: Record<AnalyticsPlatform, React.ReactNode> = {
  X: <XIcon size={14} />,
  YouTube: <YoutubeIcon size={16} />,
  Instagram: <InstagramIcon size={15} color="#D62976" />,
};

const ALL_COLOR = "#3B82F6";
const BREAKDOWN_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#8B5CF6", "#EF4444"];

function metricLabel(view: View, key: MetricKey) {
  const reach = view === "all" ? "Total reach" : METRICS[view].find((m) => m.key === REACH_KEY[view])!.label;
  return { reach, engagements: "Engagements", rate: "Engagement rate", followers: view === "YouTube" ? "Subscriber growth" : "Follower growth", posts: "Posts published" }[key];
}

/** Value of a metric for one platform over a set of day rows (or a chart bucket). */
function valueOf(platform: AnalyticsPlatform, rows: Parameters<typeof sumMetric>[0], key: MetricKey) {
  const reach = sumMetric(rows, REACH_KEY[platform]);
  if (key === "reach") return reach;
  if (key === "engagements") return sumMetric(rows, "engagements");
  if (key === "rate") return reach ? (sumMetric(rows, "engagements") / reach) * 100 : 0;
  if (key === "followers") return sumMetric(rows, "followers");
  return sumMetric(rows, "posts");
}

const display = (key: MetricKey, v: number) => (key === "rate" ? `${v.toFixed(2)}%` : formatIndian(v));

export default function DigitalDashboard() {
  const { socialPosts } = useNewsroom();
  const { mode } = useThemeMode();
  const reportRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>("all");
  const [range, setRange] = useState<RangeKey>("7d");
  const [metric, setMetric] = useState<MetricKey>("reach");
  const [hidden, setHidden] = useState<AnalyticsPlatform[]>([]);
  const [heatPlatform, setHeatPlatform] = useState<AnalyticsPlatform>("X");
  const [sort, setSort] = useState<{ by: "reach" | "engagements" | "rate" | "postedAt"; dir: "asc" | "desc" }>({ by: "reach", dir: "desc" });
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  // The page reads the clock once; ranges are measured back from when it opened
  const [openedAt] = useState(() => Date.now());

  const platforms = view === "all" ? ANALYTICS_PLATFORMS : [view];
  const bucket = RANGES[range].bucket;
  const grid = mode === "light" ? "#EEEEEE" : "#2C2C2C";
  const color = view === "all" ? ALL_COLOR : PLATFORM_COLOR[view];

  const periods = useMemo(() => Object.fromEntries(ANALYTICS_PLATFORMS.map((p) => [p, periodRows(p, range)])) as Record<AnalyticsPlatform, ReturnType<typeof periodRows>>, [range]);

  // Totals for the KPI row, summed across the platforms in view
  const total = (key: MetricKey, which: "current" | "previous") => {
    if (key === "rate") {
      const reach = platforms.reduce((s, p) => s + valueOf(p, periods[p][which], "reach"), 0);
      const eng = platforms.reduce((s, p) => s + valueOf(p, periods[p][which], "engagements"), 0);
      return reach ? (eng / reach) * 100 : 0;
    }
    return platforms.reduce((s, p) => s + valueOf(p, periods[p][which], key), 0);
  };

  // Chart points: one entry per day or week, with a value per platform and the previous period for comparison
  const series = (() => {
    const per = Object.fromEntries(
      ANALYTICS_PLATFORMS.map((p) => {
        const cur = bucketRows(periods[p].current, bucket);
        const prev = bucketRows(periods[p].previous, bucket);
        return [p, { cur, prev }];
      })
    ) as Record<AnalyticsPlatform, { cur: ReturnType<typeof bucketRows>; prev: ReturnType<typeof bucketRows> }>;
    const bucketValue = (p: AnalyticsPlatform, b: ReturnType<typeof bucketRows>[number], key: MetricKey) => {
      const reach = b.values[REACH_KEY[p]] ?? 0;
      if (key === "reach") return reach;
      if (key === "engagements") return b.engagements;
      if (key === "rate") return reach ? (b.engagements / reach) * 100 : 0;
      if (key === "followers") return b.values.followers ?? 0;
      return b.posts;
    };
    return per.X.cur.map((b, i) => {
      const point: Record<string, number | string> = { label: b.label };
      let sum = 0;
      let prevSum = 0;
      for (const p of platforms) {
        const v = bucketValue(p, per[p].cur[i], metric);
        point[p] = +v.toFixed(2);
        sum += v;
        prevSum += per[p].prev[i] ? bucketValue(p, per[p].prev[i], metric) : 0;
      }
      point.value = +(metric === "rate" ? sum / platforms.length : sum).toFixed(2);
      point.previous = +(metric === "rate" ? prevSum / platforms.length : prevSum).toFixed(2);
      return point;
    });
  })();

  const sparkFor = (key: MetricKey) =>
    bucketRows(periods[platforms[0]].current, bucket).map((_, i) =>
      platforms.reduce((s, p) => {
        const b = bucketRows(periods[p].current, bucket)[i];
        const reach = b.values[REACH_KEY[p]] ?? 0;
        const v = key === "reach" ? reach : key === "engagements" ? b.engagements : key === "rate" ? (reach ? (b.engagements / reach) * 100 : 0) : key === "followers" ? b.values.followers ?? 0 : b.posts;
        return s + v;
      }, 0)
    );

  // Engagement breakdown: by platform in the overall view, by signal inside a platform
  const breakdown =
    view === "all"
      ? ANALYTICS_PLATFORMS.map((p) => ({ name: p, value: valueOf(p, periods[p].current, "engagements"), color: PLATFORM_COLOR[p] }))
      : METRICS[view]
          .filter((m) => m.key !== REACH_KEY[view] && m.key !== "followers" && m.key !== "watchHours")
          .map((m, i) => ({ name: m.label, value: sumMetric(periods[view].current, m.key), color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }));

  const comparison = ANALYTICS_PLATFORMS.map((p) => ({
    name: p,
    rate: +valueOf(p, periods[p].current, "rate").toFixed(2),
    followers: valueOf(p, periods[p].current, "followers"),
    color: PLATFORM_COLOR[p],
  }));

  const since = openedAt - RANGES[range].days * 86400000;
  const posts = topPosts(socialPosts)
    .filter((p) => (view === "all" || p.platform === view) && new Date(p.postedAt).getTime() >= since)
    .sort((a, b) => {
      const av = sort.by === "postedAt" ? new Date(a.postedAt).getTime() : a[sort.by];
      const bv = sort.by === "postedAt" ? new Date(b.postedAt).getTime() : b[sort.by];
      return sort.dir === "desc" ? bv - av : av - bv;
    })
    .slice(0, 10);

  const kpis: MetricKey[] = ["reach", "engagements", "rate", "followers", "posts"];
  const viewLabel = view === "all" ? "All platforms" : view;

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await exportElementToPdf(reportRef.current, {
        fileName: `socia-digital-report-${view.toLowerCase()}-${range}-${stamp}.pdf`,
        title: `Socia · Digital report · ${viewLabel}`,
        subtitle: `${RANGES[range].label}, compared with the period before · generated ${new Date().toLocaleString("en-IN", { hour12: false })}`,
        background: mode === "light" ? "#f8f9fa" : "#121212",
      });
    } catch {
      setNotice("The PDF could not be created in this browser. Try again, or use the browser's Print > Save as PDF.");
    }
    setExporting(false);
  };

  const sortHeader = (by: typeof sort.by, label: string) => (
    <TableSortLabel active={sort.by === by} direction={sort.by === by ? sort.dir : "desc"} onClick={() => setSort((s) => ({ by, dir: s.by === by && s.dir === "desc" ? "asc" : "desc" }))}>
      {label}
    </TableSortLabel>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 2 }}>
      {/* Header + controls */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem" }}>
            Digital Dashboard
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
            {RANGES[range].label}, compared with the {RANGES[range].days} days before. Demo figures until the platform APIs are connected.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <ToggleButtonGroup
            value={range}
            exclusive
            size="small"
            onChange={(_, v) => v && setRange(v)}
            aria-label="Date range"
            sx={{ height: 36, "& .MuiToggleButton-root": { px: 1.5, textTransform: "none", fontSize: "0.75rem", fontWeight: 600, borderColor: "divider", "&.Mui-selected": { backgroundColor: mode === "light" ? "#000" : "#fff", color: mode === "light" ? "#fff" : "#000", "&:hover": { backgroundColor: mode === "light" ? "#000" : "#fff" } } } }}
          >
            <ToggleButton value="7d">7 days</ToggleButton>
            <ToggleButton value="4w">4 weeks</ToggleButton>
            <ToggleButton value="1m">1 month</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="contained" onClick={downloadPdf} disabled={exporting} startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={15} />} sx={{ height: 36, borderRadius: "8px", fontWeight: 600 }}>
            {exporting ? "Creating PDF" : "Download PDF"}
          </Button>
        </Box>
      </Box>

      <Tabs
        value={view}
        onChange={(_, v) => {
          setView(v);
          setHidden([]);
          if (v !== "all") setHeatPlatform(v);
        }}
        variant="scrollable"
        scrollButtons={false}
        sx={{ minHeight: 40, borderBottom: "1px solid", borderColor: "divider", "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", gap: 0.75 } }}
      >
        <Tab value="all" icon={<LayoutGrid size={15} />} iconPosition="start" label="All platforms" />
        {ANALYTICS_PLATFORMS.map((p) => (
          <Tab key={p} value={p} icon={<Box sx={{ display: "flex" }}>{PLATFORM_ICON[p]}</Box>} iconPosition="start" label={p} />
        ))}
      </Tabs>

      {/* Everything inside this box goes into the PDF */}
      <Box ref={reportRef} sx={{ display: "flex", flexDirection: "column", gap: 2.5, backgroundColor: "background.default", p: 0.5, m: -0.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" }, gap: 1.5 }}>
          {kpis.map((k) => (
            <KpiTile key={k} label={metricLabel(view, k)} value={total(k, "current")} previous={total(k, "previous")} display={display(k, total(k, "current"))} spark={sparkFor(k)} color={color} active={metric === k} onClick={() => setMetric(k)} />
          ))}
        </Box>

        {/* Trend */}
        <Box sx={cardSx}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>
              {metricLabel(view, metric)} {bucket === "week" ? "by week" : "by day"}
            </Typography>
            <Box data-pdf-hide="true" sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              {kpis.map((k) => (
                <Chip key={k} label={metricLabel(view, k)} size="small" onClick={() => setMetric(k)} variant={metric === k ? "filled" : "outlined"} sx={{ height: 24, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px", ...(metric === k && { backgroundColor: color, color: "#fff" }) }} />
              ))}
            </Box>
          </Box>
          <Box sx={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              {view === "all" ? (
                <LineChart data={series} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} minTickGap={16} />
                  <YAxis axisLine={false} tickLine={false} fontSize={10} tickFormatter={(v) => display(metric, v)} width={56} />
                  <Tooltip formatter={(v, name) => [display(metric, Number(v)), name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend
                    onClick={(e) => {
                      const p = e.dataKey as AnalyticsPlatform;
                      setHidden((h) => (h.includes(p) ? h.filter((x) => x !== p) : [...h, p]));
                    }}
                    formatter={(value) => <span style={{ fontSize: 12, cursor: "pointer", opacity: hidden.includes(value as AnalyticsPlatform) ? 0.4 : 1 }}>{value}</span>}
                    iconType="circle"
                    iconSize={8}
                  />
                  {ANALYTICS_PLATFORMS.map((p) => (
                    <Line key={p} type="monotone" dataKey={p} stroke={PLATFORM_COLOR[p]} strokeWidth={2} dot={bucket === "week"} hide={hidden.includes(p)} isAnimationActive={false} />
                  ))}
                </LineChart>
              ) : (
                <AreaChart data={series} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} minTickGap={16} />
                  <YAxis axisLine={false} tickLine={false} fontSize={10} tickFormatter={(v) => display(metric, v)} width={56} />
                  <Tooltip formatter={(v, name) => [display(metric, Number(v)), name === "previous" ? "Previous period" : "This period"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend formatter={(value) => <span style={{ fontSize: 12 }}>{value === "previous" ? "Previous period" : "This period"}</span>} iconType="circle" iconSize={8} />
                  <Area type="monotone" dataKey="previous" stroke={mode === "light" ? "#9CA3AF" : "#6B7280"} strokeDasharray="5 4" fill="none" strokeWidth={1.5} isAnimationActive={false} />
                  <Area type="monotone" dataKey="value" stroke={color === "#111111" && mode === "dark" ? "#E5E7EB" : color} fill="url(#trendFill)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </Box>
          {view === "all" && <Typography data-pdf-hide="true" sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.5 }}>Click a platform in the legend to hide or show it.</Typography>}
        </Box>

        {/* Breakdown + comparison */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "1fr 1.4fr" }, gap: 2 }}>
          <Box sx={cardSx}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{view === "all" ? "Engagements by platform" : "What people engaged with"}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 1 }}>{view === "all" ? "Click a slice to open that platform." : RANGES[range].label}</Typography>
            <Box sx={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                    isAnimationActive={false}
                    onClick={(d) => view === "all" && ANALYTICS_PLATFORMS.includes(d.name as AnalyticsPlatform) && (setView(d.name as AnalyticsPlatform), setHeatPlatform(d.name as AnalyticsPlatform))}
                    style={{ cursor: view === "all" ? "pointer" : "default" }}
                  >
                    {breakdown.map((b) => (
                      <Cell key={b.name} fill={b.color === "#111111" && mode === "dark" ? "#E5E7EB" : b.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [formatIndian(Number(v)), name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Box>

          <Box sx={cardSx}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{view === "all" ? "Platforms side by side" : "Posts published"}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 1 }}>{view === "all" ? "Engagement rate (%) and follower growth" : `${bucket === "week" ? "Per week" : "Per day"}, ${RANGES[range].label.toLowerCase()}`}</Typography>
            <Box sx={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                {view === "all" ? (
                  <BarChart data={comparison} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={11} />
                    <YAxis yAxisId="rate" axisLine={false} tickLine={false} fontSize={10} tickFormatter={(v) => `${v}%`} width={40} />
                    <YAxis yAxisId="followers" orientation="right" axisLine={false} tickLine={false} fontSize={10} tickFormatter={(v) => formatIndian(v)} width={48} />
                    <Tooltip formatter={(v, name) => (name === "Engagement rate" ? [`${v}%`, name] : [formatIndian(Number(v)), name])} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>} iconType="circle" iconSize={8} />
                    <Bar yAxisId="rate" dataKey="rate" name="Engagement rate" fill={ALL_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar yAxisId="followers" dataKey="followers" name="Follower growth" fill="#10B981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                ) : (
                  <BarChart data={bucketRows(periods[view].current, bucket).map((b) => ({ label: b.label, posts: b.posts }))} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} minTickGap={16} />
                    <YAxis axisLine={false} tickLine={false} fontSize={10} width={40} />
                    <Tooltip formatter={(v) => [Number(v).toLocaleString("en-IN"), "Posts"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="posts" fill={color === "#111111" && mode === "dark" ? "#E5E7EB" : color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </Box>
          </Box>
        </Box>

        {/* Best time to post */}
        <Box sx={cardSx}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Best time to post · {heatPlatform}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Average engagement rate by day and hour. Hover a cell for the figure.</Typography>
            </Box>
            {view === "all" && (
              <Box data-pdf-hide="true" sx={{ display: "flex", gap: 0.5 }}>
                {ANALYTICS_PLATFORMS.map((p) => (
                  <Chip key={p} label={p} size="small" onClick={() => setHeatPlatform(p)} variant={heatPlatform === p ? "filled" : "outlined"} sx={{ height: 24, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px" }} />
                ))}
              </Box>
            )}
          </Box>
          <PostingHeatmap grid={postingHeatmap(heatPlatform)} color={PLATFORM_COLOR[heatPlatform] === "#111111" && mode === "dark" ? "#E5E7EB" : PLATFORM_COLOR[heatPlatform]} />
        </Box>

        {/* Top posts */}
        <Box sx={{ ...cardSx, p: 0, overflow: "hidden" }}>
          <Box sx={{ p: 2, pb: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Top posts · {viewLabel}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{RANGES[range].label}. Click a column to sort.</Typography>
          </Box>
          <TableContainer>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: mode === "light" ? "#f9fafb" : "#1a1a1a" }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Post</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{sortHeader("postedAt", "Published")}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{sortHeader("reach", "Reach / views")}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{sortHeader("engagements", "Engagements")}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{sortHeader("rate", "Rate")}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Link</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {posts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 4, textAlign: "center", color: "text.secondary" }}>
                      No posts in this range. Try a wider range.
                    </TableCell>
                  </TableRow>
                )}
                {posts.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ maxWidth: 380 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                        <Box sx={{ width: 56, height: 36, flexShrink: 0, borderRadius: "4px", overflow: "hidden", backgroundColor: "#111" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.thumbUrl && <img src={p.thumbUrl} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            {PLATFORM_ICON[p.platform]}
                            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</Typography>
                          </Box>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>{new Date(p.postedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatIndian(p.reach)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>{formatIndian(p.engagements)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>{p.rate.toFixed(2)}%</TableCell>
                    <TableCell align="right">
                      <MuiLink href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Open post" sx={{ display: "inline-flex", color: "text.secondary" }}>
                        <ExternalLink size={15} />
                      </MuiLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Box>

      <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice("")} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
