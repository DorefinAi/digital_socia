"use client";

import React from "react";
import { Box, IconButton, Typography, Tooltip } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export const cardSx = {
  backgroundColor: "background.paper",
  borderRadius: "12px",
  p: 2,
  boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)",
  border: "1px solid",
  borderColor: "divider",
};

/** Section title + one-line explanation, as every card on the dashboard opens. */
export function CardHeading({ title, hint, children }: { title: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h2" sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{title}</Typography>
        {hint && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{hint}</Typography>}
      </Box>
      {children}
    </Box>
  );
}

export function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, px: 0.6, py: 0.1, borderRadius: "6px", fontSize: "0.6875rem", fontWeight: 700, whiteSpace: "nowrap", backgroundColor: up ? "#E8F5E9" : "#FFEBEE", color: up ? "#2E7D32" : "#C62828" }}>
      {up ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
      <span>
        <Box component="span" sx={visuallyHidden}>{up ? "up " : "down "}</Box>
        {Math.abs(pct).toFixed(1)}%
      </span>
    </Box>
  );
}

export const visuallyHidden = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

/** Small "i" button; the explanation opens on hover, focus or tap. Left out of the PDF. */
export function InfoTip({ text, label, sx }: { text: string; label: string; sx?: SxProps<Theme> }) {
  return (
    <Tooltip title={text} arrow placement="top" enterTouchDelay={0} leaveTouchDelay={8000} slotProps={{ tooltip: { sx: { fontSize: "0.75rem", lineHeight: 1.45, maxWidth: 280, p: 1.25 } } }}>
      <IconButton aria-label={label} size="small" data-pdf-hide="true" sx={{ width: 28, height: 28, color: "text.secondary", "&:hover": { color: "text.primary" }, ...sx }}>
        <Info size={14} />
      </IconButton>
    </Tooltip>
  );
}

export interface SparkSeries {
  key: string;
  color: string;
}

/**
 * Metric tile: big number, change against the previous period, the previous figure,
 * and a sparkline tinted in the platform colour(s). Click selects it for the main chart.
 */
