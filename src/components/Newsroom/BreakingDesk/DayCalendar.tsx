"use client";

// The queue's date picker: one month of days, today and earlier only. Built on MUI so the desk needs no date
// library. Days are "YYYY-MM-DD" IST days (deskRules.istDay), the same key as the server's ?day=. The grid is
// plain calendar arithmetic in UTC, so the browser's own time zone never shifts a day.

import React, { useEffect, useRef, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayKey } from "./deskRules";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Month {
  year: number;
  /** 0-11 */
  month: number;
}

const monthOf = (day: string): Month => {
  const [y, m] = day.split("-").map(Number);
  return { year: y, month: m - 1 };
};

/** The days shown for a month, Monday first, with blanks before the 1st */
function monthCells({ year, month }: Month): (number | null)[] {
  const blanks = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [...Array.from({ length: blanks }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

const dayButtonSx = {
  width: 34,
  height: 34,
  p: 0,
  border: "1px solid transparent",
  borderRadius: "8px",
  background: "none",
  fontFamily: "inherit",
  fontSize: "0.8125rem",
  fontVariantNumeric: "tabular-nums",
  color: "text.primary",
  cursor: "pointer",
  "&:hover:not(:disabled)": { backgroundColor: "action.hover" },
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
  "&:disabled": { color: "text.disabled", cursor: "default" },
} as const;

/** `value` is the shown day, `today` the IST day now; later days can't be picked (the server has none). */
export default function DayCalendar({ value, today, onPick }: { value: string; today: string; onPick: (day: string) => void }) {
  const [shown, setShown] = useState<Month>(() => monthOf(value));
  const thisMonth = monthOf(today);
  const atThisMonth = shown.year === thisMonth.year && shown.month === thisMonth.month;
  const step = (by: number) => setShown((m) => ({ year: m.year + Math.floor((m.month + by) / 12), month: (((m.month + by) % 12) + 12) % 12 }));
  const title = `${MONTH_NAMES[shown.month]} ${shown.year}`;
  // Focus starts on the shown day. After a frame: the popover's focus trap moves focus to its paper on open.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>("button[aria-pressed='true'], button[aria-current='date']")?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Box ref={rootRef} role="dialog" aria-label="Pick a day" sx={{ p: 1.5, width: 270 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <IconButton size="small" aria-label="Previous month" onClick={() => step(-1)}>
          <ChevronLeft size={16} />
        </IconButton>
        <Typography component="h2" aria-live="polite" sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
          {title}
        </Typography>
        <IconButton size="small" aria-label="Next month" disabled={atThisMonth} onClick={() => step(1)}>
          <ChevronRight size={16} />
        </IconButton>
      </Box>
      <Box role="group" aria-label={title} sx={{ display: "grid", gridTemplateColumns: "repeat(7, 34px)", gap: 0.25, justifyContent: "space-between" }}>
        {WEEKDAYS.map((w) => (
          <Typography key={w} aria-hidden sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "text.secondary", textAlign: "center", lineHeight: "24px" }}>
            {w}
          </Typography>
        ))}
        {monthCells(shown).map((d, i) => {
          if (d === null) return <Box key={`blank-${i}`} aria-hidden />;
          const key = dayKey(shown.year, shown.month + 1, d);
          const selected = key === value;
          const isToday = key === today;
          const weekday = WEEKDAY_NAMES[new Date(Date.UTC(shown.year, shown.month, d)).getUTCDay()];
          return (
            <Box
              key={key}
              component="button"
              type="button"
              disabled={key > today}
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${weekday}, ${d} ${MONTH_NAMES[shown.month]} ${shown.year}`}
              onClick={() => onPick(key)}
              sx={[
                dayButtonSx,
                isToday && !selected ? { borderColor: "divider", fontWeight: 700 } : {},
                selected ? { backgroundColor: "text.primary", color: "background.paper", fontWeight: 700, "&:hover:not(:disabled)": { backgroundColor: "text.primary", opacity: 0.88 } } : {},
              ]}
            >
              {d}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
