"use client";

// The studio's preview: the project drawn by renderFrame into a canvas at the project's aspect,
// fitted to whatever room the layout gives it, sharp on HiDPI screens, plus on-canvas editing of
// the selected clip's box (move, resize, rotate, snapping guides), safe-area guides and fullscreen.
//
// Time: paused, the frame follows the `time` prop. Playing, it follows `clock()` (the audio engine's
// clock in timeline seconds, so picture follows sound); without a clock it runs on performance.now()
// from `time`. Each played frame reports through onTimeUpdate; reaching the end calls onEnded.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Box as MuiBox, IconButton, Tooltip, Typography } from "@mui/material";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import PauseRounded from "@mui/icons-material/PauseRounded";
import FullscreenRounded from "@mui/icons-material/FullscreenRounded";
import FullscreenExitRounded from "@mui/icons-material/FullscreenExitRounded";
import BorderOuterRounded from "@mui/icons-material/BorderOuterRounded";
import { projectDuration, projectSize, type Box, type Clip, type Project } from "../model";
import { ensureFonts, onFontsChange } from "../render/fonts";
import { boxBounds, pointInBox } from "../render/geometry";
import { collectLayers, layerAt, newLayerList } from "../render/layers";
import type { AudioEngine } from "../audio/engine";
import type { MediaPool } from "../render/mediaPool";
import { renderFrame } from "../render/renderFrame";
import { BoxEditor, GUIDE_PINK, useBoxMove, type Guides, type SnapTargets } from "./BoxEditor";
import { SAFE_ACTION, SAFE_TITLE, frameTargets } from "./snapping";

export interface PreviewProps {
  project: Project;
  pool: MediaPool;
  /** Playhead, timeline seconds. Drawn while paused; the start point when playing without a clock. */
  time: number;
  playing: boolean;
  /**
   * The audio engine (audio/engine.ts, via useAudioEngine). While playing, the picture follows
   * engine.clock(), and the preview calls engine.pause() itself when the clock reaches the end.
   * Start it with engine.play(time) inside your play click/key handler (autoplay rule), then set playing.
   */
  engine?: Pick<AudioEngine, "clock" | "pause">;
  /** A bare clock instead of an engine (timeline seconds). Without either, performance.now() from `time`. */
  clock?: () => number;
  /** Every drawn frame while playing */
  onTimeUpdate?: (t: number) => void;
  /** Playback reached the end of the project */
  onEnded?: () => void;
  selectedClipId?: string | null;
  /** A press on the picture selected a clip (or empty space: null) */
  onSelect?: (clipId: string | null) => void;
  /**
   * A box gesture: "live" on every move (optional to apply; the preview already shows it), "commit"
   * once when the gesture ends (one undo step).
   */
  onBoxChange?: (clipId: string, box: Box, phase: "live" | "commit") => void;
  /** Shows a play/pause button in the bar */
  onTogglePlay?: () => void;
}

type BoxClip = Extract<Clip, { box: Box }>;

const noSubscribe = () => () => undefined;
const fullscreenEnabled = () => !!document.fullscreenEnabled;
const serverFalse = () => false;

const NO_GUIDES: Guides = { x: null, y: null };
const BAR_H = 44;

