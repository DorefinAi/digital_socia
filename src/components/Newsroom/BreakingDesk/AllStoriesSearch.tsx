"use client";

// "Search all stories" under the desk's search box. The list search reads only what the rows carry (headline,
// place, file, category); this asks the server's story search (GET /search/stories), which reads the story text
// and every day. A result that is in the shown list opens like its row; any other shows its headline and time.

import React, { useMemo, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import type { FtpNewsItem } from "@/types/newsroom";
import type { StorySearchItem } from "@/lib/socia/types";
import { useStorySearch } from "@/components/Header/useStorySearch";
import { offerServerSearch, rowsByLinkSlug } from "./listSearch";

interface AllStoriesSearchProps {
  /** What is typed in the desk's search box */
  query: string;
  /** How many rows the list search left */
  listHits: number;
  /** The shown list's rows; a result naming one of them opens it */
  rows: readonly FtpNewsItem[];
  onOpen: (n: FtpNewsItem) => void;
}

const timeOf = (iso: string) => {
  const t = new Date(iso);
  return Number.isFinite(t.getTime())
    ? t.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
};

const linkSx = { alignSelf: "flex-start", minHeight: 32, px: 1, textTransform: "none", fontWeight: 600, fontSize: "0.8125rem" } as const;
const panelSx = { mb: 1.5, p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: "10px" } as const;
const rowBaseSx = { display: "block", width: "100%", textAlign: "left", p: 1, border: 0, borderRadius: "8px", background: "transparent", fontFamily: "inherit", color: "text.primary" } as const;
const rowOpenSx = { ...rowBaseSx, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" } } as const;
const headSx = { fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" } as const;
const metaSx = { mt: 0.25, display: "flex", flexWrap: "wrap", columnGap: 1.25, fontSize: "0.75rem", color: "text.secondary" } as const;
const noteSx = { fontSize: "0.8125rem", color: "text.secondary" } as const;

function ResultRow({ item, row, onOpen }: { item: StorySearchItem; row: FtpNewsItem | undefined; onOpen: (n: FtpNewsItem) => void }) {
  const place = [item.district, item.town].filter(Boolean).join(", ");
  const body = (
    <>
      <Typography component="span" sx={{ ...headSx, display: "block" }}>{item.headline || "No headline"}</Typography>
      <Box component="span" sx={metaSx}>
        <span>{timeOf(item.receivedAt)}</span>
        {place && <span>{place}</span>}
        {!row && <span>Not in this list</span>}
      </Box>
    </>
  );
  return (
    <li>
      {row ? (
        <Box component="button" type="button" onClick={() => onOpen(row)} sx={rowOpenSx}>
          {body}
        </Box>
      ) : (
        <Box sx={rowBaseSx}>{body}</Box>
      )}
    </li>
  );
}

export default function AllStoriesSearch({ query, listHits, rows, onOpen }: AllStoriesSearchProps) {
  const q = query.trim();
  const [on, setOn] = useState(false);
  // An emptied search box closes the panel (adjusted while rendering, so it never shows for the empty query)
  if (on && !q) setOn(false);
  const found = useStorySearch(q, on);
  const bySlug = useMemo(() => (on ? rowsByLinkSlug(rows) : null), [on, rows]);

  if (!on) {
    if (!offerServerSearch(q, listHits)) return null;
    return (
      <Button size="small" onClick={() => setOn(true)} sx={{ ...linkSx, mb: 1 }}>
        Search all stories for “{q}”
      </Button>
    );
  }
  return (
    <Box component="section" aria-label="All stories search" sx={panelSx}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>All stories matching “{q}”</Typography>
        <Button size="small" onClick={() => setOn(false)} sx={linkSx}>
          Hide
        </Button>
      </Box>
      <Box aria-live="polite">
        {found.problem ? (
          <Typography sx={noteSx}>{found.message}</Typography>
        ) : !found.active ? (
          <Typography sx={noteSx}>Type at least 2 characters.</Typography>
        ) : found.loading && !found.items.length ? (
          <Typography sx={noteSx}>Searching…</Typography>
        ) : !found.items.length ? (
          <Typography sx={noteSx}>No stories match “{q}”.</Typography>
        ) : null}
      </Box>
      {found.items.length > 0 && (
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, maxHeight: 320, overflowY: "auto" }}>
          {found.items.map((item) => (
            <ResultRow key={item.id} item={item} row={item.linkSlug ? bySlug?.get(item.linkSlug) : undefined} onOpen={onOpen} />
          ))}
        </Box>
      )}
    </Box>
  );
}
