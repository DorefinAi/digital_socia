"use client";

import React, { useMemo, useRef, useState } from "react";
import ResponsiveTabs from "@/components/Layout/ResponsiveTabs";
import { Box, Typography, Button, CircularProgress, Snackbar, Chip } from "@mui/material";
import { Download, LayoutGrid } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { useThemeMode } from "@/providers/MuiProvider";
import {
  ANALYTICS_PLATFORMS,
  AnalyticsPlatform,
  METRICS,
  REACH_KEY,
  RangeKey,
  bucketRows,
  customPeriod,
  isoDay,
  parseIsoDay,
  periodRows,
  periodText,
  postingHeatmap,
  presetPeriod,
  sumMetric,
  topPosts,
} from "@/data/analyticsData";
import { CardHeading, KpiTile, PostingHeatmap, cardSx } from "./Analytics/AnalyticsParts";
import { exportElementToPdf, formatIndian, slug } from "./Analytics/exportPdf";
import { KPIS, MetricKey, View, bucketValue, display, metricHelp, metricLabel, tone, valueOf } from "./Analytics/metrics";
import { PLATFORM_ICON } from "./Analytics/platformIcons";
import TrendChart, { TrendPoint } from "./Analytics/TrendChart";
import TopPostsCard from "./Analytics/TopPostsCard";
import PlatformTable from "./Analytics/PlatformTable";
import RangePicker, { RangeChoice } from "./Analytics/RangePicker";

const ALL_COLOR = "#3B82F6";
const BREAKDOWN_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#8B5CF6", "#EF4444"];

const pdfDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function DigitalDashboard() {
  const { socialPosts } = useNewsroom();
  const { mode } = useThemeMode();
  const reportRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>("all");
  const [range, setRange] = useState<RangeChoice>("7d");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [metric, setMetric] = useState<MetricKey>("reach");
  const [hidden, setHidden] = useState<AnalyticsPlatform[]>([]);
  const [showPrev, setShowPrev] = useState(true);
  const [heatPlatform, setHeatPlatform] = useState<AnalyticsPlatform>("X");
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");

  const period = useMemo(() => {
    const from = custom && parseIsoDay(custom.from);
    const to = custom && parseIsoDay(custom.to);
    return range === "custom" && from && to ? customPeriod(from, to) : presetPeriod(range === "custom" ? "7d" : range);
  }, [range, custom]);

  const platforms = view === "all" ? ANALYTICS_PLATFORMS : [view];
  const bucket = period.bucket;
  const grid = mode === "light" ? "#EEEEEE" : "#2C2C2C";
  const color = view === "all" ? ALL_COLOR : tone(view, mode);
  const viewLabel = view === "all" ? "All platforms" : view;
  const dates = periodText(period);

  const periods = useMemo(() => Object.fromEntries(ANALYTICS_PLATFORMS.map((p) => [p, periodRows(p, period)])) as Record<AnalyticsPlatform, ReturnType<typeof periodRows>>, [period]);
  const buckets = useMemo(
    () => Object.fromEntries(ANALYTICS_PLATFORMS.map((p) => [p, { cur: bucketRows(periods[p].current, bucket), prev: bucketRows(periods[p].previous, bucket) }])) as Record<AnalyticsPlatform, { cur: ReturnType<typeof bucketRows>; prev: ReturnType<typeof bucketRows> }>,
    [periods, bucket]
  );

  // Totals for the KPI row, summed across the platforms in view
  const total = (key: MetricKey, which: "current" | "previous") => {
    if (key === "rate") {
      const reach = platforms.reduce((s, p) => s + valueOf(p, periods[p][which], "reach"), 0);
      const eng = platforms.reduce((s, p) => s + valueOf(p, periods[p][which], "engagements"), 0);
      return reach ? (eng / reach) * 100 : 0;
    }
    return platforms.reduce((s, p) => s + valueOf(p, periods[p][which], key), 0);
  };

  /** The metric at one chart point over the platforms in view; rates are recomputed from the sums, not averaged. */
  const combined = (key: MetricKey, which: "cur" | "prev", i: number) => {
    const present = platforms.filter((p) => buckets[p][which][i]);
    if (key === "rate") {
      const reach = present.reduce((s, p) => s + bucketValue(p, buckets[p][which][i], "reach"), 0);
      const eng = present.reduce((s, p) => s + bucketValue(p, buckets[p][which][i], "engagements"), 0);
      return reach ? (eng / reach) * 100 : 0;
    }
    return present.reduce((s, p) => s + bucketValue(p, buckets[p][which][i], key), 0);
  };

  const points: TrendPoint[] = buckets.X.cur.map((b, i) => {
    const pt: TrendPoint = { label: b.label, fullLabel: b.fullLabel, prevLabel: buckets.X.prev[i]?.fullLabel ?? "" };
    for (const p of ANALYTICS_PLATFORMS) {
      pt[`cur_${p}`] = +bucketValue(p, buckets[p].cur[i], metric).toFixed(2);
      if (buckets[p].prev[i]) pt[`prev_${p}`] = +bucketValue(p, buckets[p].prev[i], metric).toFixed(2);
    }
    pt.cur_total = +combined(metric, "cur", i).toFixed(2);
    if (buckets.X.prev[i]) pt.prev_total = +combined(metric, "prev", i).toFixed(2);
    return pt;
  });

  // Sparklines: one tinted band per platform in view (stacked for sums)
  const sparkFor = (key: MetricKey) => buckets.X.cur.map((_, i) => Object.fromEntries(platforms.map((p) => [p, bucketValue(p, buckets[p].cur[i], key)])));
  const sparkSeries = platforms.map((p) => ({ key: p, color: tone(p, mode) }));

  // Engagement breakdown: by platform in the overall view, by signal inside a platform
  const breakdown =
    view === "all"
      ? ANALYTICS_PLATFORMS.map((p) => ({ name: p, value: valueOf(p, periods[p].current, "engagements"), color: tone(p, mode) }))
      : METRICS[view]
          .filter((m) => m.key !== REACH_KEY[view] && m.key !== "followers" && m.key !== "watchHours")
          .map((m, i) => ({ name: m.label, value: sumMetric(periods[view].current, m.key), color: BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length] }));

  const comparison = ANALYTICS_PLATFORMS.map((p) => ({ name: p, rate: +valueOf(p, periods[p].current, "rate").toFixed(2), followers: valueOf(p, periods[p].current, "followers") }));

  // Posts published inside the period (the end day counts in full)
  const from = period.start.getTime();
  const to = period.end.getTime() + 86400000;
  const posts = topPosts(socialPosts).filter((p) => {
    const t = new Date(p.postedAt).getTime();
    return (view === "all" || p.platform === view) && t >= from && t < to;
  });

  const segmentSx = {
    "& .MuiToggleButton-root": {
      px: 1.25,
      textTransform: "none",
      fontSize: "0.75rem",
      fontWeight: 600,
      borderColor: "divider",
      "&.Mui-selected": { backgroundColor: mode === "light" ? "#000" : "#fff", color: mode === "light" ? "#fff" : "#000", "&:hover": { backgroundColor: mode === "light" ? "#000" : "#fff" } },
    },
  };

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const datesPdf = `${pdfDay(period.start)} to ${pdfDay(period.end)}`;
      await exportElementToPdf(reportRef.current, {
        // e.g. socia-digital-report_facebook_last-7-days_2026-10-23_to_2026-10-29.pdf
        fileName: `socia-digital-report_${slug(viewLabel)}_${slug(period.label)}_${isoDay(period.start)}_to_${isoDay(period.end)}.pdf`,
        title: `Digital report · ${viewLabel} · ${datesPdf}`,
        subtitle: `${period.label} (${period.days} days), compared with the ${period.days} days before. Demo data. Generated ${new Date().toLocaleString("en-IN", { hour12: false })}`,
        background: mode === "light" ? "#f8f9fa" : "#121212",
      });
    } catch {
      setNotice("The PDF could not be created in this browser. Try again, or use the browser's Print > Save as PDF.");
    }
    setExporting(false);
  };

  return (
    // Right gutter from tablet up keeps the floating assistant button off the cards' right edge
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 2, pr: { md: "72px" }, minWidth: 0 }}>
      {/* Header + controls */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 2, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography component="h1" sx={{ fontWeight: 600, fontSize: "1.125rem" }}>
              Digital Dashboard
            </Typography>
            <Chip
              label="Demo data"
              size="small"
              title="Sample figures until the platform APIs are connected"
              sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 700, borderRadius: "6px", backgroundColor: "#FFF4D6", color: "#7A5300", border: "1px solid #F2D58A" }}
            />
          </Box>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
            {period.label}, {dates}, compared with the {period.days} days before.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <RangePicker
            value={range}
            custom={custom}
            onPreset={(k: RangeKey) => setRange(k)}
            onCustom={(f, t) => {
              setCustom({ from: f, to: t });
              setRange("custom");
            }}
            segmentSx={segmentSx}
          />
          <Button variant="contained" onClick={downloadPdf} disabled={exporting} startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <Download size={15} />} sx={{ height: 36, borderRadius: "8px", fontWeight: 600 }}>
            {exporting ? "Creating PDF" : "Download PDF"}
          </Button>
        </Box>
      </Box>

      <ResponsiveTabs<View>
        value={view}
        onChange={(v) => {
          setView(v);
          setHidden([]);
          if (v !== "all") setHeatPlatform(v);
        }}
        ariaLabel="Platform"
        items={[
          { value: "all", label: "All platforms", icon: <LayoutGrid size={15} /> },
          ...ANALYTICS_PLATFORMS.map((p) => ({ value: p as View, label: p, icon: PLATFORM_ICON[p] })),
        ]}
        tabsSx={{ minHeight: 40, borderBottom: "1px solid", borderColor: "divider", "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600, fontSize: "0.875rem", gap: 0.75 } }}
      />

      {/* Everything inside this box goes into the PDF */}
      <Box ref={reportRef} sx={{ display: "flex", flexDirection: "column", gap: 2.5, backgroundColor: "background.default", p: 0.5, m: -0.5, minWidth: 0 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, gap: 1.5, "& > :last-child": { gridColumn: { xs: "1 / -1", md: "auto" } } }}>
          {KPIS.map((k) => {
            const cur = total(k, "current");
            const prev = total(k, "previous");
            return (
              <KpiTile
                key={k}
                label={metricLabel(view, k)}
                value={cur}
                previous={prev}
                display={display(k, cur)}
                compare={`vs previous ${period.days} days: ${display(k, prev)}`}
                help={metricHelp(view, k, { reach: total("reach", "current"), engagements: total("engagements", "current") })}
                spark={sparkFor(k)}
                series={sparkSeries}
                stacked={k !== "rate"}
                color={color}
                active={metric === k}
                onClick={() => setMetric(k)}
              />
            );
          })}
        </Box>

        {/* Trend */}
        <Box sx={cardSx}>
          <CardHeading title={`${metricLabel(view, metric)} by ${bucket}`} hint={dates}>
            <Box data-pdf-hide="true" sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              {KPIS.map((k) => (
                <Chip key={k} label={metricLabel(view, k)} size="small" onClick={() => setMetric(k)} variant={metric === k ? "filled" : "outlined"} sx={{ height: 26, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px", ...(metric === k && { backgroundColor: color, color: view === "X" && mode === "dark" ? "#000" : "#fff" }) }} />
              ))}
            </Box>
          </CardHeading>
          <TrendChart
            points={points}
            view={view}
            metric={metric}
            bucket={bucket}
            mode={mode}
            hidden={hidden}
            onToggle={(p) => setHidden((h) => (h.includes(p) ? h.filter((x) => x !== p) : [...h, p]))}
            showPrev={showPrev}
            onTogglePrev={() => setShowPrev((s) => !s)}
          />
        </Box>

        <TopPostsCard posts={posts} scope={viewLabel} segmentSx={segmentSx} />

        {/* Best time to post */}
        <Box sx={cardSx}>
          <CardHeading title={`Best time to post · ${heatPlatform}`} hint="Average engagement rate by day and hour, from the last 12 weeks of posts. Darker is better.">
            {view === "all" && (
              <Box data-pdf-hide="true" sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }} role="group" aria-label="Platform for best time to post">
                {ANALYTICS_PLATFORMS.map((p) => (
                  <Chip key={p} label={p} size="small" onClick={() => setHeatPlatform(p)} aria-pressed={heatPlatform === p} variant={heatPlatform === p ? "filled" : "outlined"} sx={{ height: 26, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px" }} />
                ))}
              </Box>
            )}
          </CardHeading>
          <PostingHeatmap grid={postingHeatmap(heatPlatform)} color={tone(heatPlatform, mode)} />
        </Box>

        <PlatformTable periods={periods} view={view} days={period.days} mode={mode} />

        {/* Breakdown + posting volume */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "1fr 1.4fr" }, gap: 2 }}>
          <Box sx={cardSx}>
            <CardHeading title={view === "all" ? "Engagements by platform" : "What people engaged with"} hint={view === "all" ? "Click a slice to open that platform." : dates} />
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
                      <Cell key={b.name} fill={b.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [formatIndian(Number(v)), name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Box>

          <Box sx={cardSx}>
            <CardHeading
              title={view === "all" ? "Platforms side by side" : "Posts published"}
              hint={view === "all" ? "Engagement rate (%, left axis) and follower growth (right axis)" : `Per ${bucket}, ${dates}`}
            />
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
                  <BarChart data={buckets[view].cur.map((b) => ({ label: b.label, posts: b.posts }))} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} minTickGap={16} />
                    <YAxis axisLine={false} tickLine={false} fontSize={10} width={40} />
                    <Tooltip formatter={(v) => [Number(v).toLocaleString("en-IN"), "Posts"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="posts" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </Box>
          </Box>
        </Box>
      </Box>

      <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice("")} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
