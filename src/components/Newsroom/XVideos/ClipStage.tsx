"use client";

// The centre of the editor: the clip playing where the X desk shows the card, then a trim bar (yellow handles for
// the in and out points, I / O set them at the playhead; dots mark lines worth using) and the transport row.

import React, { useRef } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { Clapperboard, Maximize2, Pause, Play } from "lucide-react";
import type { XvClip, XvScreenText } from "@/data/xVideosData";
import type { ClipPlayer } from "./useClipPlayer";
import { LiveBug, MissingNote, ScreenTextOverlay, XV_COLORS, backdropFor, isVertical } from "./ClipFrame";
import { fmtClock } from "./xvTitle";

const RATES = [1, 1.5, 2, 0.5];
const toolBtnSx = { minHeight: 30, minWidth: 0, px: 1.25, borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", fontWeight: 600, whiteSpace: "nowrap", color: "text.primary", borderColor: "divider" } as const;

/** How long a frame grab's text stays on screen, for the cyan box while playing */
const GRAB_SPAN = 6;
const grabShowing = (g: XvScreenText, t: number) => t >= g.at - 0.25 && t < g.at + GRAB_SPAN;

interface StageProps {
  clip: XvClip;
  player: ClipPlayer;
  trim: { start: number; end: number };
  onTrim: (trim: { start: number; end: number }) => void;
  /** Dots on the trim bar: the moments worth using, and their colour (blue for speech, cyan for the screen) */
  markers: { at: number; label: string }[];
  markerColor: string;
  /** Draw the cyan box around text read from the frame (On screen tab) */
  showBoxes: boolean;
  /** The grab picked in the On screen panel: its box stays drawn */
  pickedGrab: string | null;
  onOpenStudio: () => void;
}

export default function ClipStage({ clip, player, trim, onTrim, markers, markerColor, showBoxes, pickedGrab, onOpenStudio }: StageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { time, duration, playing, missing, rate, attach, toggle, seek, setRate, videoProps } = player;
  const kept = trim.end - trim.start;
  const whole = trim.start <= 0.05 && trim.end >= duration - 0.05;
  const vertical = isVertical(clip);
  const grabs = clip.screenText.filter((g) => (showBoxes && grabShowing(g, time)) || g.id === pickedGrab || (missing && grabShowing(g, time)));

  const fullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 820, display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Box
        ref={stageRef}
        sx={{
          position: "relative",
          // A vertical short keeps its own shape, as tall as the window allows, instead of a thin strip in a 16:9 box
          ...(vertical ? { alignSelf: "center", height: "min(68dvh, 640px)", maxWidth: "100%", aspectRatio: `${clip.width} / ${clip.height}` } : { width: "100%", aspectRatio: "16 / 9" }),
          borderRadius: "6px", overflow: "hidden", background: backdropFor(clip.id), boxShadow: "0 2px 10px rgba(0,0,0,0.15)", "&:fullscreen": { borderRadius: 0, ...(vertical ? { height: "100dvh", maxWidth: "none" } : {}) } }}
      >
        {!missing && (
          <Box
            component="video"
            key={clip.src}
            ref={attach}
            src={clip.src}
            poster={clip.poster}
            preload="metadata"
            playsInline
            onClick={toggle}
            {...videoProps}
            aria-label={`Clip ${clip.fileName}`}
            sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000", cursor: "pointer" }}
          />
        )}
        {missing && (
          <>
            {clip.kind === "live" && <LiveBug size="0.9375rem" />}
            <MissingNote fileName={clip.fileName} big />
          </>
        )}
        {grabs.map((g) => (
          <ScreenTextOverlay key={g.id} text={g.text} box={g.box} kind={g.kind} showText={missing} boxed={showBoxes || g.id === pickedGrab} />
        ))}
        {missing && !playing && (
          <IconButton onClick={toggle} aria-label="Play" sx={{ position: "absolute", left: "50%", top: "62%", transform: "translate(-50%, -50%)", width: 56, height: 56, backgroundColor: "rgba(0,0,0,0.5)", color: "#fff", "&:hover": { backgroundColor: "rgba(0,0,0,0.65)" } }}>
            <Play size={24} fill="#fff" />
          </IconButton>
        )}
      </Box>

      <Box sx={{ backgroundColor: "background.paper", borderRadius: "10px", px: 1.25, py: 0.75, display: "flex", flexDirection: "column", gap: 0.5, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <TrimBar duration={duration} time={time} trim={trim} onTrim={onTrim} onSeek={seek} markers={markers} markerColor={markerColor} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          <IconButton onClick={toggle} aria-label={playing ? "Pause (Space)" : "Play (Space)"} aria-keyshortcuts="Space L" sx={{ width: 32, height: 32, borderRadius: "8px", backgroundColor: "#000", color: "#fff", "&:hover": { backgroundColor: "#000", opacity: 0.85 } }}>
            {playing ? <Pause size={15} fill="#fff" /> : <Play size={15} fill="#fff" />}
          </IconButton>
          <Typography sx={{ fontFamily: "var(--font-mono), Consolas, monospace", fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }} aria-live="off">
            {fmtClock(time)} / {fmtClock(duration)}
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{whole ? "keep whole clip" : `keep ${fmtClock(trim.start)}–${fmtClock(trim.end)} (${fmtClock(kept)})`}</Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Start the clip at the playhead (I)">
            <Button size="small" variant="outlined" onClick={() => onTrim({ start: Math.min(time, trim.end - 1), end: trim.end })} aria-keyshortcuts="I" sx={toolBtnSx}>
              [ Start (I)
            </Button>
          </Tooltip>
          <Tooltip title="End the clip at the playhead (O)">
            <Button size="small" variant="outlined" onClick={() => onTrim({ start: trim.start, end: Math.max(time, trim.start + 1) })} aria-keyshortcuts="O" sx={toolBtnSx}>
              End (O) ]
            </Button>
          </Tooltip>
          <Tooltip title="Playback speed">
            <Button size="small" variant="outlined" onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])} aria-label={`Playback speed ${rate}x`} sx={toolBtnSx}>
              {rate}×
            </Button>
          </Tooltip>
          <Tooltip title="Full screen">
            <IconButton size="small" onClick={fullscreen} aria-label="Full screen" sx={{ width: 30, height: 30, borderRadius: "8px", border: "1px solid", borderColor: "divider" }}>
              <Maximize2 size={14} />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" onClick={onOpenStudio} startIcon={<Clapperboard size={14} />} sx={toolBtnSx}>
            Open in Video Studio
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

interface TrimBarProps {
  duration: number;
  time: number;
  trim: { start: number; end: number };
  onTrim: (t: { start: number; end: number }) => void;
  onSeek: (t: number) => void;
  markers: { at: number; label: string }[];
  markerColor: string;
}

/** The scrub and trim track: click to seek, drag the yellow handles (or focus one and use the arrow keys) */
function TrimBar({ duration, time, trim, onTrim, onSeek, markers, markerColor }: TrimBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (t: number) => `${duration > 0 ? (Math.max(0, Math.min(t, duration)) / duration) * 100 : 0}%`;
  const timeAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };

  const drag = (e: React.PointerEvent<HTMLElement>) => {
    const which = e.currentTarget.dataset.which as "start" | "end";
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const t = timeAt(ev.clientX);
      onTrim(which === "start" ? { start: Math.min(t, trim.end - 1), end: trim.end } : { start: trim.start, end: Math.max(t, trim.start + 1) });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const keys = (e: React.KeyboardEvent<HTMLElement>) => {
    const which = e.currentTarget.dataset.which as "start" | "end";
    const step = e.shiftKey ? 5 : 1;
    const delta = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : e.key === "ArrowRight" || e.key === "ArrowUp" ? step : 0;
    if (!delta) return;
    e.preventDefault();
    if (which === "start") onTrim({ start: Math.max(0, Math.min(trim.start + delta, trim.end - 1)), end: trim.end });
    else onTrim({ start: trim.start, end: Math.min(duration, Math.max(trim.end + delta, trim.start + 1)) });
  };

  const handleSx = { position: "absolute", top: 3, width: 12, height: 24, ml: "-6px", borderRadius: "3px", backgroundColor: XV_COLORS.trim, border: "1.5px solid #111", cursor: "ew-resize", touchAction: "none", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } } as const;

  return (
    <Box ref={trackRef} onPointerDown={(e) => onSeek(timeAt(e.clientX))} sx={{ position: "relative", height: 30, mx: "6px", cursor: "pointer", touchAction: "none" }}>
      <Box sx={{ position: "absolute", left: 0, right: 0, top: 11, height: 8, borderRadius: "4px", backgroundColor: "#D5D8DD" }} />
      <Box sx={{ position: "absolute", top: 11, height: 8, left: pct(trim.start), width: `calc(${pct(trim.end)} - ${pct(trim.start)})`, backgroundColor: "#111" }} />
      {markers.map((m) => (
        <Tooltip key={`${m.at}-${m.label}`} title={`${fmtClock(m.at)} ${m.label}`}>
          <Box component="span" sx={{ position: "absolute", top: 22, left: pct(m.at), ml: "-3.5px", width: 7, height: 7, borderRadius: "50%", backgroundColor: markerColor }} />
        </Tooltip>
      ))}
      <Box aria-hidden sx={{ position: "absolute", top: 0, left: pct(time), width: 2, ml: "-1px", height: 30, backgroundColor: "#D32F2F", pointerEvents: "none" }} />
      <Box
        role="slider"
        tabIndex={0}
        aria-label="Clip start"
        aria-valuemin={0}
        aria-valuemax={Math.round(trim.end)}
        aria-valuenow={Math.round(trim.start)}
        aria-valuetext={fmtClock(trim.start)}
        data-which="start"
        onPointerDown={drag}
        onKeyDown={keys}
        sx={{ ...handleSx, left: pct(trim.start) }}
      />
      <Box
        role="slider"
        tabIndex={0}
        aria-label="Clip end"
        aria-valuemin={Math.round(trim.start)}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(trim.end)}
        aria-valuetext={fmtClock(trim.end)}
        data-which="end"
        onPointerDown={drag}
        onKeyDown={keys}
        sx={{ ...handleSx, left: pct(trim.end) }}
      />
    </Box>
  );
}
