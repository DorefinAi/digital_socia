"use client";

import React from "react";
import { Box, Typography } from "@mui/material";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ANALYTICS_PLATFORMS, AnalyticsPlatform, BucketKind } from "@/data/analyticsData";
import { formatIndianWords, indianAxisUnit } from "./exportPdf";
import { MetricKey, View, metricLabel, tone } from "./metrics";

/** One chart point: `cur_<platform>` / `prev_<platform>` per platform plus `cur_total` / `prev_total`. */
export type TrendPoint = { label: string; fullLabel: string; prevLabel: string } & Record<string, number | string>;

const PREV_GREY = { light: "#6B7280", dark: "#9CA3AF" };

function exact(metric: MetricKey, v: number) {
  if (metric === "rate") return `${v.toFixed(2)}%`;
  const words = formatIndianWords(v);
  return v >= 1000 ? `${words} (${Math.round(v).toLocaleString("en-IN")})` : words;
}

/** Dashed or solid line sample for the legend and tooltip rows. */
function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <Box component="svg" aria-hidden width={18} height={8} viewBox="0 0 18 8" sx={{ flexShrink: 0 }}>
      <line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth={2.25} strokeDasharray={dashed ? "4 3" : undefined} strokeLinecap="round" />
    </Box>
  );
}

function TrendTooltip({ point, metric, view, platforms, showPrev, mode }: { point: TrendPoint; metric: MetricKey; view: View; platforms: AnalyticsPlatform[]; showPrev: boolean; mode: "light" | "dark" }) {
  const row = (key: string, color: string, name: string, v: number, dashed = false) => (
    <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 0.75, py: 0.2 }}>
      <Swatch color={color} dashed={dashed} />
      <Box component="span" sx={{ color: "text.secondary", flexShrink: 0 }}>{name}</Box>
      <Box component="span" sx={{ ml: "auto", pl: 1.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{exact(metric, v)}</Box>
    </Box>
  );
  return (
    <Box sx={{ backgroundColor: "background.paper", color: "text.primary", border: "1px solid", borderColor: "divider", borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", p: 1.25, fontSize: "0.75rem", minWidth: 220, maxWidth: 320 }}>
      <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, mb: 0.5 }}>{point.fullLabel}</Typography>
      {view === "all"
        ? platforms.map((p) => row(p, tone(p, mode), p, Number(point[`cur_${p}`])))
        : row("cur", tone(view, mode), metricLabel(view, metric), Number(point.cur_total))}
      {showPrev && point.prevLabel && (
        <>
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.75, mb: 0.25 }}>Previous period: {point.prevLabel}</Typography>
          {view === "all"
            ? platforms.map((p) => row(`prev-${p}`, tone(p, mode), p, Number(point[`prev_${p}`]), true))
            : row("prev", PREV_GREY[mode], metricLabel(view, metric), Number(point.prev_total), true)}
        </>
      )}
    </Box>
  );
}

