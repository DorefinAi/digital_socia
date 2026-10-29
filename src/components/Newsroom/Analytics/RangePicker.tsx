"use client";

import React, { useState } from "react";
import { Box, Button, Popover, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { CalendarDays } from "lucide-react";
import { MAX_RANGE_DAYS, RangeKey, customRangeError, isoDay, startOfToday } from "@/data/analyticsData";

export type RangeChoice = RangeKey | "custom";

/** 7 days / 4 weeks / 1 month, plus Custom: two dates, at most a year apart, none in the future. */
export default function RangePicker({
  value,
  custom,
  onPreset,
  onCustom,
  segmentSx,
}: {
  value: RangeChoice;
  custom: { from: string; to: string } | null;
  onPreset: (k: RangeKey) => void;
  onCustom: (from: string, to: string) => void;
  segmentSx: object;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;
  const close = () => setAnchor(null);
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [touched, setTouched] = useState(false);

  const today = startOfToday();
  const earliest = new Date(today);
  earliest.setDate(earliest.getDate() - MAX_RANGE_DAYS);
  const error = customRangeError(draft.from, draft.to);

  const openPicker = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.currentTarget;
    if (custom) setDraft(custom);
    else {
      const from = new Date(today);
      from.setDate(from.getDate() - 13);
      setDraft({ from: isoDay(from), to: isoDay(today) });
    }
    setTouched(false);
    setAnchor(target);
  };

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    onCustom(draft.from, draft.to);
    close();
  };

  return (
    <>
      <ToggleButtonGroup
        value={value}
        exclusive
        size="small"
        onChange={(_, v: RangeChoice | null) => v && v !== "custom" && onPreset(v)}
        aria-label="Date range"
        sx={{ height: 36, ...segmentSx }}
      >
        <ToggleButton value="7d">7 days</ToggleButton>
        <ToggleButton value="4w">4 weeks</ToggleButton>
        <ToggleButton value="1m">1 month</ToggleButton>
        <ToggleButton value="custom" onClick={openPicker} aria-haspopup="dialog" aria-expanded={open} sx={{ gap: 0.5 }}>
          <CalendarDays size={14} aria-hidden />
          Custom
        </ToggleButton>
      </ToggleButtonGroup>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { role: "dialog", "aria-label": "Custom date range", sx: { mt: 1, borderRadius: "12px", p: 2, width: 300, maxWidth: "calc(100vw - 32px)" } } }}
      >
        <Box component="form" onSubmit={apply} noValidate>
          <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Custom range</Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 1.5 }}>Any dates within the last year, up to today.</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            {(["from", "to"] as const).map((k) => (
              <TextField
                key={k}
                type="date"
                size="small"
                label={k === "from" ? "From" : "To"}
                value={draft[k]}
                onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                error={touched && !!error}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: isoDay(earliest), max: isoDay(today), "aria-describedby": "custom-range-msg" } }}
              />
            ))}
          </Box>
          <Typography id="custom-range-msg" role={touched && error ? "alert" : undefined} sx={{ fontSize: "0.75rem", mt: 1, minHeight: 18, color: touched && error ? "error.main" : "text.secondary" }}>
            {touched && error ? error : ""}
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1 }}>
            <Button onClick={close} sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary" }}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" sx={{ textTransform: "none", fontWeight: 600, borderRadius: "8px" }}>
              Apply range
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  );
}
