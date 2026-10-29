"use client";

// Keyword watch for the Web Scraper (contract: handoff/scraper-analytics-contract.md, A4 and C).
// Each user keeps up to 50 keywords; items naming one come back with `watchHits`, the Watched filter
// shows only those, and a "N new matches" pill counts matches that arrived since the user last looked.
// Live it uses /me/trend-watches; in demo mode the keywords live in this browser.

import React, { useEffect, useState } from "react";
import { Box, Button, IconButton, Popover, TextField, Typography } from "@mui/material";
import { BellRing, Eye, X } from "lucide-react";
import { usePolled } from "@/lib/socia/usePolled";
import { addTrendWatch, fetchTrendWatchHits, listTrendWatches, MAX_WATCHES, MAX_WATCH_LENGTH, removeTrendWatch, watchHitsFor, type TrendItem, type TrendWatch } from "@/lib/socia/trends";
import { DEMO_WATCH_KEYWORDS } from "@/data/scraperDemoExtras";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";
import { CONTROL_HEIGHT } from "../ui/controls";

const DEMO_KEY = "socia_trend_watches_demo_v1";
const SEEN_KEY = "socia_trend_watch_seen_v1";
const HITS_POLL_MS = 60_000;

function readDemoWatches(): TrendWatch[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null") as unknown;
    if (Array.isArray(raw)) return raw.filter((w): w is TrendWatch => !!w && typeof w.id === "string" && typeof w.keyword === "string");
  } catch {}
  return DEMO_WATCH_KEYWORDS.map((keyword, i) => ({ id: `demo-${i}`, keyword }));
}

/** When the user last looked at their matches; a first visit counts the last 24 hours as new. */
function readSeen(): string {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    if (v && !Number.isNaN(new Date(v).getTime())) return v;
  } catch {}
  return new Date(Date.now() - 24 * 3600_000).toISOString();
}

export interface TrendWatches {
  /** null until loaded */
  watches: TrendWatch[] | null;
  keywords: string[];
  loadError: string | null;
  /** Returns an error to show, or null when the keyword was added */
  add: (keyword: string) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  /** Matches that arrived since the user last looked */
  newCount: number;
  markSeen: () => void;
  /** The item's matching keywords: the server's answer when it sent one, else matched here */
  hitsOf: (item: TrendItem) => string[];
}

/** `pool`: the demo items the badge counts in demo mode (ignored live). `onChange` runs after an add or remove. */
export function useTrendWatches(live: boolean, pool: TrendItem[], onChange?: () => void): TrendWatches {
  const [watches, setWatches] = useState<TrendWatch[] | null>(() => (live ? null : readDemoWatches()));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seen, setSeen] = useState(readSeen);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    listTrendWatches()
      .then((w) => !stop && (setWatches(w), setLoadError(null)))
      .catch((err) => !stop && (setWatches([]), setLoadError(errorText(err))));
    return () => {
      stop = true;
    };
  }, [live]);

  const saveDemo = (next: TrendWatch[]) => {
    setWatches(next);
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(next));
    } catch {}
  };

  const keywords = (watches ?? []).map((w) => w.keyword);

  const add = async (raw: string): Promise<string | null> => {
    const keyword = raw.trim().replace(/\s+/g, " ");
    if (!keyword) return "Type a word or a name to watch.";
    if (keyword.length > MAX_WATCH_LENGTH) return `Keep it under ${MAX_WATCH_LENGTH} characters.`;
    if (keywords.some((k) => k.toLocaleLowerCase() === keyword.toLocaleLowerCase())) return `You already watch “${keyword}”.`;
    if (keywords.length >= MAX_WATCHES) return `You can watch up to ${MAX_WATCHES} keywords. Remove one first.`;
    if (!live) {
      saveDemo([...(watches ?? []), { id: `demo-${keyword.toLocaleLowerCase()}`, keyword }]);
      return null;
    }
    try {
      const made = await addTrendWatch(keyword);
      // The answer may or may not carry the new row; the list is the truth
      setWatches(await listTrendWatches().catch(() => [...(watches ?? []), made ?? { id: `new-${keyword.toLocaleLowerCase()}`, keyword }]));
      onChange?.();
      return null;
    } catch (err) {
      return errorText(err);
    }
  };

  const remove = async (id: string): Promise<string | null> => {
    const before = watches ?? [];
    const next = before.filter((w) => w.id !== id);
    if (!live) {
      saveDemo(next);
      return null;
    }
    setWatches(next);
    try {
      await removeTrendWatch(id);
      onChange?.();
      return null;
    } catch (err) {
      setWatches(before);
      return errorText(err);
    }
  };

  const hits = usePolled(() => fetchTrendWatchHits(seen), HITS_POLL_MS, `watch-hits-${seen}`, live && keywords.length > 0);
  const since = new Date(seen).getTime();
  const newCount = live
    ? keywords.length
      ? (hits.data?.count ?? 0)
      : 0
    : pool.filter((i) => new Date(i.scrapedAt).getTime() > since && watchHitsFor(i, keywords).length > 0).length;

  const markSeen = () => {
    const now = new Date().toISOString();
    setSeen(now);
    try {
      localStorage.setItem(SEEN_KEY, now);
    } catch {}
  };

  const hitsOf = (item: TrendItem) => (live && Array.isArray(item.watchHits) ? item.watchHits : watchHitsFor(item, keywords));

  return { watches, keywords, loadError, add, remove, newCount, markSeen, hitsOf };
}

