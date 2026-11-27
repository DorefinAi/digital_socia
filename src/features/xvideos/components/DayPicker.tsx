"use client";

// The day folder picker in the desk's header: which `<dd-mm-yyyy>` folder of the video share the list shows. Opens on
// today's; the desk can pick another month and day. Each day shows how many videos it holds and how many carry the x
// mark or are done. Only days whose folder still holds videos are listed, plus today. Picking today again follows the
// date when it rolls over.

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Box, Button, CircularProgress, MenuItem, MenuList, Popover, Typography } from "@mui/material";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { dayLabel, dayLabelLong, findDay, monthLabel, type XvFolderDay, type XvFolders } from "../lib/folders";
import { srOnly } from "../../../components/Newsroom/BreakingDesk/shared";

const triggerSx = {
  minHeight: 36,
  px: 1.25,
  gap: 0.875,
  borderRadius: "8px",
  textTransform: "none",
  fontWeight: 600,
  fontSize: "0.8125rem",
  whiteSpace: "nowrap",
  borderColor: "divider",
  color: "text.primary",
  backgroundColor: "background.paper",
  "&:hover": { borderColor: "text.secondary", backgroundColor: "background.paper" },
} as const;

const monthBtnSx = (on: boolean) =>
  ({
    px: 1.125,
    py: 0.5,
    minHeight: 30,
    border: "1px solid",
    borderColor: on ? "text.primary" : "divider",
    borderRadius: "6px",
    background: "none",
    backgroundColor: on ? "text.primary" : "transparent",
    color: on ? "background.paper" : "text.secondary",
    font: "inherit",
    fontSize: "0.75rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
    cursor: "pointer",
    "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
  }) as const;

const TodayDot = () => <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, backgroundColor: "success.main" }} />;

const clipsText = (n: number) => (n === 1 ? "1 clip" : `${n} clips`);

/** "3 marked x, 2 done" for screen readers; the row shows the short form */
function dayNotes(d: XvFolderDay): { short: string; long: string }[] {
  const out: { short: string; long: string }[] = [];
  if (d.picked) out.push({ short: `${d.picked} x`, long: `${d.picked} marked x` });
  if (d.done) out.push({ short: `${d.done} done`, long: `${d.done} done` });
  return out;
}

export interface DayPickerProps {
  folders: XvFolders | null;
  /** The day folder the list shows or is switching to; null before anything is known (live, first load) */
  day: string | null;
  /** Today as the desk treats it (newer than the folders' own just after midnight) */
  today: string | null;
  /** The list for `day` is still on its way */
  loading: boolean;
  /** Why the day folders could not be listed */
  error: string | null;
  onPick: (day: string) => void;
  /** The picker opened: a good moment to ask for fresh counts */
  onOpen: () => void;
}

