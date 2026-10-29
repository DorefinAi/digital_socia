"use client";

// "4 sources": a grouped story (contract A2) lists every publisher that told it, each with its own link.

import React, { useId, useState } from "react";
import { Box } from "@mui/material";
import { ChevronDown, ChevronRight, ExternalLink, Layers } from "lucide-react";
import type { TrendItem } from "@/lib/socia/trends";

const ago = (iso: string | null, now: number) => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return mins < 1 ? "just now" : `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

/** How many sources told the item's story (1 when it stands alone) */
export const sourceCountOf = (item: TrendItem) => Math.max(item.sourceCount ?? 0, item.sources?.length ?? 0, 1);

export function ClusterSources({ item, now }: { item: TrendItem; now: number }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const count = sourceCountOf(item);
  if (count < 2) return null;
  const sources = item.sources ?? [];

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        aria-controls={sources.length ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        disabled={!sources.length}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          minHeight: 26,
          px: 0.9,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "6px",
          background: "none",
          color: "text.primary",
          fontFamily: "inherit",
          fontSize: "0.6875rem",
          fontWeight: 700,
          cursor: sources.length ? "pointer" : "default",
          "&:hover:not(:disabled)": { backgroundColor: "action.hover" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" },
        }}
      >
        <Layers size={12} aria-hidden />
        {count} sources
        {sources.length > 0 && (open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />)}
      </Box>
      {open && sources.length > 0 && (
        <Box component="ul" id={listId} aria-label={`Sources for ${item.title}`} sx={{ listStyle: "none", m: 0, mt: 0.75, p: 0, display: "flex", flexDirection: "column", gap: 0.5, pl: 1.25, borderLeft: "2px solid", borderColor: "divider" }}>
          {sources.map((s, i) => (
            <Box component="li" key={`${s.url}-${i}`} sx={{ display: "flex", alignItems: "baseline", gap: 0.75, minWidth: 0, fontSize: "0.75rem" }}>
              {s.url ? (
                <Box
                  component="a"
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, minWidth: 0, color: "text.primary", fontWeight: 600, textDecoration: "none", overflowWrap: "anywhere", "&:hover": { textDecoration: "underline" }, "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" } }}
                >
                  {s.name || s.url}
                  <ExternalLink size={11} aria-hidden style={{ flexShrink: 0 }} />
                </Box>
              ) : (
                <Box component="span" sx={{ fontWeight: 600 }}>
                  {s.name}
                </Box>
              )}
              {s.publishedAt && (
                <Box component="span" sx={{ color: "text.secondary", fontSize: "0.6875rem", whiteSpace: "nowrap" }}>
                  {ago(s.publishedAt, now)}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
