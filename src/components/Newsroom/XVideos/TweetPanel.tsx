"use client";

// The editor's Tweet panel, as on the X desk: where line 1 came from, the post exactly as it is copied (line 1 is
// typed here; the tag line follows the boxes below), the X-weighted counter, the channel label (sets the brand tag),
// "Start with" prefixes, hashtag and mention checkboxes with #FINVideo always on, and Reject / Save draft / Schedule.

import React from "react";
import { Alert, Box, Button, Checkbox, Tooltip, Typography } from "@mui/material";
import { Ban, CalendarClock, Monitor, Save, Scissors, Star } from "lucide-react";
import type { XvClip } from "@/data/xVideosData";
import { X_LIMIT } from "../BreakingDesk/socialText";
import { XV_COLORS } from "./ClipFrame";
import { draftBrand, prefixesFor, type TagRow, type XvDraft } from "./deskState";
import TagAdder from "./TagAdder";
import { FIN_VIDEO_TAG, X_VIDEO_LIMITS, applyLabel, applyPrefix, checkClip, fmtClock, fmtDuration, issueLabel, labelOf, prefixOf } from "./xvTitle";

const sectSx = { display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", color: "text.secondary" } as const;
const boxSx = { border: "1px solid", borderColor: "divider", borderRadius: "8px" } as const;
const chipGroupSx = { display: "inline-flex", flexWrap: "wrap", gap: "2px", p: "3px", border: "1px solid", borderColor: "divider", borderRadius: "8px", backgroundColor: "background.paper", alignSelf: "flex-start", maxWidth: "100%" } as const;
const footBtnSx = { minHeight: 36, minWidth: 0, px: 1.25, borderRadius: "12px", textTransform: "none", fontWeight: 600, fontSize: "0.8125rem", whiteSpace: "nowrap", borderColor: "divider", color: "text.primary", gap: 0.5 } as const;

function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      sx={{ px: 1.125, py: 0.5, border: 0, borderRadius: "6px", font: "inherit", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", backgroundColor: on ? "#ECEEF0" : "transparent", color: on ? "text.primary" : "text.secondary", "&:hover": { color: "text.primary" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 } }}
    >
      {children}
    </Box>
  );
}

function TagRowCheck({ value, on, locked, note, onToggle }: { value: string; on: boolean; locked?: boolean; note?: string; onToggle?: () => void }) {
  return (
    <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 0.75, pl: 0.5, pr: 1.25, minHeight: 34, fontSize: "0.8125rem", fontWeight: 600, borderBottom: "1px solid", borderColor: "divider", cursor: locked ? "default" : "pointer" }}>
      <Checkbox size="small" checked={on} disabled={locked} onChange={onToggle} sx={{ p: 0.5, color: "#555", "&.Mui-checked": { color: "#111" }, "&.Mui-disabled.Mui-checked": { color: "#111", opacity: 0.55 } }} />
      <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        {value}
      </Box>
      {note && <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{note}</Typography>}
    </Box>
  );
}

interface TweetPanelProps {
  clip: XvClip;
  draft: XvDraft;
  text: string;
  length: number;
  onPatch: (patch: Partial<XvDraft>) => void;
  onFit: () => void;
  onRevert: () => void;
  onReject: () => void;
  onSave: () => void;
  onSchedule: (anchor: HTMLElement) => void;
}

