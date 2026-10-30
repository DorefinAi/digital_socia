"use client";

// Phase 1's queue and Posted list: text-first rows (most posts have no picture), each showing the ready post
// as X will read it, with the file's badges. Rows are plain and light so a day of ~700 files stays quick.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { Ban, Check, Copy, Lock, PenLine, Undo2 } from "lucide-react";
import type { QueueItem } from "@/lib/socia/types";
import { usePermissions } from "@/lib/access/usePermissions";
import type { FtpNewsItem } from "@/types/newsroom";
import { isLiveItem, useLiveDesk } from "../live/LiveDesk";
import type { QueueViewProps } from "../QueueViews";
import { freshHighlightSx } from "../NewStoriesPill";
import { timeAgo } from "../shared";
import { X_LIMIT } from "../socialText";
import { XRichText, X_COLORS } from "./XPostPreview";
import { Badge, Phase1Badges } from "./badges";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

const rowSx = { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "52px minmax(0, 1fr) auto" }, gap: { xs: 1, md: 1.5 }, alignItems: "start", px: { xs: 1.5, md: 2 }, py: 1.5, borderTop: "1px solid", borderColor: "divider" } as const;
const frameSx = { backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", overflow: "hidden", "& > :first-of-type": { borderTop: 0 } } as const;

/** Where the file came from and what it said, on one wrapping line */
function RowMeta({ live }: { live: QueueItem }) {
  const place = [live.district, live.town].filter(Boolean).join(" · ");
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", fontSize: "0.75rem", color: "text.secondary" }}>
      <Phase1Badges tags={live.tags} needsCheck={live.needsCheck} deskNoteRemoved={live.deskNoteRemoved} />
      {place && <span>{place}</span>}
      {live.desk && <span>Desk {live.desk}</span>}
      {live.card?.state === "ready" && <Badge tone="plain">Card</Badge>}
    </Box>
  );
}

/** The ready post, clamped to three lines, in X's colours */
function PostText({ text, length }: { text: string; length?: number }) {
  const over = typeof length === "number" && length > X_LIMIT;
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5, mt: 0.5 }}>
      <Typography component="div" lang="hi" sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", lineHeight: 1.55, color: "text.secondary", whiteSpace: "pre-line", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {/* Blank lines would spend the three clamped lines on nothing */}
        <XRichText text={text.replace(/\n\s*\n/g, "\n")} />
      </Typography>
      {typeof length === "number" && (
        <Typography sx={{ flexShrink: 0, fontSize: "0.6875rem", fontVariantNumeric: "tabular-nums", color: over ? "error.main" : "text.disabled", fontWeight: over ? 700 : 500 }}>
          {length}/{X_LIMIT}
        </Typography>
      )}
    </Box>
  );
}

