"use client";

// Small pieces of the Analytics page (/analytics): stat tiles, titled cards, labelled bar lists, the
// hour chart and the "Sample data" badge. Bars are plain HTML so the numbers stay readable as text.

import React from "react";
import { Box, Tooltip as MuiTooltip, Typography, useTheme } from "@mui/material";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cardSx } from "./AnalyticsParts";

export const COLOR = { received: "#94A3B8", posted: "#3B82F6", rejected: "#EF4444", approved: "#10B981" } as const;

const n = new Intl.NumberFormat("en-IN");
export const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "–" : n.format(Math.round(v)));
export const pct = (rate: number | null | undefined, digits = 1) => (rate === null || rate === undefined ? "–" : `${(rate * 100).toFixed(digits)}%`);
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** One number with its label and an optional line under it */
export function StatTile({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: string }) {
  return (
    <Box sx={{ ...cardSx, display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0, position: "relative", overflow: "hidden" }}>
      {accent && <Box aria-hidden sx={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: "0 3px 3px 0", backgroundColor: accent }} />}
      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{value}</Typography>
      {note && <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{note}</Typography>}
    </Box>
  );
}

/** A titled card; `aside` sits at the right of the title (a hint or a control) */
export function ChartCard({ title, subtitle, aside, children, sx }: { title: string; subtitle?: string; aside?: React.ReactNode; children: React.ReactNode; sx?: object }) {
  return (
    <Box component="section" aria-label={title} sx={{ ...cardSx, display: "flex", flexDirection: "column", gap: 1.25, minWidth: 0, ...sx }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" sx={{ fontWeight: 600, fontSize: "0.875rem" }}>
            {title}
          </Typography>
          {subtitle && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{subtitle}</Typography>}
        </Box>
        {aside}
      </Box>
      {children}
    </Box>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", py: 2 }}>{children}</Typography>;
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Shown at the right instead of the plain value */
  display?: string;
  /** A second, quieter figure after the value */
  note?: string;
}

/** Label, bar and number per row; the longest bar is the largest value. Shows `limit` rows with a toggle for the rest. */
export function BarList({ rows, color = COLOR.posted, limit = 8, empty }: { rows: BarRow[]; color?: string; limit?: number; empty: string }) {
  const [all, setAll] = React.useState(false);
  if (!rows.length) return <EmptyNote>{empty}</EmptyNote>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <Box>
      <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.9 }}>
        {shown.map((r) => (
          <Box component="li" key={r.key} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: 1.5, rowGap: 0.4, alignItems: "baseline" }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>
              {r.label}
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" }}>
              {r.display ?? fmt(r.value)}
              {r.note && (
                <Box component="span" sx={{ ml: 0.75, fontWeight: 500, color: "text.secondary", fontSize: "0.75rem" }}>
                  {r.note}
                </Box>
              )}
            </Typography>
            <Box aria-hidden sx={{ gridColumn: "1 / -1", height: 6, borderRadius: 3, backgroundColor: "action.hover", overflow: "hidden" }}>
              <Box sx={{ width: `${Math.max(2, (r.value / max) * 100)}%`, height: "100%", borderRadius: 3, backgroundColor: color }} />
            </Box>
          </Box>
        ))}
      </Box>
      {rows.length > limit && (
        <Box
          component="button"
          type="button"
          onClick={() => setAll((a) => !a)}
          aria-expanded={all}
          sx={{ mt: 1.25, p: 0, border: 0, background: "none", color: "text.secondary", fontFamily: "inherit", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", "&:hover": { color: "text.primary" }, "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" } }}
        >
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </Box>
      )}
    </Box>
  );
}

/** 24 bars, one per IST hour; the best hour is drawn in full colour. `value` decides the bar, `label` the tooltip. */
export function HourBars({ data, color = COLOR.posted, label, ariaLabel }: { data: { hour: number; value: number }[]; color?: string; label: (v: number) => string; ariaLabel: string }) {
  const theme = useTheme();
  const best = data.reduce((b, d) => (d.value > b.value ? d : b), { hour: -1, value: -Infinity });
  const axis = theme.palette.text.secondary;
  return (
    <Box role="img" aria-label={ariaLabel} sx={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
          <XAxis dataKey="hour" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: axis }} interval={2} tickFormatter={(h: number) => String(h).padStart(2, "0")} />
          <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: axis }} allowDecimals={false} width={44} tickFormatter={(v: number) => label(v)} />
          <Tooltip
            cursor={{ fill: theme.palette.action.hover }}
            formatter={(v) => [label(Number(v)), ""]}
            labelFormatter={(h) => `${hourLabel(Number(h))} IST`}
            separator=""
            contentStyle={{ borderRadius: 8, fontSize: 12, background: theme.palette.background.paper, borderColor: theme.palette.divider, color: theme.palette.text.primary }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.hour} fill={color} fillOpacity={d.hour === best.hour ? 1 : 0.35} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

/** "Sample data": the platform numbers are made up until real access arrives */
export function SampleBadge({ title = "These platform numbers are samples, made up from the post ids. Real numbers appear once the platform accounts are connected." }: { title?: string }) {
  return (
    <MuiTooltip title={title} arrow>
      <Box
        component="span"
        tabIndex={0}
        aria-label={`Sample data. ${title}`}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.6,
          height: 24,
          px: 1,
          borderRadius: "999px",
          border: "1px dashed",
          borderColor: "#B26A00",
          color: (t) => (t.palette.mode === "light" ? "#7A4800" : "#FFCC80"),
          fontSize: "0.6875rem",
          fontWeight: 700,
          whiteSpace: "nowrap",
          cursor: "help",
          "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" },
        }}
      >
        Sample data
      </Box>
    </MuiTooltip>
  );
}
