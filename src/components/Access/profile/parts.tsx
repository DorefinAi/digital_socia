"use client";

// Building blocks of the profile page: the section card, a label/value row, a keycap and the name-tinted avatar.

import React from "react";
import { Box, Typography } from "@mui/material";
import { initials } from "../shared";

/** Shared card surface: white (paper) with a hairline border and a shadow soft enough to read as lift, not decoration */
export const cardSx = {
  backgroundColor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "16px",
  boxShadow: (t: { palette: { mode: string } }) => (t.palette.mode === "light" ? "0 1px 2px rgba(16,24,40,0.04), 0 2px 8px rgba(16,24,40,0.04)" : "none"),
} as const;

/** One section of the right column: heading, one-line description, an action on the right, then its body */
export function SectionCard({
  id,
  icon,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" id={id} aria-labelledby={`${id}-title`} sx={{ ...cardSx, scrollMarginTop: "16px", minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 2.5 }, pb: 2 }}>
        <Box aria-hidden sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: "10px", display: "grid", placeItems: "center", backgroundColor: "action.hover", color: "text.primary" }}>
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={`${id}-title`} component="h2" tabIndex={-1} sx={{ fontSize: "1.0625rem", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.3, outline: "none" }}>
            {title}
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.25, lineHeight: 1.45 }}>{description}</Typography>
        </Box>
        {action && <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 1 }}>{action}</Box>}
      </Box>
      <Box sx={{ borderTop: "1px solid", borderColor: "divider", px: { xs: 2, sm: 3 }, py: { xs: 1, sm: 1.5 } }}>{children}</Box>
    </Box>
  );
}

/** A label/value row: side by side from 600px, stacked on a phone */
export function DetailRow({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr) auto", sm: "168px minmax(0, 1fr) auto" },
        columnGap: 2,
        rowGap: 0.25,
        alignItems: "start",
        py: 1.5,
        borderTop: "1px solid",
        borderColor: "divider",
        "&:first-of-type": { borderTop: "none" },
      }}
    >
      <Typography component="div" sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: "1.5rem", gridColumn: { xs: "1 / -1", sm: "auto" } }}>
        {label}
      </Typography>
      <Box sx={{ fontSize: "0.875rem", minWidth: 0, overflowWrap: "anywhere" }}>{children}</Box>
      {aside ? <Box sx={{ justifySelf: "end" }}>{aside}</Box> : <span />}
    </Box>
  );
}

/** One key, drawn as a keycap */
export function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="kbd"
      sx={{
        px: 0.75,
        minWidth: 24,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "6px",
        border: "1px solid",
        borderColor: "divider",
        borderBottomWidth: 2,
        backgroundColor: "background.default",
        color: "text.primary",
        fontFamily: "inherit",
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Box>
  );
}

/** A soft hue picked from the name, so each person keeps their colour */
export function nameHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export function TintedAvatar({ name, size }: { name: string; size: { xs: number; sm: number } }) {
  const hue = nameHue(name);
  return (
    <Box
      aria-hidden
      sx={(t) => ({
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontWeight: 700,
        letterSpacing: "0.02em",
        fontSize: { xs: size.xs * 0.36, sm: size.sm * 0.36 },
        backgroundColor: t.palette.mode === "light" ? `hsl(${hue} 62% 92%)` : `hsl(${hue} 30% 24%)`,
        color: t.palette.mode === "light" ? `hsl(${hue} 45% 28%)` : `hsl(${hue} 70% 86%)`,
        boxShadow: `0 0 0 4px ${t.palette.background.paper}, 0 0 0 5px ${t.palette.divider}`,
      })}
    >
      {initials(name)}
    </Box>
  );
}
