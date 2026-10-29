"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, CircularProgress, Dialog, IconButton, Typography } from "@mui/material";
import { X } from "lucide-react";
import type { ScraperItem } from "@/types/newsroom";
import { AI_CONTENT_PLATFORMS, type AiContentPlatform } from "@/components/leftNavigation/aiContentPlatforms";
import { USE_MOCKS } from "@/lib/socia/config";
import { draftFromTrend } from "@/lib/socia/trends";
import { prefillHref } from "@/lib/trendPrefill";
import { errorText } from "@/components/Newsroom/SociaDesk/liveShared";

/** The platform the operator picked last time, focused first next time. */
const LAST_KEY = "socia_trend_draft_platform";

/** The live API adds these to a trend; demo items do not have them. */
type TrendFields = ScraperItem & { district?: string | null; sourceName?: string };

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function saveLast(key: string) {
  try {
    localStorage.setItem(LAST_KEY, key);
  } catch {}
}

/** Real drafts only for platforms Socia posts to (X), and only on the live backend. */
const goesToQueue = (p: AiContentPlatform) => p.live && !USE_MOCKS;

function noteFor(p: AiContentPlatform): string {
  if (goesToQueue(p)) return "Adds a draft to the X queue";
  if (p.live) return "Opens the demo X editor";
  return "Draft only — posting not live";
}

/**
 * "Create a draft for…": one tile per AI Content Review platform (the sidebar's list).
 * X makes a real draft through Socia and opens it; the others open that platform's editor filled in with the trend.
 */
export default function CreateDraftDialog({ item, open, onClose }: { item: ScraperItem | null; open: boolean; onClose: () => void }) {
  // Keep the last item on screen while the dialog fades out
  const [shown, setShown] = useState<ScraperItem | null>(item);
  if (item && item !== shown) setShown(item);
  const current = item ?? shown;

  return (
    <Dialog
      open={open && !!current}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="create-draft-title"
      aria-describedby="create-draft-topic"
      slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none", m: 2, width: "calc(100% - 32px)" } } }}
    >
      {current && <Picker key={current.id} item={current} onClose={onClose} />}
    </Dialog>
  );
}

function Picker({ item, onClose }: { item: TrendFields; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last] = useState(readLast);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = Math.max(0, AI_CONTENT_PLATFORMS.findIndex((p) => p.platformKey === last));
  // The tile used last takes focus, one frame after the dialog's own focus trap has focused the box
  useEffect(() => {
    const id = requestAnimationFrame(() => tiles.current[focusIndex]?.focus());
    return () => cancelAnimationFrame(id);
  }, [focusIndex]);

  const choose = async (p: AiContentPlatform) => {
    if (busy) return;
    saveLast(p.platformKey);
    setError(null);
    if (goesToQueue(p)) {
      setBusy(p.platformKey);
      try {
        const { draftId } = await draftFromTrend(item.id, "x");
        router.push(`${p.path}?compose=${encodeURIComponent(draftId)}`);
      } catch (err) {
        setError(errorText(err));
        setBusy(null);
      }
      return;
    }
    // Every other tile (and X on the demo data): that platform's editor, filled in with the trend. Nothing is posted.
    setBusy(p.platformKey);
    router.push(prefillHref(p.path, { headline: item.title, text: item.reasonWhy, district: item.district ?? "", source: item.url }));
  };

  // Arrow keys move between tiles in the 2-column grid; Tab still works as usual
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key];
    if (!step) return;
    const next = i + step;
    if (next < 0 || next >= AI_CONTENT_PLATFORMS.length) return;
    e.preventDefault();
    tiles.current[next]?.focus();
  };

  const meta = [item.district, item.sourceName].filter(Boolean).join(", ");

  return (
    <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography id="create-draft-title" component="h2" sx={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.4 }}>
            Create a draft for…
          </Typography>
          <Typography
            id="create-draft-topic"
            sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5, lineHeight: 1.45, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {item.title}
          </Typography>
          {meta && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>{meta}</Typography>}
        </Box>
        <IconButton size="small" aria-label="Close" onClick={onClose} sx={{ borderRadius: "8px", mt: -0.5, mr: -0.5, flexShrink: 0 }}>
          <X size={16} />
        </IconButton>
      </Box>

      <Box component="ul" aria-label="Platforms" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        {AI_CONTENT_PLATFORMS.map((p, i) => {
          const real = goesToQueue(p);
          const isLast = last === p.platformKey;
          const noteId = `create-draft-note-${p.platformKey}`;
          return (
            <Box component="li" key={p.platformKey} sx={{ minWidth: 0 }}>
              <Box
                component="button"
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  tiles.current[i] = el;
                }}
                disabled={!!busy && busy !== p.platformKey}
                aria-busy={busy === p.platformKey || undefined}
                aria-describedby={noteId}
                onClick={() => void choose(p)}
                onKeyDown={(e: React.KeyboardEvent) => onKeyDown(e, i)}
                sx={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  minHeight: 88,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 1,
                  p: 1.5,
                  textAlign: "left",
                  border: "1px solid",
                  borderColor: isLast ? "text.primary" : "divider",
                  borderRadius: "10px",
                  backgroundColor: "background.paper",
                  color: "text.primary",
                  fontFamily: "inherit",
                  cursor: busy ? "default" : "pointer",
                  transition: "border-color 120ms, background-color 120ms",
                  "&:hover:not(:disabled)": { borderColor: "text.primary", backgroundColor: "action.hover" },
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: "2px" },
                  "&:disabled": { opacity: 0.45 },
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                  <Box sx={{ width: 20, height: 20, display: "grid", placeItems: "center", flexShrink: 0 }}>{busy === p.platformKey ? <CircularProgress size={16} color="inherit" /> : p.icon(20)}</Box>
                  <Typography component="span" sx={{ fontSize: "0.875rem", fontWeight: 700, overflowWrap: "anywhere" }}>
                    {p.label}
                  </Typography>
                </Box>
                <Typography component="span" id={noteId} sx={{ fontSize: "0.6875rem", color: real ? "success.main" : "text.secondary", fontWeight: real ? 600 : 500, lineHeight: 1.35 }}>
                  {noteFor(p)}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      {error && (
        <Typography role="alert" sx={{ fontSize: "0.8125rem", color: "error.main", lineHeight: 1.45 }}>
          Couldn’t create the X draft. {error}
        </Typography>
      )}
    </Box>
  );
}