export default function TweetPanel({ clip, draft, text, length, onPatch, onFit, onRevert, onReject, onSave, onSchedule }: TweetPanelProps) {
  const label = labelOf(draft.title);
  const brand = draftBrand(draft);
  const prefixes = prefixesFor(clip);
  const prefix = prefixOf(draft.title, prefixes);
  const labels = Array.from(new Set(["Rajasthan News", `${clip.district} News`, "India News", ...(clip.channelLabel ? [clip.channelLabel] : [])]));
  const issues = checkClip(clip, draft.trim);
  const tagLine = text.slice(draft.title.trim().length).trim();
  const over = length > X_LIMIT;
  const share = Math.min(100, (length / X_LIMIT) * 100);
  const hashCount = 1 + (brand && draft.brandOn ? 1 : 0) + draft.hashtags.filter((t) => t.on).length;
  const mentionCount = draft.mentions.filter((t) => t.on).length;

  const toggle = (key: "hashtags" | "mentions", value: string) => onPatch({ [key]: draft[key].map((t) => (t.value === value ? { ...t, on: !t.on } : t)) } as Partial<XvDraft>);
  const addTag = (key: "hashtags" | "mentions", value: string) => {
    const list: TagRow[] = draft[key];
    const lower = value.toLowerCase();
    if (lower === FIN_VIDEO_TAG.toLowerCase() || (brand && lower === brand.toLowerCase())) return;
    const exists = list.find((t) => t.value.toLowerCase() === lower);
    onPatch({ [key]: exists ? list.map((t) => (t === exists ? { ...t, on: true } : t)) : [...list, { value, on: true, added: true }] } as Partial<XvDraft>);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1.75, py: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography component="h2" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>
            Tweet
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Shorten line 1 so the post fits in 280">
            <span>
              <Button size="small" onClick={onFit} disabled={!over} startIcon={<Scissors size={13} />} sx={{ minHeight: 28, textTransform: "none", fontWeight: 600, fontSize: "0.75rem", color: "text.primary" }}>
                Fit to 280
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Back to the suggested line 1 and the clip's tags">
            <Button size="small" onClick={onRevert} sx={{ minHeight: 28, minWidth: 0, textTransform: "none", fontSize: "0.75rem", color: "text.secondary" }}>
              Revert
            </Button>
          </Tooltip>
        </Box>
        <SourceChip draft={draft} />
        <Box sx={{ ...boxSx, px: 1.5, py: 1.25, "&:focus-within": { borderColor: "text.primary" } }}>
          <Box
            component="textarea"
            lang="hi"
            aria-label="Line 1 of the tweet"
            value={draft.title}
            rows={3}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onPatch({ title: e.target.value, source: draft.source.kind === "typed" ? draft.source : { kind: "typed" } })}
            placeholder="Line 1: the headline, then | Rajasthan News"
            sx={{ display: "block", width: "100%", resize: "vertical", minHeight: 64, border: 0, outline: 0, p: 0, background: "none", font: "inherit", fontSize: "0.875rem", lineHeight: 1.55, color: "text.primary" }}
          />
          <Typography lang="hi" aria-label="Tag line" sx={{ mt: 1.25, fontSize: "0.875rem", lineHeight: 1.55, color: "#1D9BF0", overflowWrap: "anywhere" }}>
            {tagLine}
          </Typography>
        </Box>
        <Box>
          <Box role="meter" aria-label="Characters used" aria-valuemin={0} aria-valuemax={X_LIMIT} aria-valuenow={length} sx={{ height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", overflow: "hidden" }}>
            <Box sx={{ height: "100%", width: `${share}%`, backgroundColor: over ? "error.main" : length >= 260 ? "warning.main" : "success.main" }} />
          </Box>
          <Box sx={{ display: "flex", gap: 1, mt: 0.75, alignItems: "flex-start" }}>
            <Typography sx={{ flex: 1, fontSize: "0.75rem", color: "text.secondary" }}>This is the post exactly as it is copied. The video is attached on X.</Typography>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: over ? "error.main" : "text.primary", whiteSpace: "nowrap" }}>
              {length} / {X_LIMIT}
            </Typography>
          </Box>
          {over && <Typography sx={{ mt: 0.25, fontSize: "0.75rem", color: "error.main" }}>{length - X_LIMIT} over X&apos;s limit. Shorten line 1 or untick a tag.</Typography>}
        </Box>

        {issues.length > 0 && (
          <Alert
            severity="warning"
            sx={{ borderRadius: "8px", fontSize: "0.8125rem", py: 0.25 }}
            action={
              issues.some((i) => i.code === "too_long") ? (
                <Button color="inherit" size="small" onClick={() => onPatch({ trim: { start: draft.trim.start, end: Math.min(clip.duration, draft.trim.start + X_VIDEO_LIMITS.seconds) } })} sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>
                  Trim to {fmtDuration(X_VIDEO_LIMITS.seconds)}
                </Button>
              ) : undefined
            }
          >
            <b>Trim needed.</b> {issues.map(issueLabel).join("; ")}. Set the start and end with I and O, or trim it here.
          </Alert>
        )}

        <Box sx={sectSx}>
          <span>CHANNEL LABEL</span>
          <Box component="span" sx={{ fontWeight: 500, letterSpacing: 0 }}>
            sets the brand tag
          </Box>
        </Box>
        <Box role="group" aria-label="Channel label" sx={chipGroupSx}>
          {labels.map((l) => (
            <Chip key={l} on={label === l} onClick={() => onPatch({ title: applyLabel(draft.title, l) })}>
              {l}
            </Chip>
          ))}
          <Chip on={!label} onClick={() => onPatch({ title: applyLabel(draft.title, null) })} label="No channel label">
            none
          </Chip>
        </Box>

        <Box sx={sectSx}>
          <span>START WITH</span>
        </Box>
        <Box role="group" aria-label="Start with" sx={chipGroupSx}>
          {prefixes.map((p) => (
            <Chip key={p} on={prefix === p} onClick={() => onPatch({ title: applyPrefix(draft.title, p, prefixes) })}>
              {p}
            </Chip>
          ))}
          <Chip on={!prefix} onClick={() => onPatch({ title: applyPrefix(draft.title, null, prefixes) })} label="No prefix">
            none
          </Chip>
        </Box>

        <Box sx={sectSx}>
          <span>HASHTAGS</span>
          <Box component="span" sx={{ fontWeight: 500, letterSpacing: 0 }}>
            {hashCount} selected
          </Box>
        </Box>
        <Box role="group" aria-label="Hashtags" sx={boxSx}>
          <TagRowCheck value={FIN_VIDEO_TAG} on locked note="always" />
          {brand && <TagRowCheck value={brand} on={draft.brandOn} note="brand" onToggle={() => onPatch({ brandOn: !draft.brandOn })} />}
          {draft.hashtags.map((t) => (
            <TagRowCheck key={t.value} value={t.value} on={t.on} note={t.added ? "added" : undefined} onToggle={() => toggle("hashtags", t.value)} />
          ))}
          <TagAdder prefix="#" label="Add hashtag" onAdd={(v) => addTag("hashtags", v)} />
        </Box>

        <Box sx={sectSx}>
          <span>MENTIONS</span>
          <Box component="span" sx={{ fontWeight: 500, letterSpacing: 0 }}>
            {mentionCount} selected
          </Box>
        </Box>
        <Box role="group" aria-label="Mentions" sx={boxSx}>
          {draft.mentions.map((t) => (
            <TagRowCheck key={t.value} value={t.value} on={t.on} note={t.added ? "added" : undefined} onToggle={() => toggle("mentions", t.value)} />
          ))}
          <TagAdder prefix="@" label="Add handle" onAdd={(v) => addTag("mentions", v)} />
        </Box>
      </Box>

      <Box sx={{ borderTop: "1px solid", borderColor: "divider", px: 1.5, py: 1.25, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
        <Button variant="outlined" onClick={onReject} sx={{ ...footBtnSx, color: "error.main" }}>
          <Ban size={14} aria-hidden /> Reject
        </Button>
        <Button variant="outlined" onClick={onSave} sx={{ ...footBtnSx, borderColor: "rgba(0,0,0,0.5)" }}>
          <Save size={14} aria-hidden /> Save draft
        </Button>
        <Button variant="outlined" onClick={(e) => onSchedule(e.currentTarget)} aria-haspopup="menu" sx={footBtnSx}>
          <CalendarClock size={14} aria-hidden /> {draft.scheduledAt ? `Scheduled ${new Date(draft.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}` : "Schedule"}
        </Button>
      </Box>
    </Box>
  );
}

/** "★ Line 1 from what was said, 00:42" (yellow) or "▣ Line 1 from the screen, 00:12" (cyan) */
function SourceChip({ draft }: { draft: XvDraft }) {
  const s = draft.source;
  const base = { display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 0.5, px: 0.75, py: "1px", borderRadius: "5px", fontSize: "0.6875rem", fontWeight: 600, border: "1px solid" } as const;
  if (s.kind === "said")
    return (
      <Box sx={{ ...base, backgroundColor: XV_COLORS.tile, borderColor: "#F0D46A", color: "#5C4A00" }}>
        <Star size={11} fill="currentColor" aria-hidden /> Line 1 from what was said, {fmtClock(s.at)}
      </Box>
    );
  if (s.kind === "screen")
    return (
      <Box sx={{ ...base, backgroundColor: "#E0F9FD", borderColor: "#8EE3F0", color: "#0B5563" }}>
        <Monitor size={11} aria-hidden /> Line 1 from the screen, {fmtClock(s.at)}
      </Box>
    );
  if (s.kind === "typed") return <Box sx={{ ...base, backgroundColor: "transparent", borderColor: "divider", color: "text.secondary" }}>Line 1 typed by the desk</Box>;
  return <Box sx={{ ...base, backgroundColor: "transparent", borderColor: "divider", color: "text.secondary" }}>Line 1 is the suggested headline</Box>;
}
