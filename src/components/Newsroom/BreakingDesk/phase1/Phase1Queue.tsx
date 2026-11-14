"use client";

// Phase 1's queue and Posted list: text-first rows (most posts have no picture). Queue rows show the headline
// with the file's badges, district, time and an age dot; the post itself is read in the studio. Rows are plain
// and light so a day of ~700 files stays quick.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import { Ban, Check, Copy, Eye, Lock, PenLine, Undo2 } from "lucide-react";
import type { PublishedPost, QueueItem } from "@/lib/socia/types";
import { usePermissions } from "@/lib/access/usePermissions";
import type { FtpNewsItem, SocialPost } from "@/types/newsroom";
import { fileUrl, isLiveItem, postToSocial, useLiveDesk } from "../live/LiveDesk";
import PostedPreviewDialog from "../PostedPreviewDialog";
import type { QueueViewProps } from "../QueueViews";
import { freshHighlightSx } from "../NewStoriesPill";
import { srOnly, timeAgo } from "../shared";
import { X_LIMIT } from "../socialText";
import { XRichText, X_COLORS } from "./XPostPreview";
import { Badge, NeedsCheckBadges, Phase1Badges, needsCheckHint, needsCheckLabel, shownNeedsCheck } from "./badges";
import { ageTone } from "../deskRules";
import { placeLine, reporterWithDistrict } from "../reporterLabel";
import { canCorrect, editedLabel, needsCheckDescription } from "../live/correction";

const AGE_COLOR = { fresh: "success.main", recent: "warning.main", old: "text.disabled" } as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

const rowSx = { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "52px minmax(0, 1fr) auto" }, gap: { xs: 1, md: 1.5 }, alignItems: "start", px: { xs: 1.5, md: 2 }, py: 1.5, borderTop: "1px solid", borderColor: "divider" } as const;
const frameSx = { backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", overflow: "hidden", "& > :first-of-type": { borderTop: 0 } } as const;

/** "Needs a check: <label>. <hint>." for screen readers; "" when nothing needs a check */
const checksText = (live: QueueItem | null) => (live ? needsCheckDescription(shownNeedsCheck(live.needsCheck), needsCheckLabel, needsCheckHint) : "");

/**
 * The needs-check tags with their hints in text, not only in the hover title: the tags are hidden from screen
 * readers and the same words (label and hint) are read once, from a visually hidden line. `id` lets a row point
 * aria-describedby at that line.
 */
function NeedsCheckTags({ live, id }: { live: QueueItem; id?: string }) {
  const text = checksText(live);
  if (!text) return null;
  return (
    <>
      <Box component="span" aria-hidden sx={{ display: "contents" }}>
        <NeedsCheckBadges needsCheck={live.needsCheck} />
      </Box>
      {/* With an id the row reads it as its description only (aria-hidden keeps it out of the row's name) */}
      <Box component="span" id={id} aria-hidden={id ? true : undefined} sx={srOnly}>
        {text}
      </Box>
    </>
  );
}

/** Where the file came from and what it said, on one wrapping line; `reasons` false leaves the needs-check tags out */
function RowMeta({ live, reasons = true }: { live: QueueItem; reasons?: boolean }) {
  const place = placeLine(live.district, live.town);
  const reporter = reporterWithDistrict(live.reporter, live.district);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", fontSize: "0.75rem", color: "text.secondary" }}>
      <Phase1Badges tags={live.tags} needsCheck={live.needsCheck} showReasons={false} />
      {reasons && <NeedsCheckTags live={live} />}
      {place && <span>{place}</span>}
      {reporter && (
        <Box component="span" title="Reporter" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
          <Box component="span" sx={srOnly}>
            Reporter:{" "}
          </Box>
          {reporter}
        </Box>
      )}
      {live.card?.state === "ready" && <Badge tone="plain">Card</Badge>}
    </Box>
  );
}

/** The post as it went out (Posted list), clamped to three lines, in X's colours */
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
const lazyRowSx = { contentVisibility: "auto", containIntrinsicSize: "auto 76px" } as const;
// The needs-check tags just left of Reject: they wrap among themselves, so a long list never squeezes the headline
const issueTagsSx = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5, justifyContent: { xs: "flex-start", md: "flex-end" }, maxWidth: { md: 240 }, mr: { md: 0.5 } } as const;
const rejectSx = { width: { xs: 40, md: 34 }, height: { xs: 40, md: 34 }, borderRadius: "8px", color: "error.main", "&:hover": { backgroundColor: "rgba(211, 47, 47, 0.08)" } } as const;
const openSx = { minHeight: { xs: 40, md: 34 }, borderRadius: "8px", textTransform: "none", fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap", boxShadow: "none", "&.MuiButton-contained": { backgroundColor: "text.primary", color: "background.paper", "&:hover": { backgroundColor: "text.primary", opacity: 0.88 } } } as const;

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
  /** The list's minute clock (see QueueViewProps.now) */
  now?: number;
  onFocusId: (id: string) => void;
  onOpen: (item: FtpNewsItem) => void;
  onReject: (item: FtpNewsItem) => void;
}

