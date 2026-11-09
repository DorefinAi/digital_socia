"use client";

// The left column's "Quick links": jumps to a section and marks the one in view.

import React, { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { cardSx } from "./parts";

export interface QuickLink {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Scrolls to a section and moves focus to its heading, so keyboard and screen-reader users land there too */
export function jumpTo(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  document.getElementById(`${id}-title`)?.focus({ preventScroll: true });
}

export default function QuickLinks({ links }: { links: QuickLink[] }) {
  const [active, setActive] = useState(links[0]?.id);

  // The section nearest the top of the window is the current one
  useEffect(() => {
    const els = links.map((l) => document.getElementById(l.id)).filter((e): e is HTMLElement => !!e);
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = links.find((l) => seen.get(l.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-10% 0px -55% 0px" }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [links]);

  return (
    <Box component="nav" aria-labelledby="profile-quick-links" sx={{ ...cardSx, p: { xs: 1.5, md: 2 }, position: { md: "sticky" }, top: { md: 16 } }}>
      <Typography id="profile-quick-links" component="h2" sx={{ fontSize: "0.9375rem", fontWeight: 700, px: 1, pb: 1 }}>
        Quick links
      </Typography>
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: { xs: "row", md: "column" }, flexWrap: { xs: "wrap", md: "nowrap" }, gap: 0.5 }}>
        {links.map((l) => {
          const on = active === l.id;
          return (
            <li key={l.id}>
              <Box
                component="a"
                href={`#${l.id}`}
                aria-current={on ? "location" : undefined}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  setActive(l.id);
                  jumpTo(l.id);
                  history.replaceState(null, "", `#${l.id}`);
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  minHeight: 40,
                  px: 1.25,
                  borderRadius: "10px",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  fontWeight: on ? 700 : 500,
                  color: on ? "text.primary" : "text.secondary",
                  backgroundColor: on ? "action.selected" : "transparent",
                  borderStyle: "solid",
                  borderColor: "divider",
                  borderWidth: { xs: 1, md: 0 },
                  "&:hover": { backgroundColor: "action.hover", color: "text.primary" },
                  "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: 1 },
                  "& svg": { flexShrink: 0 },
                }}
              >
                {l.icon}
                {l.label}
              </Box>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}
