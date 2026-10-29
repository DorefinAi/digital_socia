"use client";

import { memo, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Box } from "@mui/material";
import { Captions, Film, ImageIcon, Music, Type } from "lucide-react";
import type { Asset, Clip, TrackKind } from "../model";
import { frameAt, useFilmstrip, THUMB_H, THUMB_W } from "./filmstrip";
import { S } from "./layout";
import { Waveform } from "./Waveform";

export type ClipPart = "body" | "start" | "end" | "transition";

export interface ClipHandlers {
  onPointerDown: (e: PointerEvent<HTMLElement>, clipId: string, part: ClipPart) => void;
  onContextMenu: (e: MouseEvent<HTMLElement>, clipId: string) => void;
  /** Arrow keys on a focused trim handle */
  onEdgeKey: (e: KeyboardEvent<HTMLElement>, clipId: string, edge: "start" | "end") => void;
  onFocusSelect: (clipId: string, additive: boolean) => void;
}

interface ClipBlockProps {
  clip: Clip;
  trackKind: TrackKind;
  asset: Asset | null;
  label: string;
  color: string;
  zoom: number;
  height: number;
  selected: boolean;
  locked: boolean;
  dimmed: boolean;
  handlers: ClipHandlers;
}

const EDGE_W = 8;

function Filmstrip({ asset, clip, width, height }: { asset: Asset; clip: Clip & { in: number; speed: number }; width: number; height: number }) {
  const strip = useFilmstrip(asset);
  const tileW = Math.round((height * THUMB_W) / THUMB_H);
  if (asset.kind === "image") {
    return <Box aria-hidden sx={{ position: "absolute", inset: 0, backgroundImage: `url("${asset.url}")`, backgroundSize: `auto 100%`, backgroundRepeat: "repeat-x", opacity: 0.85, pointerEvents: "none" }} />;
  }
  if (!strip.times.length || strip.failed && !strip.frames.some(Boolean)) return null;
  const count = Math.min(400, Math.ceil(width / tileW));
  const zoom = width / clip.duration;
  const tiles = [];
  for (let k = 0; k < count; k++) {
    const t = (k * tileW + tileW / 2) / zoom;
    const src = frameAt(strip, clip.in + t * clip.speed);
    tiles.push(<span key={k} style={{ flex: `0 0 ${tileW}px`, height: "100%", backgroundImage: src ? `url(${src})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />);
  }
  return (
    <Box aria-hidden sx={{ position: "absolute", inset: 0, display: "flex", overflow: "hidden", opacity: 0.9, pointerEvents: "none" }}>
      {tiles}
    </Box>
  );
}

const ICONS = { media: Film, text: Type, caption: Captions, audio: Music } as const;

function ClipBlockImpl({ clip, trackKind, asset, label, color, zoom, height, selected, locked, dimmed, handlers }: ClipBlockProps) {
  const left = clip.start * zoom;
  const width = Math.max(2, clip.duration * zoom);
  const bodyH = height - 6;
  const Icon = clip.type === "media" && asset?.kind === "image" ? ImageIcon : ICONS[clip.type];
  const speed = clip.type === "media" || clip.type === "audio" ? clip.speed : 1;
  const showFilm = clip.type === "media" && !!asset && (trackKind === "video" || trackKind === "overlay");
  const soundOnPicture = clip.type === "media" && asset?.kind === "video" && asset.hasAudio !== false && !clip.audioDetached && trackKind === "video";
  const transitionW = clip.transitionIn ? clip.transitionIn.duration * zoom : 0;
  const narrow = width < 44;

  return (
    <Box
      role="button"
      tabIndex={0}
      data-clip-id={clip.id}
      aria-pressed={selected}
      aria-label={`${label}, ${clip.start.toFixed(2)} to ${(clip.start + clip.duration).toFixed(2)} seconds${locked ? ", locked" : ""}`}
      onPointerDown={(e) => handlers.onPointerDown(e, clip.id, "body")}
      onContextMenu={(e) => handlers.onContextMenu(e, clip.id)}
      onFocus={(e) => {
        // Keyboard focus selects (pointer focus is handled on pointerdown)
        if (e.target === e.currentTarget && !e.currentTarget.matches(":active")) handlers.onFocusSelect(clip.id, false);
      }}
      style={{ left, width, top: 3, height: bodyH }}
      sx={{
        position: "absolute",
        borderRadius: "5px",
        overflow: "hidden",
        backgroundColor: color,
        color: "#fff",
        cursor: locked ? "not-allowed" : "grab",
        opacity: dimmed ? 0.45 : 1,
        boxShadow: selected ? `inset 0 0 0 2px ${S.accent}, 0 0 0 1px ${S.accent}` : "inset 0 0 0 1px rgba(255,255,255,0.16)",
        zIndex: selected ? 2 : 1,
        touchAction: "none",
        "&:focus-visible": { outline: `2px solid ${S.text}`, outlineOffset: 1 },
        "&:hover .clip-edge": { opacity: locked ? 0 : 1 },
      }}
    >
      {showFilm && asset && <Filmstrip asset={asset} clip={clip as Clip & { in: number; speed: number }} width={width} height={soundOnPicture ? bodyH - 16 : bodyH} />}

      {/* Sound: under the picture on video clips, full height on audio clips */}
      {soundOnPicture && asset && clip.type === "media" && (
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 16, backgroundColor: "rgba(0,0,0,0.45)" }}>
          <Waveform asset={asset} from={clip.in} to={clip.in + clip.duration * clip.speed} width={width} height={16} gain={clip.volume} />
        </Box>
      )}
      {clip.type === "audio" && asset && (
        <Box sx={{ position: "absolute", left: 0, right: 0, top: 14, bottom: 0 }}>
          <Waveform asset={asset} from={clip.in} to={clip.in + clip.duration * clip.speed} width={width} height={bodyH - 14} color="rgba(220,255,232,0.8)" gain={clip.volume} />
        </Box>
      )}

      {/* Fades as dark wedges */}
      {clip.fadeIn > 0 && <Box aria-hidden sx={{ position: "absolute", left: 0, top: 0, bottom: 0, pointerEvents: "none", background: "linear-gradient(to bottom right, rgba(0,0,0,0.55) 50%, transparent 50%)" }} style={{ width: clip.fadeIn * zoom }} />}
      {clip.fadeOut > 0 && <Box aria-hidden sx={{ position: "absolute", right: 0, top: 0, bottom: 0, pointerEvents: "none", background: "linear-gradient(to bottom left, rgba(0,0,0,0.55) 50%, transparent 50%)" }} style={{ width: clip.fadeOut * zoom }} />}

      {/* Label */}
      {!narrow && (
        <Box sx={{ position: "absolute", left: 0, right: 0, top: 0, display: "flex", alignItems: "center", gap: "4px", px: "10px", height: 16, fontSize: "0.6875rem", fontWeight: 600, lineHeight: "16px", whiteSpace: "nowrap", pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,0.7)" }} style={{ paddingLeft: Math.max(10, transitionW + 6) }}>
          <Icon size={11} aria-hidden style={{ flexShrink: 0 }} />
          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</Box>
          {speed !== 1 && <Box component="span" sx={{ ml: "auto", px: "4px", borderRadius: "3px", backgroundColor: "rgba(0,0,0,0.55)", fontVariantNumeric: "tabular-nums" }}>{speed}×</Box>}
        </Box>
      )}

      {/* Transition in: the overlap with the previous clip, with a handle to change its length */}
      {clip.transitionIn && (
        <Box
          data-part="transition"
          aria-label={`${clip.transitionIn.type} transition, ${clip.transitionIn.duration.toFixed(2)} seconds. Drag to change`}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlers.onPointerDown(e, clip.id, "transition");
          }}
          style={{ width: transitionW }}
          sx={{
            position: "absolute", left: 0, top: 0, bottom: 0, cursor: locked ? "not-allowed" : "ew-resize",
            backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.28) 0 4px, rgba(0,0,0,0.25) 4px 8px)",
            borderRight: `2px solid ${S.accent}`,
            "&::after": { content: '""', position: "absolute", right: -6, top: "50%", width: 10, height: 10, mt: "-5px", transform: "rotate(45deg)", backgroundColor: S.accent, boxShadow: "0 0 0 1px rgba(0,0,0,0.5)" },
          }}
        />
      )}

      {/* Trim handles */}
      {!locked && (["start", "end"] as const).map((edge) => (
        <Box
          key={edge}
          className="clip-edge"
          component="button"
          type="button"
          tabIndex={selected ? 0 : -1}
          aria-label={`Trim ${edge === "start" ? "start" : "end"} of ${label}. Arrow keys move one frame, Shift one second`}
          onPointerDown={(e: PointerEvent<HTMLElement>) => {
            e.stopPropagation();
            handlers.onPointerDown(e, clip.id, edge);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLElement>) => handlers.onEdgeKey(e, clip.id, edge)}
          sx={{
            position: "absolute", top: 0, bottom: 0, [edge === "start" ? "left" : "right"]: 0, width: EDGE_W, p: 0, border: 0,
            cursor: "ew-resize", opacity: selected ? 1 : 0, backgroundColor: selected ? S.accent : "rgba(255,255,255,0.85)",
            display: narrow ? "none" : "grid", placeItems: "center", zIndex: 3,
            "&::after": { content: '""', width: 2, height: 14, borderRadius: 1, backgroundColor: selected ? S.onAccent : S.stage },
            "&:focus-visible": { opacity: 1, outline: `2px solid ${S.text}`, outlineOffset: 0 },
          }}
        />
      ))}
    </Box>
  );
}

export const ClipBlock = memo(ClipBlockImpl);