function formatTime(t: number, fps: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const f = Math.floor((s % 1) * fps + 1e-6);
  return `${m}:${String(sec).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
}

function findClip(project: Project, id: string | null | undefined): BoxClip | null {
  if (!id) return null;
  for (const t of project.tracks) for (const c of t.clips) if (c.id === id && (c.type === "media" || c.type === "text")) return c;
  return null;
}

/** The project with one clip's box replaced (while a drag is in flight) */
function withBox(project: Project, id: string, box: Box): Project {
  return {
    ...project,
    tracks: project.tracks.map((tr) => (tr.clips.some((c) => c.id === id) ? { ...tr, clips: tr.clips.map((c) => (c.id === id && "box" in c ? { ...c, box } : c)) } : tr)),
  };
}

export function Preview(props: PreviewProps) {
  const { project, pool, time, playing, engine, selectedClipId, onSelect, onBoxChange, onTogglePlay } = props;
  const { width: W, height: H } = projectSize(project);
  const clock = useMemo(() => (engine ? () => engine.clock() : props.clock), [engine, props.clock]);

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [safeArea, setSafeArea] = useState(false);
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  // The box being dragged. After the gesture it stays (committed) until the parent's next project
  // arrives, so the frame between "commit" and the store update does not flash the old box.
  const [draft, setDraft] = useState<{ id: string; box: Box; committed?: boolean; base: Project } | null>(null);
  const [shownTime, setShownTime] = useState(time);

  // What gets drawn: the project, with the box being dragged swapped in
  const activeDraft = draft && (!draft.committed || draft.base === project) ? draft : null;
  const drawn = useMemo(() => (activeDraft ? withBox(project, activeDraft.id, activeDraft.box) : project), [project, activeDraft]);

  // Latest values for the animation loop, which must not restart on every render
  const live = useRef({ project: drawn, time, playing, clock, engine, pool, onTimeUpdate: props.onTimeUpdate, onEnded: props.onEnded });
  useLayoutEffect(() => {
    live.current = { project: drawn, time, playing, clock, engine, pool, onTimeUpdate: props.onTimeUpdate, onEnded: props.onEnded };
  });

  // ----- size: fit the aspect into the room, back the canvas at device pixels -----------------
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setRoom((prev) => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = fullscreen ? 0 : 12;
  const fitScale = Math.max(0, Math.min((room.w - pad * 2) / W, (room.h - pad * 2) / H));
  const stageW = Math.floor(W * fitScale);
  const stageH = Math.floor(H * fitScale);

  const ensureBacking = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || stageW <= 0) return null;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    // Never more pixels than the project has: past that the picture gains nothing and costs frame time
    const bw = Math.max(1, Math.min(W, Math.round(stageW * dpr)));
    const bh = Math.max(1, Math.round((bw * H) / W));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    return canvas.getContext("2d", { alpha: false });
  }, [stageW, W, H]);

  // ----- drawing --------------------------------------------------------------------------
  const draw = useCallback((t: number) => {
    const ctx = ensureBacking();
    if (!ctx) return;
    const { project: p, playing: isPlaying, pool: mp } = live.current;
    mp.syncPreview(p, t, isPlaying);
    renderFrame(ctx, p, t, mp);
  }, [ensureBacking]);

  const pending = useRef(0);
  const requestDraw = useCallback(() => {
    if (pending.current || live.current.playing) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = 0;
      draw(live.current.time);
    });
  }, [draw]);
  useEffect(() => () => {
    cancelAnimationFrame(pending.current);
    pending.current = 0;
  }, []);

  // Paused: redraw on any change of time, project, size, a landed seek, a loaded asset or font
  useEffect(() => {
    if (!playing) requestDraw();
  }, [playing, time, drawn, stageW, requestDraw]);
  useEffect(() => pool.subscribe(requestDraw), [pool, requestDraw]);
  useEffect(() => onFontsChange(requestDraw), [requestDraw]);
  useEffect(() => {
    void ensureFonts(project).then(requestDraw);
  }, [project, requestDraw]);

  // Playing: one loop per play session, reading everything else from refs
  useEffect(() => {
    if (!playing) return;
    const mp = live.current.pool;
    const startClock = performance.now();
    const startTime = live.current.time;
    const end = projectDuration(live.current.project);
    let raf = 0;
    let lastShown = -1;
    const tick = () => {
      const { clock: c, engine: en, onTimeUpdate, onEnded } = live.current;
      let t = c ? c() : startTime + (performance.now() - startClock) / 1000;
      if (end > 0 && t >= end) {
        t = end;
        en?.pause();
        draw(Math.max(0, end - 1e-3));
        onTimeUpdate?.(t);
        onEnded?.();
        return;
      }
      draw(t);
      onTimeUpdate?.(t);
      // The time label only needs ~10 updates a second
      if (Math.abs(t - lastShown) >= 0.1) {
        lastShown = t;
        setShownTime(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      mp.pauseAll();
    };
  }, [playing, draw]);

  useEffect(() => () => pool.pauseAll(), [pool]);

  // ----- selection and box editing (paused only) -------------------------------------------
  const selected = useMemo(() => findClip(drawn, selectedClipId), [drawn, selectedClipId]);
  const selectedVisible = !!selected && time >= selected.start && time < selected.start + selected.duration;
  const selectedTrackLocked = useMemo(() => !!selectedClipId && project.tracks.some((tr) => tr.locked && tr.clips.some((c) => c.id === selectedClipId)), [project, selectedClipId]);

  // Lines a moving box catches on: the frame, the safe area, and every other box on screen now
  const targets = useMemo<SnapTargets>(() => {
    const xs = frameTargets(safeArea);
    const ys = frameTargets(safeArea);
    const list = collectLayers(project, time, newLayerList());
    for (let i = 0; i < list.count; i++) {
      const c = list.items[i].clip;
      if (c.id === selectedClipId) continue;
      const b = boxBounds(c.box, W, H);
      xs.push(b.left, c.box.x, b.right);
      ys.push(b.top, c.box.y, b.bottom);
    }
    return { x: xs, y: ys };
  }, [project, time, selectedClipId, safeArea, W, H]);

  const onDraft = useCallback((box: Box) => {
    if (!selectedClipId) return;
    setDraft({ id: selectedClipId, box, base: project });
    onBoxChange?.(selectedClipId, box, "live");
  }, [selectedClipId, onBoxChange, project]);
  const onCommit = useCallback((box: Box) => {
    if (!selectedClipId) return;
    setDraft({ id: selectedClipId, box, base: project, committed: true });
    onBoxChange?.(selectedClipId, box, "commit");
  }, [selectedClipId, onBoxChange, project]);

  // A drag that started on another clip (press selects it, the same press moves it)
  const pressRef = useRef<{ id: string } | null>(null);
  const onPressDraft = useCallback((box: Box) => {
    const id = pressRef.current?.id;
    if (!id) return;
    setDraft({ id, box, base: project });
    onBoxChange?.(id, box, "live");
  }, [onBoxChange, project]);
  const onPressCommit = useCallback((box: Box) => {
    const id = pressRef.current?.id;
    if (!id) return;
    setDraft({ id, box, base: project, committed: true });
    onBoxChange?.(id, box, "commit");
  }, [onBoxChange, project]);
  const startPressMove = useBoxMove(W, H, stage, targets, onPressDraft, onPressCommit, setGuides);

  const onStagePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (playing || !stage) return;
    const rect = stage.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const list = collectLayers(project, time, newLayerList());
    const hit = layerAt(list, (l) => pointInBox(l.clip.box, fx, fy, W, H));
    if (!hit) {
      onSelect?.(null);
      return;
    }
    onSelect?.(hit.clip.id);
    if (onBoxChange) {
      pressRef.current = { id: hit.clip.id };
      startPressMove(e, hit.clip.box);
    }
  }, [playing, stage, project, time, W, H, onSelect, onBoxChange, startPressMove]);

  // ----- fullscreen ---------------------------------------------------------------------------
  const canFullscreen = useSyncExternalStore(noSubscribe, fullscreenEnabled, serverFalse);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  const duration = projectDuration(project);
  const label = selected?.type === "text" ? `Text box “${selected.text.slice(0, 30)}”` : "Picture box";
  const editing = !playing && selectedVisible && !selectedTrackLocked && !!selected && !!onBoxChange;
  const portrait = project.aspect === "9:16";

  return (
    <MuiBox
      ref={rootRef}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 160,
        display: "flex",
        flexDirection: "column",
        bgcolor: fullscreen ? "#000" : "#1B1D21",
        color: "#E8EAED",
        overflow: "hidden",
      }}
    >
      <MuiBox ref={viewportRef} sx={{ position: "relative", flex: 1, minHeight: 0, display: "grid", placeItems: "center" }}>
        <MuiBox
          ref={setStage}
          onPointerDown={onStagePointerDown}
          sx={{ position: "relative", width: stageW, height: stageH, touchAction: "none", boxShadow: fullscreen ? "none" : "0 2px 18px rgba(0,0,0,0.45)" }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Video preview at ${formatTime(playing ? shownTime : time, project.fps)}`}
            style={{ display: "block", width: "100%", height: "100%" }}
          />
          {safeArea && (
            <svg aria-hidden width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {portrait && (
                <>
                  {/* Where Reels / Shorts lay their own buttons and captions */}
                  <rect x="0" y="0" width="100%" height="12%" fill="rgba(255,62,165,0.14)" />
                  <rect x="0" y="80%" width="100%" height="20%" fill="rgba(255,62,165,0.14)" />
                  <rect x="86%" y="45%" width="14%" height="35%" fill="rgba(255,62,165,0.14)" />
                </>
              )}
              <rect x={`${SAFE_ACTION * 100}%`} y={`${SAFE_ACTION * 100}%`} width={`${(1 - SAFE_ACTION * 2) * 100}%`} height={`${(1 - SAFE_ACTION * 2) * 100}%`} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="2 4" />
              <rect x={`${SAFE_TITLE * 100}%`} y={`${SAFE_TITLE * 100}%`} width={`${(1 - SAFE_TITLE * 2) * 100}%`} height={`${(1 - SAFE_TITLE * 2) * 100}%`} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1" strokeDasharray="6 4" />
              <line x1="50%" y1="48%" x2="50%" y2="52%" stroke="rgba(255,255,255,0.7)" />
              <line x1="48.8%" y1="50%" x2="51.2%" y2="50%" stroke="rgba(255,255,255,0.7)" />
            </svg>
          )}
          {editing && selected && (
            <BoxEditor box={selected.box} W={W} H={H} stage={stage} targets={targets} label={label} onDraft={onDraft} onCommit={onCommit} onGuides={setGuides} />
          )}
          {guides.x !== null && <div aria-hidden style={{ position: "absolute", left: `${guides.x * 100}%`, top: 0, bottom: 0, width: 1, marginLeft: -0.5, background: GUIDE_PINK, pointerEvents: "none" }} />}
          {guides.y !== null && <div aria-hidden style={{ position: "absolute", top: `${guides.y * 100}%`, left: 0, right: 0, height: 1, marginTop: -0.5, background: GUIDE_PINK, pointerEvents: "none" }} />}
        </MuiBox>
      </MuiBox>

      <MuiBox sx={{ height: BAR_H, flexShrink: 0, display: "flex", alignItems: "center", gap: 0.5, px: 1, borderTop: fullscreen ? "none" : "1px solid rgba(255,255,255,0.08)" }}>
        {onTogglePlay && (
          <Tooltip title={playing ? "Pause (Space)" : "Play (Space)"}>
            <IconButton size="small" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"} sx={{ color: "inherit" }}>
              {playing ? <PauseRounded /> : <PlayArrowRounded />}
            </IconButton>
          </Tooltip>
        )}
        <Typography component="span" sx={{ fontFamily: "var(--font-mono), monospace", fontSize: 13, fontVariantNumeric: "tabular-nums", opacity: 0.9, px: 0.5 }}>
          {formatTime(playing ? shownTime : time, project.fps)}
          <MuiBox component="span" sx={{ opacity: 0.5 }}> / {formatTime(duration, project.fps)}</MuiBox>
        </Typography>
        <MuiBox sx={{ flex: 1 }} />
        <Tooltip title={safeArea ? "Hide safe-area guides" : "Show safe-area guides"}>
          <IconButton size="small" onClick={() => setSafeArea((v) => !v)} aria-pressed={safeArea} aria-label="Safe-area guides" sx={{ color: safeArea ? "#7FB0FF" : "inherit" }}>
            <BorderOuterRounded fontSize="small" />
          </IconButton>
        </Tooltip>
        {canFullscreen && (
          <Tooltip title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}>
            <IconButton size="small" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} sx={{ color: "inherit" }}>
              {fullscreen ? <FullscreenExitRounded fontSize="small" /> : <FullscreenRounded fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </MuiBox>
    </MuiBox>
  );
}