/** One ready post. Memoised: a poll that changes nothing about this story doesn't re-render it. */
const QueueRow = React.memo(function QueueRow({ item, focused, held, canAct, canReject, highlighted, now, onFocusId, onOpen, onReject }: RowProps) {
  const live = isLiveItem(item) ? item.live : null;
  return (
    <Box
      id={phase1RowId(item.id)}
      // A listbox option: the selected row is the one the preview panel shows and Tab lands on; J/K or the arrows move it
      role="option"
      // Why it needs a second look (label and hint), read after the row's name
      aria-describedby={live && checksText(live) ? `${phase1RowId(item.id)}-checks` : undefined}
      tabIndex={focused ? 0 : -1}
      aria-selected={focused}
      onClick={() => onFocusId(item.id)}
      onFocus={(e: React.FocusEvent) => e.target === e.currentTarget && onFocusId(item.id)}
      onDoubleClick={() => canAct && onOpen(item)}
      sx={[focused ? rowFocusedSx : rowIdleSx, lazyRowSx, highlighted ? freshHighlightSx : {}, { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }]}
    >
      <Box sx={{ display: { xs: "none", md: "block" }, pt: 0.25 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 0.5 }}>
          <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, backgroundColor: AGE_COLOR[ageTone(item.receivedAt, now)] }} />
          {clock(item.receivedAt)}
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{timeAgo(item.receivedAt, now)}</Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        {live && <RowMeta live={live} reasons={false} />}
        <Typography lang="hi" sx={{ mt: 0.5, fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.45, overflowWrap: "anywhere" }}>
          <Box component="span" sx={{ display: { md: "none" }, color: "text.secondary", fontWeight: 500, fontVariantNumeric: "tabular-nums", mr: 0.75 }}>
            {clock(item.receivedAt)}
          </Box>
          {item.headline || "No headline"}
        </Typography>
        {held && (
          <Tooltip title={`${held} is working on this story`}>
            <Box component="span" sx={{ display: "inline-flex", mt: 0.5, px: 0.75, py: 0.125, borderRadius: "4px", fontSize: "0.6875rem", fontWeight: 600, backgroundColor: "action.selected", color: "text.secondary" }}>In Progress</Box>
          </Tooltip>
        )}
      </Box>
      <Box sx={{ gridColumn: { xs: 1, md: "auto" }, display: "flex", alignItems: "center", gap: 0.5, justifyContent: { xs: "flex-start", md: "flex-end" } }} onClick={(e) => e.stopPropagation()}>
        {live && shownNeedsCheck(live.needsCheck).length > 0 && (
          <Box sx={issueTagsSx}>
            <NeedsCheckTags live={live} id={`${phase1RowId(item.id)}-checks`} />
          </Box>
        )}
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

/** Phase 1 queue: one row per ready post, a listbox whose selection the preview panel shows. Same props as the cards and table, so J/K/Enter/R keep working. */
export function Phase1QueueList({ items, focusedId, onFocus, onOpen, onReject, canAct, canReject = canAct, heldBy, highlightIds, now }: QueueViewProps) {
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
    <Box role="listbox" aria-label="Ready posts" aria-orientation="vertical" sx={frameSx}>
      {items.map((item) => (
        <QueueRow
          key={item.id}
          item={item}
          focused={item.id === focusedId}
          held={heldBy?.(item.id) ?? null}
          canAct={canAct}
          canReject={canReject}
          highlighted={!!highlightIds?.has(item.id)}
          now={now}
          onFocusId={onFocusId}
          onOpen={onOpen}
          onReject={onReject}
        />
      ))}
    </Box>
  );
}

const previewSx = { minHeight: 44, minWidth: 44, borderRadius: "8px", textTransform: "none", fontSize: "0.8125rem", fontWeight: 600, whiteSpace: "nowrap" } as const;

/**
 * What the preview shows for a Posted row, best source first: the post record the queue row carries
 * (`posted.text`, exactly what went out, with its card and link); from an older server without it, the matching
 * record among the desk's loaded GET /posts; failing that, the draft's own postText and card, which is what
 * Copy & Mark Posted recorded unless the draft changed afterwards.
 */
