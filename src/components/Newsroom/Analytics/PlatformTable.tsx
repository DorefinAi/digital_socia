"use client";

import React from "react";
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { ANALYTICS_PLATFORMS, AnalyticsPlatform, DayRow } from "@/data/analyticsData";
import { CardHeading, Delta, cardSx } from "./AnalyticsParts";
import { formatIndian } from "./exportPdf";
import { View, valueOf } from "./metrics";
import { PLATFORM_ICON } from "./platformIcons";

interface Row {
  key: string;
  name: string;
  icon?: React.ReactNode;
  reach: number;
  prevReach: number;
  engagements: number;
  rate: number;
  followers: number;
  posts: number;
}

const COLUMNS: { key: keyof Row; label: string; fmt: (r: Row) => React.ReactNode }[] = [
  { key: "reach", label: "Impressions", fmt: (r) => formatIndian(r.reach) },
  { key: "engagements", label: "Engagements", fmt: (r) => formatIndian(r.engagements) },
  { key: "rate", label: "Rate", fmt: (r) => `${r.rate.toFixed(2)}%` },
  { key: "followers", label: "Followers", fmt: (r) => `+${formatIndian(r.followers)}` },
  { key: "posts", label: "Posts", fmt: (r) => formatIndian(r.posts) },
  { key: "prevReach", label: "Change", fmt: (r) => <Delta current={r.reach} previous={r.prevReach} /> },
];

/** Each platform's period totals side by side, with a total row; cards instead of a table on phones. */
export default function PlatformTable({ periods, view, days, mode }: { periods: Record<AnalyticsPlatform, { current: DayRow[]; previous: DayRow[] }>; view: View; days: number; mode: "light" | "dark" }) {
  const rows: Row[] = ANALYTICS_PLATFORMS.map((p) => ({
    key: p,
    name: p,
    icon: PLATFORM_ICON[p],
    reach: valueOf(p, periods[p].current, "reach"),
    prevReach: valueOf(p, periods[p].previous, "reach"),
    engagements: valueOf(p, periods[p].current, "engagements"),
    rate: valueOf(p, periods[p].current, "rate"),
    followers: valueOf(p, periods[p].current, "followers"),
    posts: valueOf(p, periods[p].current, "posts"),
  }));
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const total: Row = { key: "total", name: "All platforms", reach: sum("reach"), prevReach: sum("prevReach"), engagements: sum("engagements"), rate: (sum("engagements") / (sum("reach") || 1)) * 100, followers: sum("followers"), posts: sum("posts") };
  const highlight = mode === "light" ? "#F5F5F5" : "#1E1E1E";
  const isActive = (r: Row) => (view === "all" ? r.key === "total" : r.key === view);

  return (
    <Box sx={cardSx}>
      <CardHeading
        title="By platform"
        hint={`Totals for the selected range. Change compares impressions with the previous ${days} days. Impressions means views on YouTube and reach on Instagram and Facebook.`}
      />

      {/* Phones: one compact card per platform */}
      <Box sx={{ display: { xs: "grid", md: "none" }, gap: 1 }}>
        {[...rows, total].map((r) => (
          <Box key={r.key} sx={{ border: "1px solid", borderColor: isActive(r) ? "text.primary" : "divider", borderRadius: "8px", p: 1.25, backgroundColor: r.key === "total" ? highlight : "transparent" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
              {r.icon}
              <Typography sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>{r.name}</Typography>
              <Box sx={{ ml: "auto" }}>
                <Delta current={r.reach} previous={r.prevReach} />
              </Box>
            </Box>
            <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.75, m: 0 }}>
              {COLUMNS.filter((c) => c.key !== "prevReach").map((c) => (
                <Box key={c.key} sx={{ minWidth: 0 }}>
                  <Typography component="dt" sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{c.label}</Typography>
                  <Typography component="dd" sx={{ m: 0, fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{c.fmt(r)}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>

      {/* Tablet and up: the table */}
      <Box sx={{ display: { xs: "none", md: "block" } }}>
        <Table size="small" sx={{ tableLayout: "fixed" }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: "22%" }}>Platform</TableCell>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{c.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {[...rows, total].map((r) => (
              <TableRow key={r.key} sx={{ backgroundColor: isActive(r) ? highlight : "transparent", "& td, & th": { fontWeight: r.key === "total" ? 700 : 500, borderBottom: r.key === "total" ? "none" : undefined } }}>
                <TableCell component="th" scope="row" sx={{ fontSize: "0.8125rem", fontWeight: "inherit" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontWeight: r.key === "total" ? 700 : 600 }}>
                    {r.icon}
                    {r.name}
                  </Box>
                </TableCell>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} align="right" sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>{c.fmt(r)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