export function KpiTile({
  label,
  value,
  previous,
  display,
  compare,
  help,
  spark,
  series,
  stacked,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  previous: number;
  display: string;
  /** "vs 2.01 Cr, previous 7 days" */
  compare: string;
  help: string;
  spark: Record<string, number>[];
  series: SparkSeries[];
  /** Stack the platforms (sums); off for rates, which overlap instead */
  stacked: boolean;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Box sx={{ position: "relative", minWidth: 0 }}>
      <Box
        component="button"
        onClick={onClick}
        aria-pressed={active}
        sx={{
          ...cardSx,
          width: "100%",
          height: "100%",
          textAlign: "left",
          fontFamily: "inherit",
          color: "text.primary",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          borderColor: active ? color : "divider",
          boxShadow: active ? `0 0 0 1px ${color}` : cardSx.boxShadow,
          transition: "border-color 0.2s, box-shadow 0.2s",
          "&:hover": { boxShadow: active ? `0 0 0 1px ${color}` : "0px 8px 24px rgba(0, 0, 0, 0.08)" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: 2 },
        }}
      >
        <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "text.secondary", pr: 3 }}>{label}</Typography>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
          <Typography component="span" sx={{ fontSize: "1.375rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{display}</Typography>
          <Delta current={value} previous={previous} />
        </Box>
        <Typography component="span" sx={{ fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums", lineHeight: 1.35 }}>{compare}</Typography>
        <Box aria-hidden sx={{ height: 34, mx: -0.5, mt: "auto" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              {series.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stackId={stacked ? "a" : undefined} stroke={`${s.color}A6`} fill={`${s.color}2E`} strokeWidth={1.25} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Box>
      <InfoTip text={help} label={`How ${label.toLowerCase()} is counted`} sx={{ position: "absolute", top: 6, right: 6 }} />
    </Box>
  );
}

// Monday first, as the desk plans its week
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LEVELS = [0.1, 0.3, 0.5, 0.72, 0.95];

export const hourText = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
const slotText = (d: number, h: number) => `${DAY_LONG[d]}, ${hourText(h)} – ${hourText((h + 1) % 24)}`;

/**
 * 7 × 24 grid of average engagement rate in five shades, Monday first, hours in IST.
 * The best slot is outlined and named above the grid with the two runners-up.
 */
export function PostingHeatmap({ grid, color }: { grid: number[][]; color: string }) {
  const all = grid.flat();
  const min = Math.min(...all);
  const max = Math.max(...all);
  const level = (v: number) => Math.min(LEVELS.length - 1, Math.floor(((v - min) / (max - min || 1)) * LEVELS.length));
  const ranked = grid.flatMap((row, d) => row.map((v, h) => ({ d, h, v }))).sort((a, b) => b.v - a.v);
  const best = ranked[0];
  const step = (max - min) / LEVELS.length;

  return (
    <Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 2, rowGap: 0.5, mb: 1.5 }}>
        <Typography sx={{ fontSize: "0.875rem" }}>
          Best slot: <b>{slotText(best.d, best.h)}</b>
          <Box component="span" sx={{ color: "text.secondary" }}> ({best.v.toFixed(1)}% average engagement)</Box>
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          Also strong: {ranked.slice(1, 3).map((s) => `${DAY_SHORT[s.d]} ${hourText(s.h)} (${s.v.toFixed(1)}%)`).join(", ")}
        </Typography>
      </Box>

      {/* Cells shrink with the card, with thinner gaps and fewer hour labels on phones,
          so the whole week fits without a sideways scroll */}
      <Box role="img" aria-label={`Engagement by day and hour. Best slot ${slotText(best.d, best.h)}, ${best.v.toFixed(1)} percent.`}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "30px repeat(24, minmax(0, 1fr))", sm: "38px repeat(24, minmax(0, 1fr))" }, gap: { xs: "2px", sm: "3px" }, alignItems: "center" }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <Typography key={h} aria-hidden sx={{ fontSize: "0.625rem", color: "text.secondary", whiteSpace: "nowrap", overflow: "visible", lineHeight: 1.6, height: 16 }}>
              <Box component="span" sx={{ display: { xs: h % 6 === 0 ? "inline" : "none", sm: h % 3 === 0 ? "inline" : "none" } }}>{hourText(h)}</Box>
            </Typography>
          ))}
          {ORDER.map((d) => (
            <React.Fragment key={d}>
              <Typography aria-hidden sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "text.secondary" }}>{DAY_SHORT[d]}</Typography>
              {grid[d].map((v, h) => {
                const isBest = d === best.d && h === best.h;
                return (
                  <Tooltip key={h} title={`${slotText(d, h)} · ${v.toFixed(1)}% average engagement`} placement="top" arrow disableInteractive>
                    <Box
                      sx={{
                        position: "relative",
                        height: { xs: 16, sm: 20 },
                        borderRadius: "3px",
                        "&::before": { content: '""', position: "absolute", inset: 0, borderRadius: "inherit", backgroundColor: color, opacity: LEVELS[level(v)] },
                        outline: isBest ? "2px solid" : "none",
                        outlineColor: "text.primary",
                        outlineOffset: 1,
                        zIndex: isBest ? 1 : 0,
                        "&:hover": { outline: "2px solid", outlineColor: "text.primary" },
                      }}
                    />
                  </Tooltip>
                );
              })}
            </React.Fragment>
          ))}
        </Box>
      </Box>

      {/* Legend: the five shades and the range each covers */}
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5, mt: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>Lower</Typography>
          {LEVELS.map((o, i) => (
            <Tooltip key={o} title={`${(min + step * i).toFixed(1)}% – ${(min + step * (i + 1)).toFixed(1)}%`} arrow disableInteractive>
              <Box sx={{ position: "relative", width: 22, height: 12, borderRadius: "3px", "&::before": { content: '""', position: "absolute", inset: 0, borderRadius: "inherit", backgroundColor: color, opacity: o } }} />
            </Tooltip>
          ))}
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
            Higher engagement ({min.toFixed(1)}% to {max.toFixed(1)}%)
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: "3px", border: "2px solid", borderColor: "text.primary" }} />
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>Best slot. Times in IST.</Typography>
        </Box>
      </Box>
    </Box>
  );
}