function postedPreview(item: FtpNewsItem, live: QueueItem | null, loaded: PublishedPost | undefined): SocialPost {
  const posted = live?.posted;
  const record: PublishedPost | undefined =
    posted?.text !== undefined
      ? {
          id: item.id,
          draftId: item.id,
          platform: "x",
          text: posted.text,
          permalink: posted.permalink ?? null,
          publishedAt: posted.publishedAt ?? posted.at,
          publishedBy: posted.publishedBy ?? posted.by?.name ?? null,
          recalled: posted.recalled ? { at: posted.recalled.at, reason: posted.recalled.reason ?? "" } : null,
          cardUrl: posted.cardUrl ?? null,
          manual: posted.manual,
          copied: posted.copied,
        }
      : loaded;
  if (record) return { ...postToSocial(record), headline: item.headline || record.headline || record.text };
  return {
    id: item.id,
    newsId: item.id,
    platform: "X (Twitter)",
    headline: item.headline || "No headline",
    text: live?.postText ?? "",
    hashtags: [],
    mentions: [],
    mediaKind: "image",
    thumbUrl: fileUrl(live?.cardUrl),
    postUrl: "",
    postedAt: posted?.at ?? item.receivedAt,
    postedBy: posted?.by?.name ?? "Posted by hand",
    status: "live",
    byHand: true,
    postedByName: posted?.by?.name ?? null,
  };
}

/** Phase 1 Posted tab: posts marked with Copy & Mark Posted, newest first, with Undo inside the server's window. */
export function Phase1PostedList({
  items,
  onNotice,
  onEdit,
}: {
  items: FtpNewsItem[];
  onNotice: (message: string) => void;
  /** Fix a posted story in the editor; it stays posted. Shown on rows the server marks `canCorrect`. */
  onEdit?: (item: FtpNewsItem) => Promise<void>;
}) {
  const desk = useLiveDesk();
  const { can } = usePermissions();
  const mayUndo = can("post.mark_posted");
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<SocialPost | null>(null);
  // The newest post record per draft (GET /posts is newest first)
  const records = useMemo(() => {
    const byDraft = new Map<string, PublishedPost>();
    for (const p of desk?.posts.data?.items ?? []) if (!byDraft.has(p.draftId)) byDraft.set(p.draftId, p);
    return byDraft;
  }, [desk?.posts.data]);
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
  const edit = async (item: FtpNewsItem) => {
    if (!onEdit || editing) return;
    setEditing(item.id);
    try {
      await onEdit(item);
    } finally {
      setEditing(null);
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
        const canUndo = mayUndo && !!posted?.undoUntil && new Date(posted.undoUntil).getTime() > now;
        const editable = !!onEdit && !!desk?.canAct && canCorrect(live);
        const edited = editedLabel(live?.corrected);
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
                  {posted.by ? `Copied by ${posted.by.name}` : "Copied"} at {clock(posted.at)}, file in at {clock(item.receivedAt)}
                  {edited && (
                    // Focusable, so keyboard users get the tooltip too; screen readers hear "Edited" and then who and when
                    <>
                      <Tooltip title={edited} describeChild>
                        <Box component="span" tabIndex={0} aria-describedby={`edited-${item.id}`} data-testid="edited-mark" sx={{ display: "inline-block", ml: 1, px: 0.625, borderRadius: "4px", border: "1px solid", borderColor: "divider", fontSize: "0.6875rem", fontWeight: 600, lineHeight: 1.6, color: "text.secondary", verticalAlign: "1px", "&:focus-visible": { outline: "2px solid", outlineColor: "text.primary", outlineOffset: "1px" } }}>
                          Edited
                        </Box>
                      </Tooltip>
                      <Box component="span" id={`edited-${item.id}`} sx={srOnly}>
                        {edited}
                      </Box>
                    </>
                  )}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: { xs: "flex-start", md: "flex-end" } }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setPreviewing(postedPreview(item, live, records.get(item.id)))}
                startIcon={<Eye size={14} />}
                aria-label={`Preview what was posted: ${item.headline || "No headline"}`}
                aria-haspopup="dialog"
                sx={previewSx}
              >
                Preview
              </Button>
              {live?.postText && (
                <Tooltip title={copied === item.id ? "Copied" : "Copy the post again"}>
                  <IconButton size="small" onClick={() => void copy(item.id, live.postText ?? "")} aria-label={`Copy the post again: ${item.headline}`} sx={{ width: 36, height: 36, borderRadius: "8px" }}>
                    {copied === item.id ? <Check size={15} color={X_COLORS.blue} /> : <Copy size={15} />}
                  </IconButton>
                </Tooltip>
              )}
              {editable && (
                <Tooltip title="Fix the text or card. It stays posted; copy the fixed text and edit the tweet on X by hand.">
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => void edit(item)}
                      disabled={!!editing}
                      startIcon={editing === item.id ? <CircularProgress size={13} color="inherit" /> : <PenLine size={14} />}
                      aria-label={`Edit the posted story: ${item.headline || "No headline"}`}
                      sx={previewSx}
                    >
                      Edit
                    </Button>
                  </span>
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
      {previewing && <PostedPreviewDialog post={previewing} onClose={() => setPreviewing(null)} />}
    </Box>
  );
}
