"use client";

import React, { useEffect, useRef, useState } from "react";
import { Box, Typography, IconButton, Tooltip, Button, Menu, MenuItem } from "@mui/material";
import { Play, Pause, SkipBack, SkipForward, Scissors, Trash2, ZoomIn, ZoomOut, Maximize2, Type, Film, RotateCcw, Gauge, Volume2, VolumeX, Sparkles } from "lucide-react";
import { FtpMedia, TextMotion } from "@/types/newsroom";
import { Playhead, usePlayheadTime } from "@/hooks/usePlayhead";
import { TrimRange } from "./TemplateCanvas";
import { textSpan } from "./cardRender";

export const MIN_CLIP = 0.3;
const LABEL_WIDTH = 40;
const CLIP_BLUE = "#2F7BFF";

export function clock(seconds: number) {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

/** Still frames across the video for the clip's filmstrip; empty when the media host blocks pixel access. */
function useFilmstrip(media: FtpMedia, duration: number, count = 14): string[] {
  const [result, setResult] = useState<{ url: string; frames: string[] }>({ url: "", frames: [] });

  useEffect(() => {
    if (media.kind !== "video" || !duration) return;
    let cancelled = false;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 54;
    const ctx = canvas.getContext("2d");
    const collected: string[] = [];

    const grab = (index: number) => {
      if (cancelled || !ctx) return;
      if (index >= count) {
        setResult({ url: media.url, frames: collected });
        return;
      }
      video.onseeked = () => {
        try {
          const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
          const w = video.videoWidth * scale;
          const h = video.videoHeight * scale;
          ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
          collected.push(canvas.toDataURL("image/jpeg", 0.6));
          grab(index + 1);
        } catch {
          // Cross-origin media without CORS headers: fall back to a plain clip
        }
      };
      video.currentTime = ((index + 0.5) / count) * duration;
    };
    video.onloadeddata = () => grab(0);
    video.src = media.url;

    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [media.url, media.kind, duration, count]);

  return result.url === media.url ? result.frames : [];
}

export interface TimelineText {
  /** Canvas selection key: "headline" or "layer:<id>" */
  key: string;
  label: string;
  motion?: TextMotion;
}

interface VideoTimelineProps {
  media: FtpMedia;
  duration: number;
  /** Read inside the timeline, so the playhead moving re-renders only the timeline */
  playhead: Playhead;
  segments: TrimRange[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  onSegmentsChange: (segments: TrimRange[]) => void;
  onSeek: (time: number) => void;
  paused: boolean;
  onTogglePlay: () => void;
  /** The headline and the text boxes, each on its own track */
  texts: TimelineText[];
  selectedText: string | null;
  onSelectText: (key: string) => void;
  /** New on-screen span for a text, in seconds of the source */
  onTextTiming: (key: string, span: { start: number; end: number }) => void;
  sound: boolean;
  onToggleSound: () => void;
}

type Drag =
  | { kind: "playhead" }
  | { kind: "start" | "end"; index: number }
  | { kind: "text-start" | "text-end" | "text-move"; key: string; grab: number; span: { start: number; end: number } };

const toolSx = { borderRadius: "6px", width: 30, height: 30, color: "text.primary" };
const TEXT_TRACK = 24;
const MIN_TEXT = 0.3;
export const CLIP_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Length of the saved video once cuts and speeds apply */
export const outputLength = (segments: TrimRange[]) => segments.reduce((sum, s) => sum + (s.end - s.start) / (s.speed ?? 1), 0);

export default function VideoTimeline({ media, duration, playhead, segments, selected, onSelect, onSegmentsChange, onSeek, paused, onTogglePlay, texts, selectedText, onSelectText, onTextTiming, sound, onToggleSound }: VideoTimelineProps) {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [zoom, setZoom] = useState(1);
  const [speedMenu, setSpeedMenu] = useState<HTMLElement | null>(null);
  const frames = useFilmstrip(media, duration);
  const time = usePlayheadTime(playhead);

  const pct = (t: number) => `${(t / duration) * 100}%`;
  const kept = outputLength(segments);
  // Position in the edited video: output time spent inside kept clips up to the playhead
  const editedTime = segments.reduce((sum, s) => sum + Math.max(0, Math.min(time, s.end) - s.start) / (s.speed ?? 1), 0);
  const firstStart = segments[0]?.start ?? 0;
  const lastEnd = segments[segments.length - 1]?.end ?? duration;

  const splitIndex = segments.findIndex((s) => time > s.start + MIN_CLIP && time < s.end - MIN_CLIP);
  const canDelete = selected !== null && segments.length > 1;
  const isEdited = segments.length !== 1 || segments[0].start > 0.01 || segments[0].end < duration - 0.01 || segments.some((s) => (s.speed ?? 1) !== 1);
  const selectedSpeed = selected !== null ? (segments[selected]?.speed ?? 1) : 1;

  const split = () => {
    if (splitIndex < 0) return;
    const target = segments[splitIndex];
    onSegmentsChange([...segments.slice(0, splitIndex), { ...target, end: time }, { ...target, start: time }, ...segments.slice(splitIndex + 1)]);
    onSelect(splitIndex + 1);
  };

  const remove = () => {
    if (!canDelete || selected === null) return;
    onSegmentsChange(segments.filter((_, i) => i !== selected));
    onSelect(null);
  };

  const setSpeed = (speed: number) => {
    if (selected === null) return;
    onSegmentsChange(segments.map((s, i) => (i === selected ? { ...s, speed: speed === 1 ? undefined : speed } : s)));
  };

  const moveEdge = (index: number, edge: "start" | "end", t: number) => {
    const segment = segments[index];
    const lower = edge === "start" ? (segments[index - 1]?.end ?? 0) : segment.start + MIN_CLIP;
    const upper = edge === "start" ? segment.end - MIN_CLIP : (segments[index + 1]?.start ?? duration);
    const value = Math.max(lower, Math.min(upper, t));
    onSegmentsChange(segments.map((s, i) => (i === index ? { ...s, [edge]: value } : s)));
    onSeek(edge === "start" ? value : Math.max(segment.start, value - 0.05));
  };

  const spanOf = (text: TimelineText) => textSpan(text.motion, firstStart, lastEnd);

  const moveText = (drag: Extract<Drag, { key: string }>, t: number) => {
    const { start, end } = drag.span;
    let next = { start, end };
    if (drag.kind === "text-start") next = { start: Math.max(firstStart, Math.min(end - MIN_TEXT, t)), end };
    else if (drag.kind === "text-end") next = { start, end: Math.min(lastEnd, Math.max(start + MIN_TEXT, t)) };
    else {
      const length = end - start;
      const from = Math.max(firstStart, Math.min(lastEnd - length, start + (t - drag.grab)));
      next = { start: from, end: from + length };
    }
    onTextTiming(drag.key, next);
    // Show the frame being set: the start while moving in, the end while trimming out
    onSeek(drag.kind === "text-end" ? Math.max(next.start, next.end - 0.05) : Math.min(next.end, next.start + 0.05));
  };

  const timeAt = (clientX: number) => {
    const bounds = laneRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    return Math.max(0, Math.min(duration, ((clientX - bounds.left) / bounds.width) * duration));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-edge], [data-clip], [data-text]");
    e.currentTarget.setPointerCapture(e.pointerId);
    if (target?.dataset.edge) {
      const index = Number(target.dataset.index);
      dragRef.current = { kind: target.dataset.edge as "start" | "end", index };
      onSelect(index);
      return;
    }
    if (target?.dataset.text) {
      const key = target.dataset.text;
      const text = texts.find((x) => x.key === key);
      if (text) {
        const part = (e.target as HTMLElement).closest<HTMLElement>("[data-text-edge]")?.dataset.textEdge;
        onSelectText(key);
        onSelect(null);
        dragRef.current = { kind: part === "start" ? "text-start" : part === "end" ? "text-end" : "text-move", key, grab: timeAt(e.clientX), span: spanOf(text) };
        return;
      }
    }
    onSelect(target?.dataset.clip ? Number(target.dataset.clip) : null);
    dragRef.current = { kind: "playhead" };
    onSeek(timeAt(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "playhead") onSeek(timeAt(e.clientX));
    else if ("index" in drag) moveEdge(drag.index, drag.kind, timeAt(e.clientX));
    else if (drag.kind !== "text-move" || Math.abs(timeAt(e.clientX) - drag.grab) > 0.02) moveText(drag, timeAt(e.clientX));
  };

  const endDrag = () => (dragRef.current = null);

  const nudge = (e: React.KeyboardEvent, index: number, edge: "start" | "end") => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    moveEdge(index, edge, segments[index][edge] + (e.key === "ArrowLeft" ? -0.1 : 0.1));
  };

  const nudgeText = (e: React.KeyboardEvent, text: TimelineText, edge: "start" | "end") => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const span = spanOf(text);
    moveText({ kind: edge === "start" ? "text-start" : "text-end", key: text.key, grab: 0, span }, span[edge] + (e.key === "ArrowLeft" ? -0.1 : 0.1));
  };

  // Ruler marks at a step that keeps labels readable for any clip length
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => duration / s <= 12 * zoom) ?? 120;
  const marks = Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);

  const trackLabel = (icon: React.ReactNode, label: string) => (
    <Tooltip title={label} placement="right">
      <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, display: "grid", placeItems: "center", color: "text.secondary" }}>{icon}</Box>
    </Tooltip>
  );

  const speedLabel = (v: number) => `${v}×`;

  return (
    <Box sx={{ flexShrink: 0, backgroundColor: "background.paper", borderTop: "1px solid", borderColor: "divider", userSelect: "none" }}>
      {/* Toolbar: edit tools, transport, sound and timeline zoom */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 1, px: 1, height: 44, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, minWidth: 0, overflowX: "auto" }}>
          <Tooltip title={splitIndex < 0 ? "Move the playhead inside a clip to split it" : "Split at playhead (S)"}>
            <span>
              <Button size="small" onClick={split} disabled={splitIndex < 0} startIcon={<Scissors size={14} />} sx={{ minHeight: 30, minWidth: 0, px: 1, fontSize: "0.75rem", color: "text.primary" }}>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Split</Box>
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={canDelete ? "Delete selected clip (Del)" : segments.length > 1 ? "Select a clip to delete it" : "Split the video first, then delete the part you do not want"}>
            <span>
              <Button size="small" onClick={remove} disabled={!canDelete} startIcon={<Trash2 size={14} />} sx={{ minHeight: 30, minWidth: 0, px: 1, fontSize: "0.75rem", color: "text.primary" }}>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Delete</Box>
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={selected === null ? "Select a clip to change its speed" : "Speed of the selected clip"}>
            <span>
              <Button size="small" onClick={(e) => setSpeedMenu(e.currentTarget)} disabled={selected === null} startIcon={<Gauge size={14} />} aria-haspopup="menu" sx={{ minHeight: 30, minWidth: 0, px: 1, fontSize: "0.75rem", color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
                {speedLabel(selectedSpeed)}
              </Button>
            </span>
          </Tooltip>
          <Menu anchorEl={speedMenu} open={!!speedMenu} onClose={() => setSpeedMenu(null)}>
            {CLIP_SPEEDS.map((v) => (
              <MenuItem
                key={v}
                selected={v === selectedSpeed}
                onClick={() => {
                  setSpeed(v);
                  setSpeedMenu(null);
                }}
                sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", minWidth: 120 }}
              >
                {speedLabel(v)} {v === 1 ? "Normal" : v < 1 ? "Slow" : "Fast"}
              </MenuItem>
            ))}
          </Menu>
          {isEdited && (
            <Tooltip title="Restore the full video at normal speed">
              <IconButton sx={toolSx} aria-label="Restore the full video" onClick={() => { onSegmentsChange([{ start: 0, end: duration }]); onSelect(null); }}>
                <RotateCcw size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton sx={toolSx} aria-label="Go to start" onClick={() => onSeek(firstStart)}>
            <SkipBack size={15} />
          </IconButton>
          <IconButton aria-label={paused ? "Play" : "Pause"} onClick={onTogglePlay} sx={{ width: 34, height: 34, backgroundColor: "text.primary", color: "background.paper", "&:hover": { backgroundColor: "text.primary", opacity: 0.85 } }}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </IconButton>
          <IconButton sx={toolSx} aria-label="Go to end" onClick={() => onSeek(Math.max(firstStart, lastEnd - 0.05))}>
            <SkipForward size={15} />
          </IconButton>
          <Typography sx={{ ml: 0.5, fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", display: { xs: "none", sm: "block" } }}>
            {clock(editedTime)} <Box component="span" sx={{ color: "text.secondary" }}>/ {clock(kept)}</Box>
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.25 }}>
          <Tooltip title={sound ? "Mute in the editor" : "Play sound in the editor"}>
            <IconButton sx={toolSx} aria-label={sound ? "Mute in the editor" : "Play sound in the editor"} aria-pressed={sound} onClick={onToggleSound}>
              {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </IconButton>
          </Tooltip>
          <IconButton sx={{ ...toolSx, display: { xs: "none", sm: "inline-flex" } }} aria-label="Zoom timeline out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
            <ZoomOut size={15} />
          </IconButton>
          <IconButton sx={{ ...toolSx, display: { xs: "none", sm: "inline-flex" } }} aria-label="Zoom timeline in" disabled={zoom >= 5} onClick={() => setZoom((z) => Math.min(5, z * 1.5))}>
            <ZoomIn size={15} />
          </IconButton>
          <Tooltip title="Fit timeline">
            <IconButton sx={{ ...toolSx, display: { xs: "none", sm: "inline-flex" } }} aria-label="Fit timeline" onClick={() => setZoom(1)}>
              <Maximize2 size={14} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tracks */}
      <Box
        tabIndex={0}
        aria-label="Timeline"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key.toLowerCase() === "s") split();
          if (e.key === "Delete" || e.key === "Backspace") remove();
          if (e.key === " ") {
            e.preventDefault();
            onTogglePlay();
          }
        }}
        sx={{ display: "flex", overflowX: "auto", overflowY: "auto", maxHeight: { xs: 190, lg: 230 }, py: 0.75, pr: 1.5, "&:focus-visible": { outline: `2px solid ${CLIP_BLUE}`, outlineOffset: -2 } }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: "6px", pt: "22px" }}>
          {texts.map((t) => (
            <Box key={t.key} sx={{ height: TEXT_TRACK, display: "flex", flexShrink: 0 }}>
              {trackLabel(<Type size={14} />, t.key === "headline" ? "Card text" : `Text: ${t.label}`)}
            </Box>
          ))}
          <Box sx={{ height: 54, display: "flex", flexShrink: 0 }}>{trackLabel(<Film size={15} />, "Video")}</Box>
        </Box>

        <Box
          ref={laneRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          sx={{ position: "relative", flex: "none", width: `calc((100% - ${LABEL_WIDTH}px) * ${zoom})`, minWidth: 240, display: "flex", flexDirection: "column", gap: "6px", cursor: "pointer", touchAction: "none" }}
        >
          {/* Ruler */}
          <Box sx={{ position: "relative", height: 16, flexShrink: 0 }}>
            {marks.map((mark) => (
              <Box key={mark} sx={{ position: "absolute", left: pct(mark), top: 0, bottom: 0, pl: "4px", borderLeft: "1px solid", borderColor: "divider", fontSize: "0.625rem", lineHeight: "14px", color: "text.secondary", fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}>
                {mark}s
              </Box>
            ))}
          </Box>

          {/* Text tracks: drag the bar to move when a text shows, drag its ends to trim */}
          {texts.map((t) => {
            const span = spanOf(t);
            const on = selectedText === t.key;
            const animated = t.motion?.animation && t.motion.animation !== "none";
            return (
              <Box key={t.key} sx={{ position: "relative", height: TEXT_TRACK, flexShrink: 0 }}>
                <Box
                  data-text={t.key}
                  aria-label={`${t.label}: on screen ${clock(span.start)} to ${clock(span.end)}`}
                  sx={{ position: "absolute", left: pct(span.start), width: pct(Math.max(0, span.end - span.start)), top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 0.6, px: "14px", borderRadius: "5px", backgroundColor: "rgba(124, 77, 255, 0.16)", border: "1.5px solid", borderColor: on ? CLIP_BLUE : "rgba(124, 77, 255, 0.55)", overflow: "hidden", cursor: "grab" }}
                >
                  {animated && <Sparkles size={11} style={{ flexShrink: 0 }} aria-hidden />}
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>{t.label}</Typography>
                  {(["start", "end"] as const).map((edge) => (
                    <Box
                      key={edge}
                      component="button"
                      data-text-edge={edge}
                      aria-label={`${t.label} ${edge === "start" ? "appears" : "disappears"} at ${clock(span[edge])}`}
                      onKeyDown={(e: React.KeyboardEvent) => nudgeText(e, t, edge)}
                      sx={{ position: "absolute", top: 0, bottom: 0, [edge === "start" ? "left" : "right"]: 0, width: 10, p: 0, border: 0, cursor: "ew-resize", backgroundColor: on ? CLIP_BLUE : "rgba(124, 77, 255, 0.55)", "&:focus-visible": { outline: `2px solid ${CLIP_BLUE}`, outlineOffset: 1 } }}
                    />
                  ))}
                </Box>
              </Box>
            );
          })}

          {/* Video track */}
          <Box sx={{ position: "relative", height: 54, flexShrink: 0, borderRadius: "6px", backgroundColor: "action.hover" }}>
            {segments.map((segment, i) => {
              const isSelected = selected === i;
              const speed = segment.speed ?? 1;
              return (
                <Box
                  key={`${segment.start}-${i}`}
                  data-clip={i}
                  sx={{ position: "absolute", left: pct(segment.start), width: pct(segment.end - segment.start), top: 0, bottom: 0, borderRadius: "6px", overflow: "hidden", backgroundColor: "#26262B", border: "2px solid", borderColor: isSelected ? CLIP_BLUE : "transparent", boxShadow: isSelected ? "none" : "inset 0 0 0 1px rgba(255,255,255,0.14)" }}
                >
                  {/* Filmstrip stays aligned to source time, so trimming reveals the right frames */}
                  <Box sx={{ position: "absolute", top: 0, bottom: 0, left: `${(-segment.start / (segment.end - segment.start)) * 100}%`, width: `${(duration / (segment.end - segment.start)) * 100}%`, display: "flex", pointerEvents: "none" }}>
                    {frames.map((src, f) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img key={f} src={src} alt="" draggable={false} style={{ flex: 1, minWidth: 0, height: "100%", objectFit: "cover" }} />
                    ))}
                  </Box>
                  {speed !== 1 && (
                    <Box sx={{ position: "absolute", left: 16, top: 4, px: 0.5, borderRadius: "3px", backgroundColor: "rgba(0,0,0,0.72)", color: "#fff", fontSize: "0.625rem", fontWeight: 700, lineHeight: "16px", fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}>
                      {speedLabel(speed)}
                    </Box>
                  )}
                  {(["start", "end"] as const).map((edge) => (
                    <Box
                      key={edge}
                      component="button"
                      data-edge={edge}
                      data-index={i}
                      aria-label={`Clip ${i + 1} ${edge}, ${clock(segment[edge])}`}
                      onKeyDown={(e: React.KeyboardEvent) => nudge(e, i, edge)}
                      sx={{ position: "absolute", top: 0, bottom: 0, [edge === "start" ? "left" : "right"]: 0, width: 12, p: 0, border: 0, cursor: "ew-resize", backgroundColor: isSelected ? CLIP_BLUE : "rgba(255,255,255,0.85)", display: "grid", placeItems: "center", "&::after": { content: '""', width: 2, height: 16, borderRadius: 1, backgroundColor: isSelected ? "#fff" : "#26262B" }, "&:focus-visible": { outline: `2px solid ${CLIP_BLUE}`, outlineOffset: 1 } }}
                    />
                  ))}
                </Box>
              );
            })}
          </Box>

          {/* Playhead */}
          <Box sx={{ position: "absolute", top: 0, bottom: 0, left: pct(Math.min(duration, time)), width: "2px", ml: "-1px", backgroundColor: "text.primary", pointerEvents: "none", "&::before": { content: '""', position: "absolute", top: 0, left: -5, width: 12, height: 12, borderRadius: "3px 3px 6px 6px", backgroundColor: "text.primary" } }} />
        </Box>
      </Box>
    </Box>
  );
}
