"use client";

// Small controls shared by the desk pages (X console, Rejected news, Web Scraper).

import React from "react";
import { Box } from "@mui/material";

/** Visually hidden, still read by screen readers. */
export const srOnly = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

/** Height shared by the pages' header controls (view switch, Refresh, search, Filters); the theme's button minimum. */
export const CONTROL_HEIGHT = 38;

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Accessible name when the label is not plain text */
  ariaLabel?: string;
}

/**
 * One bordered group of equal-height segments; the pressed one gets a quiet filled state.
 * `value` may match no option (nothing pressed), e.g. when the same filter was set elsewhere.
 */
export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel }: { value: T | null; options: SegmentOption<T>[]; onChange: (next: T) => void; ariaLabel: string }) {
  return (
    <Box role="group" aria-label={ariaLabel} sx={{ display: "inline-flex", alignItems: "stretch", flexShrink: 0, height: CONTROL_HEIGHT, p: "3px", gap: "2px", border: "1px solid", borderColor: "divider", borderRadius: "8px", backgroundColor: "background.paper" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Box
            key={o.value}
            component="button"
            type="button"
            aria-pressed={on}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.6,
              px: 1.25,
              border: 0,
              borderRadius: "5px",
              fontFamily: "inherit",
              fontSize: "0.75rem",
              fontWeight: on ? 700 : 600,
              whiteSpace: "nowrap",
              cursor: "pointer",
              color: on ? "text.primary" : "text.secondary",
              backgroundColor: on ? "action.selected" : "transparent",
              boxShadow: (t) => (on ? `inset 0 0 0 1px ${t.palette.divider}` : "none"),
              "&:hover": { color: "text.primary", backgroundColor: on ? "action.selected" : "action.hover" },
              "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" },
            }}
          >
            {o.label}
          </Box>
        );
      })}
    </Box>
  );
}
