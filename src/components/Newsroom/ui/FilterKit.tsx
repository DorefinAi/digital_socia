"use client";

// The Filters button and its panel, shared by the desk pages: a popover on desktop, a bottom drawer on
// phones, sections of pressable options, and removable chips for what is active. Each page supplies its
// own sections and chip list; this file knows nothing about stories or trends.

import React, { useState } from "react";
import { Box, Button, Chip, Drawer, IconButton, Popover, Typography, useMediaQuery, useTheme } from "@mui/material";
import { SlidersHorizontal, X } from "lucide-react";
import { CONTROL_HEIGHT } from "./controls";

/** "Filters" with the number of active filters; opens the panel. `children` are the panel's sections. */
export function FiltersButton({ activeCount, onClearAll, title = "Filters", children }: { activeCount: number; onClearAll: () => void; title?: string; children: React.ReactNode }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  const panel = (
    <Box role="dialog" aria-label={title} sx={{ display: "flex", flexDirection: "column", maxHeight: "inherit" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{title}</Typography>
        <IconButton size="small" aria-label={`Close ${title.toLowerCase()}`} onClick={close} sx={{ borderRadius: "8px" }}>
          <X size={16} />
        </IconButton>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2, overflowY: "auto", minHeight: 0 }}>{children}</Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, px: 2, py: 1.25, borderTop: "1px solid", borderColor: "divider" }}>
        <Button onClick={onClearAll} disabled={!activeCount} sx={{ fontWeight: 600 }}>
          Clear all
        </Button>
        <Button variant="contained" disableElevation onClick={close} sx={{ fontWeight: 600 }}>
          Done
        </Button>
      </Box>
    </Box>
  );

  return (
    <>
      <Button
        variant="outlined"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        aria-label={activeCount ? `${title}, ${activeCount} active` : title}
        startIcon={<SlidersHorizontal size={14} />}
        sx={{ height: CONTROL_HEIGHT, flexShrink: 0, px: 1.5, fontWeight: 600, fontSize: "0.8125rem", borderColor: activeCount ? "text.primary" : "divider", color: "text.primary", whiteSpace: "nowrap" }}
      >
        {title}
        {activeCount > 0 && (
          <Box component="span" sx={{ ml: 0.75, minWidth: 18, height: 18, px: 0.5, borderRadius: "9px", display: "inline-flex", alignItems: "center", justifyContent: "center", backgroundColor: "text.primary", color: "background.paper", fontSize: "0.6875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {activeCount}
          </Box>
        )}
      </Button>
      {phone ? (
        <Drawer anchor="bottom" open={!!anchor} onClose={close} slotProps={{ paper: { sx: { borderTopLeftRadius: 14, borderTopRightRadius: 14, maxHeight: "85dvh", backgroundImage: "none" } } }}>
          {panel}
        </Drawer>
      ) : (
        <Popover
          open={!!anchor}
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { mt: 0.75, width: 380, maxHeight: "min(640px, 80vh)", borderRadius: "12px", border: "1px solid", borderColor: "divider", backgroundImage: "none" } } }}
        >
          {panel}
        </Popover>
      )}
    </>
  );
}

/** A titled group of options inside the panel. */
export function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
      <Typography component="legend" sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", mb: 0.75, p: 0 }}>
        {title}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>{children}</Box>
    </Box>
  );
}

/** A pressable option (pill) inside a section. */
export function FilterOption({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={on}
      onClick={onClick}
      sx={{
        px: 1.1,
        py: 0.5,
        maxWidth: "100%",
        borderRadius: "999px",
        border: "1px solid",
        borderColor: on ? "text.primary" : "divider",
        backgroundColor: on ? "text.primary" : "transparent",
        color: on ? "background.paper" : "text.primary",
        fontFamily: "inherit",
        fontSize: "0.75rem",
        fontWeight: 600,
        cursor: "pointer",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        "&:hover": { borderColor: "text.primary" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" },
      }}
    >
      {children}
    </Box>
  );
}

/** Shown in a section that has nothing to choose from. */
export function FilterEmpty({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{children}</Typography>;
}

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** Removable chips for the active filters, with Clear all. Renders nothing when no filter is set. */
export function FilterChips({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) {
  if (!chips.length) return null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
      {chips.map((c) => (
        <Chip key={c.key} label={c.label} size="small" onDelete={c.onRemove} sx={{ height: 26, borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, maxWidth: 220 }} />
      ))}
      <Button size="small" onClick={onClearAll} sx={{ minHeight: 26, px: 1, fontSize: "0.75rem", fontWeight: 600, color: "text.secondary" }}>
        Clear all
      </Button>
    </Box>
  );
}

/** Adds or removes a value in a multi-select list. */
export function toggleValue<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}
