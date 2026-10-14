"use client";

import React, { useState } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useThemeMode } from "@/providers/MuiProvider";

export const cardSx = {
  backgroundColor: "background.paper",
  borderRadius: "12px",
  p: 2,
  boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)",
  border: "1px solid",
  borderColor: "divider",
};

export function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, px: 0.6, py: 0.1, borderRadius: "6px", fontSize: "0.6875rem", fontWeight: 700, backgroundColor: up ? "#E8F5E9" : "#FFEBEE", color: up ? "#2E7D32" : "#C62828" }}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(pct).toFixed(1)}%
    </Box>
  );
}

/** Metric tile: big number, change against the previous period, sparkline. Click selects it for the main chart. */
export function KpiTile({ label, value, previous, display, spark, color, active, onClick }: { label: string; value: number; previous: number; display: string; spark: number[]; color: string; active: boolean; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      aria-pressed={active}
      sx={{
        ...cardSx,
        textAlign: "left",
        fontFamily: "inherit",
        color: "text.primary",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        borderColor: active ? color : "divider",
        boxShadow: active ? `0 0 0 1px ${color}` : cardSx.boxShadow,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:hover": { transform: "translateY(-2px)", boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.08)" },
      }}
    >
      <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "text.secondary" }}>{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: "1.375rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{display}</Typography>
        <Delta current={value} previous={previous} />
      </Box>
      <Box sx={{ height: 34, mx: -0.5 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 7 × 24 grid of average engagement rate; darker means better. */
export function PostingHeatmap({ grid, color }: { grid: number[][]; color: string }) {
  const { mode } = useThemeMode();
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const all = grid.flat();
  const min = Math.min(...all);
  const max = Math.max(...all);
  const best = (() => {
    let at = { d: 0, h: 0 };
    grid.forEach((row, d) => row.forEach((v, h) => v > grid[at.d][at.h] && (at = { d, h })));
    return at;
  })();

  return (
    <Box>
      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "36px repeat(24, minmax(16px, 1fr))", gap: "3px", minWidth: 520 }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <Typography key={h} sx={{ fontSize: "0.5625rem", color: "text.secondary", textAlign: "center" }}>
              {h % 3 === 0 ? h : ""}
            </Typography>
          ))}
          {grid.map((row, d) => (
            <React.Fragment key={d}>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", alignSelf: "center" }}>{DAYS[d]}</Typography>
              {row.map((v, h) => {
                const t = (v - min) / (max - min || 1);
                return (
                  <Tooltip key={h} title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 · ${v.toFixed(1)}% avg engagement`} placement="top" arrow>
                    <Box
                      onMouseEnter={() => setHover({ d, h })}
                      onMouseLeave={() => setHover(null)}
                      sx={{
                        height: 18,
                        borderRadius: "3px",
                        backgroundColor: color,
                        opacity: 0.08 + t * 0.92,
                        outline: hover?.d === d && hover?.h === h ? `2px solid ${mode === "light" ? "#000" : "#fff"}` : "none",
                      }}
                    />
                  </Tooltip>
                );
              })}
            </React.Fragment>
          ))}
        </Box>
      </Box>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 1.25 }}>
        Best slot: <b>{DAYS[best.d]} {String(best.h).padStart(2, "0")}:00</b> ({grid[best.d][best.h].toFixed(1)}% average engagement). Times in IST.
      </Typography>
    </Box>
  );
}
