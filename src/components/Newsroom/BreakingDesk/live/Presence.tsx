"use client";

// Who is on a story, as small round initials badges: the story list's row corner (RowPresence, with
// RowPresenceSpace keeping the headline clear of it) and the editor's top bar (HeaderPresence). Each reads only
// its own story's presence (useStoryPresence), so a change on one story re-renders nothing else. Drawn only
// while live presence is connected (src/lib/socia/live.tsx).

import React from "react";
import { Box, Tooltip, useTheme } from "@mui/material";
import { useLiveActions, useLiveStatus, useStoryPresence } from "@/lib/socia/live";
import { groupPresence, presenceLines, presenceSummary, readableFill, visibleViewers, type PresenceEntry, type StoryPresence } from "@/lib/socia/liveCore";
import { srOnly } from "../shared";

/**
 * One person's badge. The fill is their colour darkened just enough for white initials (readableFill); the
 * editor's has a ring in their own colour (a gap in `gap` keeps it off the fill); a viewer's is faded. Initials
 * only: the names are in the tooltip and the screen-reader text.
 */
export function PresenceBadge({ entry, size, editing, gap }: { entry: PresenceEntry; size: number; editing: boolean; gap: string }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        flexShrink: 0,
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: readableFill(entry.color),
        color: "#fff",
        fontSize: Math.round(size * 0.46),
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        boxShadow: editing ? `0 0 0 1.5px ${gap}, 0 0 0 3px ${entry.color}` : `0 0 0 1.5px ${gap}`,
        opacity: editing ? 1 : 0.62,
        userSelect: "none",
      }}
    >
      {entry.initials}
    </Box>
  );
}

const ROW_BADGE = 18;
const ROW_OVERLAP = 5;
/** Room between the editor's badge and the viewers */
const EDITOR_GAP = 5;
/** Roughly the "+N" after the viewers */
const MORE_W = 14;

/** How wide a row's badges are, so the headline can keep clear of them */
export function badgesWidth(group: StoryPresence, size = ROW_BADGE, overlap = ROW_OVERLAP): number {
  const { shown, more } = visibleViewers(group.viewers);
  let w = group.editor ? size + (shown.length ? EDITOR_GAP : 0) : 0;
  if (shown.length) w += size + (shown.length - 1) * (size - overlap);
  if (more) w += 3 + MORE_W;
  return w;
}

/** The badges in a row: the editor first, then up to three viewers overlapping, then "+N" */
function BadgeRow({ group, size, gap, overlap }: { group: StoryPresence; size: number; gap: string; overlap: number }) {
  const { shown, more } = visibleViewers(group.viewers);
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
      {group.editor && (
        <Box component="span" sx={{ display: "inline-flex", mr: shown.length ? `${EDITOR_GAP}px` : 0 }}>
          <PresenceBadge entry={group.editor} size={size} editing gap={gap} />
        </Box>
      )}
      {shown.map((v, i) => (
        <Box key={v.userId} component="span" sx={{ display: "inline-flex", ml: i ? `-${overlap}px` : 0, zIndex: shown.length - i }}>
          <PresenceBadge entry={v} size={size} editing={false} gap={gap} />
        </Box>
      ))}
      {more > 0 && (
        <Box component="span" aria-hidden sx={{ ml: "3px", fontSize: Math.round(size * 0.5), fontWeight: 700, lineHeight: 1, color: "inherit", opacity: 0.8 }}>
          +{more}
        </Box>
      )}
    </Box>
  );
}

// Two people with the same name give the same line, so lines are keyed by position
const TooltipLines = ({ lines }: { lines: string[] }) => (
  <Box sx={{ py: 0.25 }}>
    {lines.map((l, i) => (
      <Box key={i} sx={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
        {l}
      </Box>
    ))}
  </Box>
);

/** A row's people, minus the person looking; null when there is nobody to show */
function useRowGroup(draftId: string): StoryPresence | null {
  const { connected } = useLiveStatus();
  const { me } = useLiveActions();
  const entries = useStoryPresence(draftId);
  const group = groupPresence(entries, me);
  return connected && (group.editor || group.viewers.length) ? group : null;
}

/**
 * The story list's badges, for the row's top-right corner: 18px, taking no room in the row (the row places
 * them). The person looking is left out. Hover for the names; screen readers hear them in the row's text.
 */
export function RowPresence({ draftId }: { draftId: string }) {
  const theme = useTheme();
  const group = useRowGroup(draftId);
  if (!group) return null;
  const lines = presenceLines(group);
  return (
    <Tooltip title={<TooltipLines lines={lines} />} placement="top" arrow describeChild>
      <Box component="span" data-testid="row-presence" sx={{ display: "inline-flex", alignItems: "center", height: ROW_BADGE, color: "text.secondary" }}>
        <BadgeRow group={group} size={ROW_BADGE} gap={theme.palette.background.paper} overlap={ROW_OVERLAP} />
        <Box component="span" sx={srOnly}>
          {lines.join(". ")}.
        </Box>
      </Box>
    </Tooltip>
  );
}

/**
 * Keeps the headline's first line clear of the corner badges: a float as wide as the badges (and the
 * needs-check tag beside them, `besideWidth`), one line tall, at the start of the headline. Only the first line
 * wraps around it; nothing is reserved while nobody else is on the story, so rows look as before.
 */
export function RowPresenceSpace({ draftId, besideWidth = 0 }: { draftId: string; besideWidth?: number }) {
  const group = useRowGroup(draftId);
  if (!group) return null;
  return <Box component="span" aria-hidden sx={{ float: "right", width: badgesWidth(group) + besideWidth, height: "1em" }} />;
}

/**
 * The editor top bar's badges for everyone on this story (the person looking included) and a short line such
 * as "Priya editing · 2 viewing". Nothing when only they are here, or when live presence isn't connected.
 */
export function HeaderPresence({ draftId, barColor }: { draftId: string; barColor: string }) {
  const { connected } = useLiveStatus();
  const { me } = useLiveActions();
  const group = groupPresence(useStoryPresence(draftId));
  const summary = presenceSummary(group, me);
  if (!connected || !summary) return null;
  const lines = presenceLines(group, me);
  return (
    <Tooltip title={<TooltipLines lines={lines} />} arrow>
      <Box
        role="group"
        tabIndex={0}
        aria-label={`On this story: ${lines.join(", ")}`}
        sx={{ display: { xs: "none", sm: "inline-flex" }, alignItems: "center", gap: 1, flexShrink: 0, px: 0.75, height: 32, borderRadius: "8px", color: "rgba(255,255,255,0.78)", "&:focus-visible": { outline: "2px solid #fff", outlineOffset: "1px" } }}
      >
        <BadgeRow group={group} size={22} gap={barColor} overlap={6} />
        <Box component="span" aria-hidden sx={{ display: { xs: "none", md: "inline" }, fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}>
          {summary}
        </Box>
      </Box>
    </Tooltip>
  );
}
