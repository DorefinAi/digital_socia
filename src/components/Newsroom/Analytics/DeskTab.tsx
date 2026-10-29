"use client";

// "Desk": our own numbers for the range (GET /analytics/desk): what came in, what went out, what was
// rejected and why, when we post, and who did the work.

import React, { useState } from "react";
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, useTheme } from "@mui/material";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DeskAnalytics } from "@/lib/socia/analytics";
import { BarList, ChartCard, COLOR, EmptyNote, fmt, hourLabel, HourBars, pct, StatTile } from "./parts";

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

type EditorSort = "name" | "approved" | "posted" | "rejected";

export default function DeskTab({ data }: { data: DeskAnalytics }) {
  const theme = useTheme();
  const t = data.totals;
  const perDay = data.perDay ?? [];
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, value: (data.byHour ?? []).find((h) => h.hour === hour)?.posted ?? 0 }));
  const bestHour = byHour.reduce((b, d) => (d.value > b.value ? d : b), byHour[0]);
  const postedTotal = byHour.reduce((s, d) => s + d.value, 0);
  const rejectTotal = (data.rejectReasons ?? []).reduce((s, r) => s + r.count, 0);

  const [sort, setSort] = useState<{ by: EditorSort; dir: "asc" | "desc" }>({ by: "posted", dir: "desc" });
  const editors = [...(data.byEditor ?? [])].sort((a, b) => {
    const d = sort.by === "name" ? a.name.localeCompare(b.name) : a[sort.by] - b[sort.by];
    return sort.dir === "asc" ? d : -d;
  });
  const sortHeader = (by: EditorSort, label: string, numeric = true) => (
    <TableCell align={numeric ? "right" : "left"} sortDirection={sort.by === by ? sort.dir : false} sx={{ fontWeight: 700, fontSize: "0.75rem", whiteSpace: "nowrap" }}>
      <TableSortLabel active={sort.by === by} direction={sort.by === by ? sort.dir : numeric ? "desc" : "asc"} onClick={() => setSort((s) => ({ by, dir: s.by === by ? (s.dir === "desc" ? "asc" : "desc") : numeric ? "desc" : "asc" }))}>
        {label}
      </TableSortLabel>
    </TableCell>
  );

  if (!t.received && !t.posted && !t.rejected) {
    return (
      <Box sx={{ py: 6, px: 2, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "12px" }}>
        <EmptyNote>No stories came in during these dates. Pick a longer range.</EmptyNote>
      </Box>
    );
  }

  const axis = theme.palette.text.secondary;
  const share = (v: number) => (t.received ? `${Math.round((v / t.received) * 100)}% of received` : undefined);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, gap: 1.5 }}>
        <StatTile label="Received" value={fmt(t.received)} note="Stories into the desk" accent={COLOR.received} />
        <StatTile label="Approved" value={fmt(t.approved)} note={share(t.approved)} accent={COLOR.approved} />
        <StatTile label="Posted" value={fmt(t.posted)} note={share(t.posted)} accent={COLOR.posted} />
        <StatTile label="Rejected" value={fmt(t.rejected)} note={share(t.rejected)} accent={COLOR.rejected} />
        <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
          <StatTile label="Approval to post" value={t.medianApproveToPostMin === null ? "–" : `${fmt(t.medianApproveToPostMin)} min`} note="Median wait after approval" />
        </Box>
      </Box>

      <ChartCard title="Stories per day" subtitle="Received, posted and rejected, by IST day">
        {perDay.length ? (
          <Box role="img" aria-label={`Stories per day from ${perDay[0].day} to ${perDay[perDay.length - 1].day}`} sx={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={perDay} margin={{ top: 6, right: 8, left: -14, bottom: 0 }} barGap={1}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.palette.divider} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: axis }} minTickGap={18} tickFormatter={dayLabel} />
                <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: axis }} allowDecimals={false} width={44} />
                <Tooltip
                  cursor={{ fill: theme.palette.action.hover }}
                  labelFormatter={(d) => dayLabel(String(d))}
                  formatter={(v, name) => [fmt(Number(v)), String(name)]}
                  contentStyle={{ borderRadius: 8, fontSize: 12, background: theme.palette.background.paper, borderColor: theme.palette.divider, color: theme.palette.text.primary }}
                />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12, color: axis }}>{v}</span>} />
                <Bar dataKey="posted" name="Posted" stackId="out" fill={COLOR.posted} isAnimationActive={false} maxBarSize={22} />
                <Bar dataKey="rejected" name="Rejected" stackId="out" fill={COLOR.rejected} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={22} />
                <Line dataKey="received" name="Received" type="monotone" stroke={theme.palette.mode === "light" ? "#475569" : "#CBD5E1"} strokeWidth={2} dot={perDay.length <= 14} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <EmptyNote>No days in this range.</EmptyNote>
        )}
      </ChartCard>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 2 }}>
        <ChartCard title="Posted by district" subtitle="Where our posted stories were from">
          <BarList rows={(data.byDistrict ?? []).map((d) => ({ key: d.district ?? "-", label: d.district ?? "No district", value: d.posted }))} empty="Nothing posted in this range." />
        </ChartCard>
        <ChartCard title="Posted by category" subtitle="What our posted stories were about">
          <BarList rows={(data.byCategory ?? []).map((c) => ({ key: c.category ?? "-", label: c.category ?? "No category", value: c.posted }))} color={COLOR.approved} empty="Nothing posted in this range." />
        </ChartCard>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "1.3fr 1fr" }, gap: 2 }}>
        <ChartCard title="When we post" subtitle={postedTotal ? `Most posts went out at ${hourLabel(bestHour.hour)} IST (${fmt(bestHour.value)} of ${fmt(postedTotal)})` : "Posts by hour, IST"}>
          {postedTotal ? <HourBars data={byHour} label={(v) => fmt(v)} ariaLabel={`Posts by hour of the day, busiest at ${hourLabel(bestHour.hour)} IST`} /> : <EmptyNote>Nothing posted in this range.</EmptyNote>}
        </ChartCard>
        <ChartCard title="Why stories were rejected" subtitle={rejectTotal ? `${fmt(rejectTotal)} rejections with a reason` : undefined}>
          <BarList rows={(data.rejectReasons ?? []).map((r) => ({ key: r.reason, label: r.reason, value: r.count, note: rejectTotal ? pct(r.count / rejectTotal, 0) : undefined }))} color={COLOR.rejected} empty="No rejections in this range." />
        </ChartCard>
      </Box>

      <ChartCard title="Editors" subtitle="Stories each editor approved, posted and rejected">
        {editors.length ? (
          <TableContainer sx={{ mx: -2, width: "auto", overflowX: "auto" }}>
            <Table size="small" aria-label="Editors">
              <TableHead>
                <TableRow>
                  {sortHeader("name", "Editor", false)}
                  {sortHeader("approved", "Approved")}
                  {sortHeader("posted", "Posted")}
                  {sortHeader("rejected", "Rejected")}
                </TableRow>
              </TableHead>
              <TableBody>
                {editors.map((e) => (
                  <TableRow key={e.userId} hover>
                    <TableCell sx={{ fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap" }}>{e.name}</TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>{fmt(e.approved)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>{fmt(e.posted)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>{fmt(e.rejected)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <EmptyNote>No editor acted on a story in this range.</EmptyNote>
        )}
      </ChartCard>
    </Box>
  );
}