export default function TrendChart({
  points,
  view,
  metric,
  bucket,
  mode,
  hidden,
  onToggle,
  showPrev,
  onTogglePrev,
}: {
  points: TrendPoint[];
  view: View;
  metric: MetricKey;
  bucket: BucketKind;
  mode: "light" | "dark";
  hidden: AnalyticsPlatform[];
  onToggle: (p: AnalyticsPlatform) => void;
  showPrev: boolean;
  onTogglePrev: () => void;
}) {
  const visible = view === "all" ? ANALYTICS_PLATFORMS.filter((p) => !hidden.includes(p)) : [];
  const keys = view === "all" ? visible.flatMap((p) => [`cur_${p}`, ...(showPrev ? [`prev_${p}`] : [])]) : ["cur_total", ...(showPrev ? ["prev_total"] : [])];
  const max = Math.max(0, ...points.flatMap((pt) => keys.map((k) => Number(pt[k]) || 0)));
  const unit = metric === "rate" ? { divisor: 1, word: "", note: "" } : indianAxisUnit(max);
  const color = view === "all" ? "" : tone(view, mode);
  const grid = mode === "light" ? "#EEEEEE" : "#2C2C2C";
  const tick = mode === "light" ? "#6B7280" : "#9CA3AF";
  const yCaption =
    metric === "rate" ? `${metricLabel(view, metric)}, in %` : `${metricLabel(view, metric)}${unit.word ? `, in ${unit.word === "thousand" ? "thousands" : unit.word}` : ""}${unit.note ? ` (${unit.note})` : ""}`;
  const xCaption = { day: "Day", week: "Week starting", month: "Month" }[bucket];

  const legendBtn = { display: "inline-flex", alignItems: "center", gap: 0.75, px: 1, minHeight: 32, border: "1px solid", borderColor: "divider", borderRadius: "6px", background: "none", color: "text.primary", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", "&[aria-pressed='false']": { opacity: 0.45, textDecoration: "line-through" }, "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: 1 } } as const;

  return (
    <Box>
      {/* Legend: what each line is; buttons hide or show a line */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 1.25 }} role="group" aria-label="Lines on the chart">
        {view === "all" ? (
          ANALYTICS_PLATFORMS.map((p) => (
            <Box key={p} component="button" type="button" aria-pressed={!hidden.includes(p)} onClick={() => onToggle(p)} sx={legendBtn}>
              <Swatch color={tone(p, mode)} />
              {p}
            </Box>
          ))
        ) : (
          <Box sx={{ ...legendBtn, cursor: "default", borderColor: "transparent", px: 0.5 }}>
            <Swatch color={color} />
            This period
          </Box>
        )}
        <Box component="button" type="button" aria-pressed={showPrev} onClick={onTogglePrev} sx={legendBtn}>
          <Swatch color={view === "all" ? tick : PREV_GREY[mode]} dashed />
          Previous period (dashed)
        </Box>
      </Box>

      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mb: 0.5 }}>{yCaption}</Typography>
      <Box sx={{ height: { xs: 240, sm: 280 } }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color || "#000"} stopOpacity={0.22} />
                <stop offset="95%" stopColor={color || "#000"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={grid} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: tick }} minTickGap={16} height={36} label={{ value: xCaption, position: "insideBottom", offset: 0, fontSize: 10, fill: tick }} />
            <YAxis
              axisLine={false}
              tickLine={false}
              fontSize={10}
              tick={{ fill: tick }}
              width={44}
              tickFormatter={(v: number) => (metric === "rate" ? `${v}%` : (v / unit.divisor).toLocaleString("en-IN", { maximumFractionDigits: 1 }))}
            />
            <Tooltip
              cursor={{ stroke: tick, strokeDasharray: "3 3" }}
              content={(p) => {
                const point = p.active ? (p.payload?.[0]?.payload as TrendPoint | undefined) : undefined;
                return point ? <TrendTooltip point={point} metric={metric} view={view} platforms={visible} showPrev={showPrev} mode={mode} /> : null;
              }}
            />
            {view === "all"
              ? visible.flatMap((p) => [
                  ...(showPrev ? [<Line key={`prev-${p}`} type="monotone" dataKey={`prev_${p}`} stroke={tone(p, mode)} strokeOpacity={0.45} strokeDasharray="5 4" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />] : []),
                  <Line key={p} type="monotone" dataKey={`cur_${p}`} stroke={tone(p, mode)} strokeWidth={2} dot={bucket !== "day"} isAnimationActive={false} />,
                ])
              : [
                  ...(showPrev ? [<Line key="prev" type="monotone" dataKey="prev_total" stroke={PREV_GREY[mode]} strokeDasharray="5 4" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />] : []),
                  <Area key="cur" type="monotone" dataKey="cur_total" stroke={color} fill="url(#trendFill)" strokeWidth={2} dot={bucket !== "day"} isAnimationActive={false} />,
                ]}
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