export default function DayPicker({ folders, day, today, loading, error, onPick, onOpen }: DayPickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const descId = useId();

  // Focus goes to the shown day (or the first) so the arrow keys start from there
  const focusShownDay = useCallback(() => {
    const list = listRef.current;
    (list?.querySelector<HTMLElement>('[aria-current="true"]') ?? list?.querySelector<HTMLElement>('[role="menuitem"]'))?.focus();
  }, []);
  // The popover finished opening; the list may come later (folders still loading, or after an error)
  const entered = useRef(false);
  const listShown = !!anchor && !!folders;
  const hadList = useRef(false);
  useEffect(() => {
    if (listShown && !hadList.current && entered.current) focusShownDay();
    hadList.current = listShown;
  }, [listShown, focusShownDay]);

  const shown = day ?? today;
  const isToday = !!shown && shown === today;
  const entry = findDay(folders, shown);
  const viewMonth = month ?? shown?.slice(0, 7) ?? folders?.months[0]?.month ?? null;
  const days = folders?.months.find((m) => m.month === viewMonth)?.days ?? [];

  const open = (el: HTMLElement) => {
    setMonth(null);
    setAnchor(el);
    onOpen();
  };
  const pick = (d: string) => {
    entered.current = false;
    setAnchor(null);
    if (d !== shown) onPick(d);
  };

  return (
    <>
      {/* The button's name is its visible text ("Fri 27 Nov Today 26 clips"); this adds the full date and what it does */}
      <Box component="span" id={descId} sx={srOnly}>
        {shown ? `Day folder ${dayLabelLong(shown)}.` : "Day folder of today."} Opens the list of day folders.
      </Box>
      <Button variant="outlined" onClick={(e) => open(e.currentTarget)} aria-haspopup="dialog" aria-expanded={!!anchor} aria-describedby={descId} sx={triggerSx}>
        <CalendarDays size={15} aria-hidden />
        <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {shown ? dayLabel(shown) : "Today"}
        </Box>
        {isToday && (
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.6875rem", fontWeight: 600, color: "success.dark" }}>
            <TodayDot />
            Today
          </Box>
        )}
        {loading ? (
          <CircularProgress size={12} thickness={5} aria-hidden sx={{ color: "text.secondary" }} />
        ) : (
          entry && (
            <Box component="span" sx={{ fontWeight: 500, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
              {clipsText(entry.clips)}
            </Box>
          )
        )}
        <ChevronDown size={14} aria-hidden />
      </Button>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => {
          entered.current = false;
          setAnchor(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          // Focus lands on the shown day, so the arrow keys start from there
          transition: {
            onEntered: () => {
              entered.current = true;
              focusShownDay();
            },
            onExited: () => {
              entered.current = false;
            },
          },
          paper: { role: "dialog", "aria-labelledby": titleId, sx: { mt: 0.75, width: 320, maxWidth: "calc(100vw - 32px)", borderRadius: "12px", border: "1px solid", borderColor: "divider", boxShadow: "0 12px 32px rgba(15, 20, 25, 0.12)" } } }}
      >
        <Box sx={{ px: 1.75, pt: 1.5, pb: 1 }}>
          <Typography id={titleId} sx={{ fontSize: "0.875rem", fontWeight: 700 }}>
            Day folder on the share
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>Every video of the day shows, with or without the x mark.</Typography>
          {folders && folders.months.length > 1 && (
            <Box role="group" aria-label="Month" sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1.25 }}>
              {folders.months.map((m) => (
                <Box key={m.month} component="button" type="button" aria-pressed={m.month === viewMonth} onClick={() => setMonth(m.month)} sx={monthBtnSx(m.month === viewMonth)}>
                  {monthLabel(m.month)}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {!folders ? (
          <Box role="status" sx={{ px: 1.75, pb: 1.75, fontSize: "0.8125rem", color: error ? "error.main" : "text.secondary" }}>
            {error ? (
              <>
                The day folders did not load. {error}{" "}
                <Box component="button" type="button" onClick={onOpen} sx={{ border: 0, background: "none", p: 0, font: "inherit", color: "text.primary", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>
                  Try again
                </Box>
              </>
            ) : (
              "Loading the day folders…"
            )}
          </Box>
        ) : (
          <MenuList ref={listRef} aria-label={viewMonth ? `Days in ${monthLabel(viewMonth)}` : "Days"} sx={{ maxHeight: 320, overflowY: "auto", py: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
            {days.map((d) => {
              const selected = d.day === shown;
              const notes = dayNotes(d);
              return (
                <MenuItem
                  key={d.day}
                  selected={selected}
                  aria-current={selected ? "true" : undefined}
                  aria-describedby={`${descId}-${d.day}`}
                  onClick={() => pick(d.day)}
                  sx={{ display: "grid", gridTemplateColumns: "16px minmax(0, 1fr) auto", columnGap: 1, alignItems: "center", py: 0.875, minHeight: 44 }}
                >
                  <Box component="span" aria-hidden sx={{ display: "inline-flex" }}>
                    {selected && <Check size={14} />}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: "0.8125rem", fontWeight: 600 }}>
                      {dayLabel(d.day)}
                      {d.day === today && (
                        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.6875rem", color: "success.dark" }}>
                          <TodayDot />
                          Today
                        </Box>
                      )}
                    </Box>
                    {notes.length > 0 && (
                      <Box sx={{ display: "flex", gap: 1, fontSize: "0.6875rem", color: "text.secondary", mt: 0.125 }}>
                        {notes.map((n) => (
                          <span key={n.short}>
                            <span aria-hidden>{n.short}</span>
                            <Box component="span" sx={srOnly}>
                              {n.long}
                            </Box>
                          </span>
                        ))}
                      </Box>
                    )}
                  </Box>
                  <Box component="span" sx={{ fontSize: "0.75rem", color: d.clips ? "text.primary" : "text.disabled", fontVariantNumeric: "tabular-nums" }}>
                    {d.clips ? clipsText(d.clips) : "Empty"}
                  </Box>
                </MenuItem>
              );
            })}
          </MenuList>
        )}
        {folders && (
          <Box sx={srOnly}>
            {days.map((d) => (
              <span key={d.day} id={`${descId}-${d.day}`}>
                {dayLabelLong(d.day)}
              </span>
            ))}
          </Box>
        )}
        {error && folders && <Typography sx={{ px: 1.75, py: 1, fontSize: "0.6875rem", color: "error.main", borderTop: "1px solid", borderColor: "divider" }}>Counts may be old: {error}</Typography>}
      </Popover>
    </>
  );
}