/** "Keyword watch" button with the number of keywords; opens the panel to add and remove them. */
export function KeywordWatchButton({ watch }: { watch: TrendWatches }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const count = watch.keywords.length;
  const full = count >= MAX_WATCHES;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await watch.add(draft);
    setBusy(false);
    setError(err);
    if (!err) setDraft("");
  };
  const remove = async (w: TrendWatch) => {
    setError(await watch.remove(w.id));
  };

  return (
    <>
      <Button
        variant="outlined"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        aria-label={`Keyword watch, ${count} ${count === 1 ? "keyword" : "keywords"}`}
        startIcon={<Eye size={14} />}
        sx={{ height: CONTROL_HEIGHT, flexShrink: 0, px: 1.5, fontWeight: 600, fontSize: "0.8125rem", borderColor: "divider", color: "text.primary", whiteSpace: "nowrap" }}
      >
        Keyword watch
        {count > 0 && (
          <Box component="span" aria-hidden sx={{ ml: 0.75, minWidth: 18, height: 18, px: 0.5, borderRadius: "9px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid", borderColor: "divider", fontSize: "0.6875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {count}
          </Box>
        )}
      </Button>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 0.75, width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "min(560px, 80vh)", borderRadius: "12px", border: "1px solid", borderColor: "divider", backgroundImage: "none" } } }}
      >
        <Box role="dialog" aria-label="Keyword watch" sx={{ display: "flex", flexDirection: "column" }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>Keyword watch</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
                Items that name one of your keywords are marked, and the Watched filter shows only them. Hindi and English both work.
              </Typography>
            </Box>
            <IconButton size="small" aria-label="Close keyword watch" onClick={() => setAnchor(null)} sx={{ borderRadius: "8px" }}>
              <X size={16} />
            </IconButton>
          </Box>
          <Box component="form" onSubmit={submit} noValidate sx={{ display: "flex", gap: 1, alignItems: "flex-start", px: 2, pt: 1.5 }}>
            <TextField
              label="Add a keyword"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              size="small"
              disabled={full}
              error={!!error}
              helperText={error ?? (full ? `You watch ${MAX_WATCHES}, the most allowed. Remove one to add another.` : "A place, a name or a topic, e.g. Jaipur Metro")}
              slotProps={{ htmlInput: { maxLength: MAX_WATCH_LENGTH } }}
              sx={{ flex: 1, minWidth: 0, "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem" } }}
            />
            <Button type="submit" variant="contained" disableElevation disabled={busy || full || !draft.trim()} sx={{ height: 40, fontWeight: 600, flexShrink: 0 }}>
              Add
            </Button>
          </Box>
          <Box sx={{ px: 2, py: 1.5, overflowY: "auto" }}>
            {watch.loadError ? (
              <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main" }}>
                Could not load your keywords: {watch.loadError}
              </Typography>
            ) : !watch.watches ? (
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>Loading your keywords…</Typography>
            ) : !watch.watches.length ? (
              <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>You don&apos;t watch any keywords yet. Add one above to get marked items and a count of new matches.</Typography>
            ) : (
              <>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", mb: 0.75 }}>
                  Watching {count} of {MAX_WATCHES}
                </Typography>
                <Box component="ul" aria-label="Watched keywords" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {watch.watches.map((w) => (
                    <Box component="li" key={w.id} sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, maxWidth: "100%", height: 28, pl: 1, pr: 0.25, borderRadius: "6px", backgroundColor: "action.selected" }}>
                      <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {w.keyword}
                      </Box>
                      <IconButton size="small" aria-label={`Stop watching ${w.keyword}`} onClick={() => void remove(w)} sx={{ p: 0.4, borderRadius: "4px" }}>
                        <X size={13} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Popover>
    </>
  );
}

/** "3 new matches": shown while matches wait; click to see them (turns on the Watched filter). */
export function NewMatchesBadge({ count, onShow }: { count: number; onShow: () => void }) {
  if (count <= 0) return null;
  return (
    <Box
      component="button"
      type="button"
      onClick={onShow}
      aria-label={`${count} new ${count === 1 ? "match" : "matches"} for your keywords. Show watched items`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.6,
        height: 26,
        px: 1.1,
        border: "1px solid",
        borderColor: "#B26A00",
        borderRadius: "999px",
        backgroundColor: (t) => (t.palette.mode === "light" ? "#FFF4E0" : "rgba(255, 167, 38, 0.14)"),
        color: (t) => (t.palette.mode === "light" ? "#7A4800" : "#FFCC80"),
        fontFamily: "inherit",
        fontSize: "0.6875rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
        cursor: "pointer",
        "&:hover": { filter: "brightness(0.97)" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "2px" },
      }}
    >
      <BellRing size={12} aria-hidden />
      {count} new {count === 1 ? "match" : "matches"}
    </Box>
  );
}

/** The keywords an item matched, on its card */
export function WatchHits({ hits }: { hits: string[] }) {
  if (!hits.length) return null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", fontSize: "0.6875rem" }}>
      <Eye size={12} aria-hidden />
      <Box component="span" sx={{ fontWeight: 600, color: "text.secondary" }}>
        Watching:
      </Box>
      {hits.map((h) => (
        <Box key={h} component="span" sx={{ px: 0.6, borderRadius: "4px", backgroundColor: (t) => (t.palette.mode === "light" ? "#FFF4E0" : "rgba(255, 167, 38, 0.14)"), color: (t) => (t.palette.mode === "light" ? "#7A4800" : "#FFCC80"), fontWeight: 700 }}>
          {h}
        </Box>
      ))}
    </Box>
  );
}