// Row looks, hoisted so a re-render builds nothing new
const rowFocusedSx = { ...rowSx, backgroundColor: "action.selected", boxShadow: "inset 3px 0 0 0 currentColor" } as const;
const rowIdleSx = { ...rowSx, "&:hover": { backgroundColor: "action.hover" } } as const;
// Off-screen rows skip layout and paint until scrolled near (a day can hold hundreds)
const lazyRowSx = { contentVisibility: "auto", containIntrinsicSize: "auto 150px" } as const;
const rejectSx = { width: { xs: 40, md: 34 }, height: { xs: 40, md: 34 }, borderRadius: "8px", color: "text.secondary", "&:hover": { color: "error.main" } } as const;
const openSx = { minHeight: { xs: 40, md: 34 }, borderRadius: "8px", textTransform: "none", fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap", boxShadow: "none" } as const;

/** The DOM id of a queue row, so the desk can return focus to it after the editor closes */
export const phase1RowId = (id: string) => `p1-row-${id}`;

interface RowProps {
  item: FtpNewsItem;
  focused: boolean;
  /** Who else holds the story, or null */
  held: string | null;
  canAct: boolean;
  canReject: boolean;
  highlighted: boolean;
  onFocusId: (id: string) => void;
  onOpen: (item: FtpNewsItem) => void;
  onReject: (item: FtpNewsItem) => void;
}

/** One ready post. Memoised: a poll that changes nothing about this story doesn't re-render it. */
const QueueRow = React.memo(function QueueRow({ item, focused, held, canAct, canReject, highlighted, onFocusId, onOpen, onReject }: RowProps) {
  const live = isLiveItem(item) ? item.live : null;
  return (
    <Box
      id={phase1RowId(item.id)}
      role="listitem"
      // Roving focus: the current row is the one Tab lands on; J/K move it
      tabIndex={focused ? 0 : -1}
      aria-current={focused || undefined}
      onClick={() => onFocusId(item.id)}
      onFocus={(e: React.FocusEvent) => e.target === e.currentTarget && onFocusId(item.id)}
      onDoubleClick={() => canAct && onOpen(item)}
      sx={[focused ? rowFocusedSx : rowIdleSx, lazyRowSx, highlighted ? freshHighlightSx : {}, { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }]}
    >
      <Box sx={{ display: { xs: "none", md: "block" }, pt: 0.25 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{clock(item.receivedAt)}</Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{timeAgo(item.receivedAt)}</Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        {live && <RowMeta live={live} />}
        <Typography lang="hi" sx={{ mt: 0.5, fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" }}>
          <Box component="span" sx={{ display: { md: "none" }, color: "text.secondary", fontWeight: 500, fontVariantNumeric: "tabular-nums", mr: 0.75 }}>
            {clock(item.receivedAt)}
          </Box>
          {item.headline || "No headline"}
        </Typography>
        {live?.postText && <PostText text={live.postText} length={live.length} />}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: { xs: "flex-start", md: "flex-end" } }} onClick={(e) => e.stopPropagation()}>
        {canReject && !held && (
          <Tooltip title="Reject (R)">
            <IconButton size="small" aria-label={`Reject ${item.headline}`} onClick={() => onReject(item)} sx={rejectSx}>
              <Ban size={15} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={held ? `${held} is working on this story. Open it to read` : canAct ? "Open to check and copy (Enter)" : "Your role can read posts but not mark them posted"}>
          <span>
            <Button size="small" variant={held ? "outlined" : "contained"} onClick={() => onOpen(item)} disabled={!canAct} startIcon={canAct && !held ? <PenLine size={14} /> : <Lock size={14} />} sx={openSx}>
              {held ? `${held} has it` : "Open"}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
});

/** Phase 1 queue: one row per ready post. Same props as the cards and table, so J/K/Enter/R keep working. */
export function Phase1QueueList({ items, focusedId, onFocus, onOpen, onReject, canAct, canReject = canAct, heldBy, highlightIds }: QueueViewProps) {
  // Rows report focus by id; the desk keeps an index. Read through refs so the callback never changes.
  const latest = useRef({ items, onFocus });
  useEffect(() => {
    latest.current = { items, onFocus };
  });
  const onFocusId = useCallback((id: string) => {
    const { items: list, onFocus: focus } = latest.current;
    const i = list.findIndex((n) => n.id === id);
    if (i >= 0) focus(i);
  }, []);
  return (
    <Box role="list" aria-label="Ready posts" sx={frameSx}>
      {items.map((item) => (
        <QueueRow
          key={item.id}
          item={item}
          focused={item.id === focusedId}
          held={heldBy?.(item.id) ?? null}
          canAct={canAct}
          canReject={canReject}
          highlighted={!!highlightIds?.has(item.id)}
          onFocusId={onFocusId}
          onOpen={onOpen}
          onReject={onReject}
        />
      ))}
    </Box>
  );
}

/** Phase 1 Posted tab: posts marked with Copy & Posted, newest first, with Undo inside the server's window. */
export function Phase1PostedList({ items, onNotice }: { items: FtpNewsItem[]; onNotice: (message: string) => void }) {
  const desk = useLiveDesk();
  const { can } = usePermissions();
  const mayUndo = can("post.mark_posted");
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  // Undo buttons disappear when their window closes
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch {
      onNotice("The browser blocked the clipboard. Open the post and copy the text by hand.");
    }
  };
  const undo = async (id: string, headline: string) => {
    if (!desk) return;
    setUndoing(id);
    const error = await desk.undoCopied(id);
    setUndoing(null);
    onNotice(error ?? `"${headline}" is back in the queue.`);
  };

  return (
    <Box role="list" aria-label="Posted" sx={frameSx}>
      {items.map((item) => {
        const live = isLiveItem(item) ? item.live : null;
        const posted = live?.posted;
        const canUndo = mayUndo && !!posted && new Date(posted.undoUntil).getTime() > now;
        return (
          <Box key={item.id} role="listitem" sx={rowSx}>
            <Box sx={{ display: { xs: "none", md: "block" }, pt: 0.25 }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{posted ? clock(posted.at) : "-"}</Typography>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>posted</Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              {live && <RowMeta live={live} />}
              <Typography lang="hi" sx={{ mt: 0.5, fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                {item.headline || "No headline"}
              </Typography>
              {live?.postText && <PostText text={live.postText} />}
              {posted && (
                <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>
                  Copied by {posted.by.name} at {clock(posted.at)}, file in at {clock(item.receivedAt)}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: { xs: "flex-start", md: "flex-end" } }}>
              {live?.postText && (
                <Tooltip title={copied === item.id ? "Copied" : "Copy the post again"}>
                  <IconButton size="small" onClick={() => void copy(item.id, live.postText ?? "")} aria-label={`Copy the post again: ${item.headline}`} sx={{ width: 36, height: 36, borderRadius: "8px" }}>
                    {copied === item.id ? <Check size={15} color={X_COLORS.blue} /> : <Copy size={15} />}
                  </IconButton>
                </Tooltip>
              )}
              {canUndo && (
                <Tooltip title="Back to the queue (possible for 5 minutes after posting). Delete it on X by hand if it went out.">
                  <span>
                    <Button size="small" onClick={() => void undo(item.id, item.headline)} disabled={undoing === item.id} startIcon={<Undo2 size={14} />} sx={{ minHeight: 34, textTransform: "none", fontWeight: 600 }}>
                      Undo
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
