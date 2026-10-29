"use client";

import { memo, useState, type ReactNode } from "react";
import { Box, IconButton, InputBase, Tooltip } from "@mui/material";
import { Captions, Eye, EyeOff, Film, Headphones, Layers, Lock, MoreVertical, Music, Type, Unlock, Volume2, VolumeX } from "lucide-react";
import type { Track, TrackKind } from "../model";
import type { StudioStore } from "../store";
import { HEADER_W, S } from "./layout";

const KIND_ICON: Record<TrackKind, typeof Film> = { video: Film, overlay: Layers, text: Type, caption: Captions, audio: Music };
const HAS_SOUND: Record<TrackKind, boolean> = { video: true, overlay: true, text: false, caption: false, audio: true };
const HAS_PICTURE: Record<TrackKind, boolean> = { video: true, overlay: true, text: true, caption: true, audio: false };

interface TrackHeaderProps {
  track: Track;
  height: number;
  focused: boolean;
  renaming: boolean;
  store: StudioStore;
  onRename: (trackId: string | null) => void;
  /** Open the track menu at a point (right-click, or the options button) */
  onMenu: (at: { x: number; y: number }, trackId: string) => void;
}

/** Buttons that keep focus where it was, so Space after a click still plays */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function Toggle({ on, label, onClick, children, warn }: { on: boolean; label: string; onClick: () => void; children: ReactNode; warn?: boolean }) {
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        aria-pressed={on}
        onMouseDown={keepFocus}
        onClick={onClick}
        sx={{ width: 24, height: 24, borderRadius: "4px", color: on ? (warn ? S.onAccent : S.text) : S.faint, backgroundColor: on && warn ? S.accent : "transparent", "&:hover": { color: on && warn ? S.onAccent : S.text, backgroundColor: on && warn ? S.accent : S.hover } }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

function TrackHeaderImpl({ track, height, focused, renaming, store, onRename, onMenu }: TrackHeaderProps) {
  const [draft, setDraft] = useState(track.name);
  const Icon = KIND_ICON[track.kind];
  const set = (patch: Partial<Pick<Track, "muted" | "hidden" | "locked" | "solo">>) => store.dispatch({ type: "track/set", trackId: track.id, patch });
  const compact = height < 40;

  const finishRename = (commit: boolean) => {
    if (commit) store.dispatch({ type: "track/rename", trackId: track.id, name: draft });
    onRename(null);
  };

  return (
    <Box
      role="group"
      aria-label={`${track.name} track`}
      onPointerDown={() => store.dispatch({ type: "select/track", trackId: track.id })}
      onContextMenu={(e) => {
        if (e.shiftKey || e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        store.dispatch({ type: "select/track", trackId: track.id });
        onMenu({ x: e.clientX, y: e.clientY }, track.id);
      }}
      sx={{
        position: "sticky", left: 0, zIndex: 4, width: HEADER_W, flexShrink: 0, height, display: "flex", alignItems: compact ? "center" : "flex-start",
        flexDirection: compact ? "row" : "column", justifyContent: compact ? "flex-start" : "center", gap: compact ? 0.5 : "2px", px: 1, boxSizing: "border-box",
        backgroundColor: focused ? S.raised : S.chrome, borderRight: `1px solid ${S.line}`, boxShadow: focused ? `inset 2px 0 0 ${S.accent}` : "none",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, width: compact ? "auto" : "100%", flex: compact ? 1 : "none" }}>
        <Icon size={13} aria-hidden color={S.muted} style={{ flexShrink: 0 }} />
        {renaming ? (
          <InputBase
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => finishRename(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishRename(true);
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finishRename(false); }
            }}
            inputProps={{ "aria-label": "Track name", maxLength: 40 }}
            sx={{ flex: 1, minWidth: 0, fontSize: "0.75rem", color: S.text, px: 0.5, height: 22, borderRadius: "4px", backgroundColor: S.stage, boxShadow: `inset 0 0 0 1px ${S.accent}` }}
          />
        ) : (
          <Box
            component="span"
            title="Double-click to rename"
            onDoubleClick={() => { setDraft(track.name); onRename(track.id); }}
            sx={{ flex: 1, minWidth: 0, fontSize: "0.75rem", fontWeight: 600, color: track.hidden ? S.faint : S.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "default" }}
          >
            {track.name}
          </Box>
        )}
        {!compact && (
          <IconButton aria-label={`${track.name} track options`} aria-haspopup="menu" onMouseDown={keepFocus} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu({ x: r.left, y: r.bottom + 2 }, track.id); }} sx={{ width: 22, height: 22, borderRadius: "4px", color: S.muted, "&:hover": { color: S.text, backgroundColor: S.hover } }}>
            <MoreVertical size={13} />
          </IconButton>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: "1px" }}>
        {HAS_SOUND[track.kind] && (
          <>
            <Toggle on={track.muted} label={track.muted ? "Unmute track" : "Mute track"} onClick={() => set({ muted: !track.muted })} warn>
              {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </Toggle>
            <Toggle on={!!track.solo} label={track.solo ? "Stop solo" : "Solo: hear only this track"} onClick={() => set({ solo: !track.solo })} warn>
              <Headphones size={13} />
            </Toggle>
          </>
        )}
        {HAS_PICTURE[track.kind] && (
          <Toggle on={track.hidden} label={track.hidden ? "Show track" : "Hide track"} onClick={() => set({ hidden: !track.hidden })} warn>
            {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </Toggle>
        )}
        <Toggle on={track.locked} label={track.locked ? "Unlock track" : "Lock track"} onClick={() => set({ locked: !track.locked })} warn>
          {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </Toggle>
        {compact && (
          <IconButton aria-label={`${track.name} track options`} aria-haspopup="menu" onMouseDown={keepFocus} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu({ x: r.left, y: r.bottom + 2 }, track.id); }} sx={{ width: 22, height: 22, borderRadius: "4px", color: S.muted, "&:hover": { color: S.text, backgroundColor: S.hover } }}>
            <MoreVertical size={13} />
          </IconButton>
        )}
      </Box>

    </Box>
  );
}

export const TrackHeader = memo(TrackHeaderImpl);
