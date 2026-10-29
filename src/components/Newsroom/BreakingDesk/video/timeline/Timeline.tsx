"use client";

// Multi-track timeline for the Video Studio. Reads and edits the studio store (video/store.ts); must sit inside
// <StudioProvider>. Playback belongs to the preview: pass onTogglePlay/playing to get a play button and Space/K.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Box, Divider, IconButton, Menu, MenuItem, Slider, Snackbar, Tooltip } from "@mui/material";
import { Command, Copy, Magnet, Maximize2, Pause, Play, Plus, Redo2, Scissors, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { projectDuration, type Asset, type Track, type TrackKind } from "../model";
import { GESTURE, ZOOM_MAX, ZOOM_MIN, useHistoryFlags, useStudio, useStudioStore, type StudioState } from "../store";
import { ClipBlock, type ClipHandlers, type ClipPart } from "./ClipBlock";
import { useEditorMenu, useSuppressBrowserMenu, wantsNativeMenu } from "../ui/EditorContextMenu";
import { clipMenu, laneMenu, rulerMenu, trackMenu } from "./menus";
import { CommandPalette } from "./CommandPalette";
import { DEFAULT_TRANSITION_SECONDS, withShortcut, type CommandContext, type StudioCommand } from "./commands";
import { ASSET_DRAG_TYPE, HEADER_W, RULER_H, S, TRACK_GAP, clipColor, clipLabel, displayTracks, timecodeFrames, trackHeight } from "./layout";
import { canHost, clipEnd, clipsUnder, findClip, kindsForAsset } from "./ops";
import { Playhead, Ruler } from "./Ruler";
import { SNAP_PX, snapPoints, snapSpan, snapTime } from "./snap";
import { TrackHeader } from "./TrackHeader";
import { useTimelineShortcuts } from "./useTimelineShortcuts";

export interface TimelineProps {
  onTogglePlay?: () => void;
  playing?: boolean;
  /** Shell commands (export, aspect...) listed in the Ctrl+K palette alongside the timeline's */
  extraCommands?: StudioCommand[];
  /** Window keyboard shortcuts (default on). Turn off if the shell installs useTimelineShortcuts itself. */
  shortcuts?: boolean;
  /** "Properties" in the clip menu: show the inspector for this clip (it is selected first) */
  onOpenProperties?: (clipId: string) => void;
}

type Drag =
  | { kind: "scrub"; points: number[] }
  | { kind: "move"; clipId: string; grab: number; duration: number; points: number[]; x0: number; y0: number; started: boolean; group: string }
  /** Several selected clips moving together (time only, each on its own track) */
  | { kind: "group"; clipId: string; origins: { clipId: string; start: number }[]; origin: number; grab: number; duration: number; points: number[]; x0: number; y0: number; started: boolean; group: string }
  | { kind: "trim"; clipId: string; edge: "start" | "end"; points: number[]; group: string }
  | { kind: "transition"; clipId: string; d0: number; x0: number; group: string };

const keepFocus = (e: MouseEvent) => e.preventDefault();
const toolSx = { width: 30, height: 30, borderRadius: "6px", color: S.text, "&:hover": { backgroundColor: S.hover }, "&.Mui-disabled": { color: S.faint } } as const;

const selectProject = (s: StudioState) => s.project;
const selectSelection = (s: StudioState) => s.selection;
const selectTrackFocus = (s: StudioState) => s.selectedTrackId;
const selectZoom = (s: StudioState) => s.zoom;
const selectSnapping = (s: StudioState) => s.snapping;
const selectCanSplit = (s: StudioState) => clipsUnder(s.project, s.playhead).length > 0;

// ---------------------------------------------------------------------------------------------------------------

interface LaneProps {
  track: Track;
  assets: Asset[];
  zoom: number;
  selection: string[];
  handlers: ClipHandlers;
  onLanePointerDown: (e: PointerEvent<HTMLElement>, trackId: string) => void;
  onLaneMenu: (e: MouseEvent<HTMLElement>, trackId: string) => void;
  onAddTransition: (clipId: string) => void;
  onDrop: (e: DragEvent<HTMLElement>, track: Track) => void;
}

const TrackLane = memo(function TrackLane({ track, assets, zoom, selection, handlers, onLanePointerDown, onLaneMenu, onAddTransition, onDrop }: LaneProps) {
  const height = trackHeight(track.kind);
  const project = { assets };
  const dimmed = track.kind === "audio" ? track.muted : track.hidden;
  const joins: { clipId: string; at: number }[] = [];
  if ((track.kind === "video" || track.kind === "overlay") && !track.locked) {
    for (let i = 1; i < track.clips.length; i++) {
      const prev = track.clips[i - 1];
      const c = track.clips[i];
      if (!c.transitionIn && Math.abs(clipEnd(prev) - c.start) < 0.02 && prev.duration > 0.4 && c.duration > 0.4) joins.push({ clipId: c.id, at: c.start });
    }
  }
  return (
    <Box
      data-lane-id={track.id}
      onPointerDown={(e) => onLanePointerDown(e, track.id)}
      onContextMenu={(e) => onLaneMenu(e, track.id)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => onDrop(e, track)}
      sx={{
        position: "relative", flex: 1, height, touchAction: "none",
        backgroundColor: track.locked ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.035)",
        backgroundImage: track.locked ? "repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.03) 6px 12px)" : undefined,
        "&:hover .join, & .join:focus-visible": { opacity: 1, pointerEvents: "auto" },
      }}
    >
      {track.clips.map((clip) => {
        const asset = clip.type === "media" || clip.type === "audio" ? assets.find((a) => a.id === clip.assetId) ?? null : null;
        return (
          <ClipBlock
            key={clip.id}
            clip={clip}
            trackKind={track.kind}
            asset={asset}
            label={clipLabel(clip, project)}
            color={clipColor(clip, project)}
            zoom={zoom}
            height={height}
            selected={selection.includes(clip.id)}
            locked={track.locked}
            dimmed={dimmed}
            handlers={handlers}
          />
        );
      })}
      {joins.map((j) => (
        <Tooltip key={j.clipId} title="Add a crossfade here">
          <Box
            component="button"
            type="button"
            className="join"
            aria-label="Add a crossfade between these clips"
            onPointerDown={(e: PointerEvent) => e.stopPropagation()}
            onClick={() => onAddTransition(j.clipId)}
            style={{ left: j.at * zoom - 8 }}
            sx={{
              // Sits on the top edge so the trim handles below it stay grabbable
              position: "absolute", top: -3, width: 16, height: 16, p: 0, borderRadius: "50%", border: `1px solid ${S.stage}`,
              backgroundColor: S.text, color: S.stage, display: "grid", placeItems: "center", cursor: "pointer", opacity: 0, pointerEvents: "none", zIndex: 4,
              "&:focus-visible": { outline: `2px solid ${S.accent}`, outlineOffset: 1 },
            }}
          >
            <Plus size={10} strokeWidth={3} />
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
});

// ---------------------------------------------------------------------------------------------------------------

function Clock() {
  const playhead = useStudio((s) => s.playhead);
  const fps = useStudio((s) => s.project.fps);
  const duration = useStudio((s) => projectDuration(s.project));
  return (
    <Box sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: S.text, minWidth: 128, textAlign: "center" }} aria-label="Playhead position">
      {timecodeFrames(playhead, fps)}
      <Box component="span" sx={{ color: S.faint }}> / {timecodeFrames(duration, fps)}</Box>
    </Box>
  );
}

const zoomToSlider = (z: number) => Math.log(z / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
const sliderToZoom = (v: number) => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, v);

export default function Timeline({ onTogglePlay, playing = false, extraCommands, shortcuts = true, onOpenProperties }: TimelineProps) {
  const store = useStudioStore();
  const project = useStudio(selectProject);
  const selection = useStudio(selectSelection);
  const focusedTrack = useStudio(selectTrackFocus);
  const zoom = useStudio(selectZoom);
  const snapping = useStudio(selectSnapping);
  const canSplit = useStudio(selectCanSplit);
  const { canUndo, canRedo } = useHistoryFlags();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const following = useRef(true);
  const zoomAnchor = useRef<{ time: number; offset: number } | null>(null);
  const prevZoom = useRef(zoom);

  const [viewport, setViewport] = useState(800);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menu = useEditorMenu("Timeline options");
  const { open: openMenu, openAt: openMenuAt } = menu;
  const rootRef = useRef<HTMLDivElement>(null);
  useSuppressBrowserMenu(rootRef);
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  const notify = useCallback((message: string) => setToast({ message, key: Date.now() }), []);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);

  const tracks = useMemo(() => displayTracks(project.tracks), [project.tracks]);
  const duration = projectDuration(project);
  const contentSeconds = Math.max(duration + 10, (viewport - HEADER_W) / zoom);
  const contentWidth = HEADER_W + contentSeconds * zoom;
  const hasClips = project.tracks.some((t) => t.clips.length > 0);

  // ── geometry ──
  const timeAt = useCallback((clientX: number) => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, (clientX - rect.left - HEADER_W) / store.getState().zoom);
  }, [store]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the point under the cursor (or the playhead) still while zooming
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || prevZoom.current === zoom) return;
    let anchor = zoomAnchor.current;
    if (!anchor) {
      const t = store.getState().playhead;
      anchor = { time: t, offset: HEADER_W + t * prevZoom.current - el.scrollLeft };
      if (anchor.offset < HEADER_W || anchor.offset > el.clientWidth) anchor = { time: (el.scrollLeft) / prevZoom.current, offset: HEADER_W };
    }
    el.scrollLeft = Math.max(0, HEADER_W + anchor.time * zoom - anchor.offset);
    zoomAnchor.current = null;
    prevZoom.current = zoom;
  }, [zoom, store]);

  // Ctrl/Cmd + wheel zooms (needs a non-passive listener to stop the page zooming)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        following.current = false;
        return;
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const offset = Math.max(HEADER_W, e.clientX - rect.left);
      const z = store.getState().zoom;
      zoomAnchor.current = { time: (el.scrollLeft + offset - HEADER_W) / z, offset };
      store.dispatch({ type: "zoom", pxPerSecond: z * Math.exp(-e.deltaY * 0.0025) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store]);

  const fitZoom = useCallback(() => {
    const el = scrollerRef.current;
    const d = projectDuration(store.getState().project);
    if (!el) return;
    zoomAnchor.current = { time: 0, offset: HEADER_W };
    store.dispatch({ type: "zoom", pxPerSecond: (el.clientWidth - HEADER_W - 32) / Math.max(5, d) });
  }, [store]);

  // ── drag controller ──
  const endDrag = useRef<() => void>(() => {});

  const startDrag = useCallback((drag: Drag) => {
    dragRef.current = drag;
    following.current = false;
    const onMove = (e: globalThis.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const s = store.getState();
      const threshold = SNAP_PX / s.zoom;
      const snap = s.snapping && !e.altKey;
      if (d.kind === "scrub") {
        const r = snap ? snapTime(timeAt(e.clientX), d.points, threshold) : { time: timeAt(e.clientX), target: null };
        store.dispatch({ type: "seek", time: r.time });
        return;
      }
      if (d.kind === "group") {
        if (!d.started) {
          if (Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
          d.started = true;
        }
        const raw = timeAt(e.clientX) - d.grab;
        const r = snap ? snapSpan(raw, d.duration, d.points, threshold) : { time: raw, target: null };
        setSnapLine(r.target);
        store.dispatch({ type: "clips/shift", origins: d.origins, delta: r.time - d.origin, group: d.group });
      } else if (d.kind === "move") {
        if (!d.started) {
          if (Math.abs(e.clientX - d.x0) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
          d.started = true;
        }
        const ref = findClip(s.project, d.clipId);
        if (!ref) return;
        let trackId = ref.track.id;
        const lane = document.elementsFromPoint(e.clientX, e.clientY).map((el) => (el as HTMLElement).closest?.("[data-lane-id]") as HTMLElement | null).find(Boolean);
        const over = lane ? s.project.tracks.find((t) => t.id === lane.dataset.laneId) : null;
        if (over && !over.locked && canHost(over.kind, ref.clip)) trackId = over.id;
        const raw = timeAt(e.clientX) - d.grab;
        const r = snap ? snapSpan(raw, d.duration, d.points, threshold) : { time: raw, target: null };
        setSnapLine(r.target);
        store.dispatch({ type: "clip/move", clipId: d.clipId, trackId, start: Math.max(0, r.time), group: d.group });
      } else if (d.kind === "trim") {
        const raw = timeAt(e.clientX);
        const r = snap ? snapTime(raw, d.points, threshold) : { time: raw, target: null };
        setSnapLine(r.target);
        store.dispatch({ type: "clip/trim", clipId: d.clipId, edge: d.edge, time: r.time, group: d.group });
      } else if (d.kind === "transition") {
        const ref = findClip(s.project, d.clipId);
        if (!ref?.clip.transitionIn) return;
        const duration = d.d0 + (d.x0 - e.clientX) / s.zoom;
        store.dispatch({ type: "clip/setTransition", clipId: d.clipId, transition: { type: ref.clip.transitionIn.type, duration }, group: d.group });
      }
      // Nudge the view when dragging past the edge
      const el = scrollerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (e.clientX > rect.right - 32) el.scrollLeft += 16;
        else if (e.clientX < rect.left + HEADER_W + 16) el.scrollLeft -= 16;
      }
    };
    const onUp = () => endDrag.current();
    endDrag.current = () => {
      const d = dragRef.current;
      // A plain click on one clip of a multi-selection selects just that clip, as desktop editors do
      if (d?.kind === "group" && !d.started) store.dispatch({ type: "select", clipIds: [d.clipId] });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dragRef.current = null;
      setSnapLine(null);
      store.dispatch({ type: "history/endGroup" });
      endDrag.current = () => {};
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [store, timeAt]);

  useEffect(() => () => endDrag.current(), []);

  const startScrub = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const s = store.getState();
    const points = snapPoints(s.project, -1);
    following.current = false;
    store.dispatch({ type: "seek", time: timeAt(e.clientX) });
    startDrag({ kind: "scrub", points });
  }, [store, startDrag, timeAt]);

  const handlers = useMemo<ClipHandlers>(() => ({
    onPointerDown: (e: PointerEvent<HTMLElement>, clipId: string, part: ClipPart) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const s = store.getState();
      const ref = findClip(s.project, clipId);
      if (!ref) return;
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
      if (additive) store.dispatch({ type: "select", clipIds: [clipId], mode: "toggle" });
      else if (!s.selection.includes(clipId) || part !== "body") store.dispatch({ type: "select", clipIds: [clipId] });
      store.dispatch({ type: "select/track", trackId: ref.track.id });
      if (ref.track.locked || additive) return;
      const group = `${GESTURE}${part}:${clipId}:${e.timeStamp}`;
      const multi = part === "body" && s.selection.length > 1 && s.selection.includes(clipId);
      if (multi) {
        const origins: { clipId: string; start: number }[] = [];
        for (const id of s.selection) {
          const r = findClip(s.project, id);
          if (r && !r.track.locked) origins.push({ clipId: r.clip.id, start: r.clip.start });
        }
        const pts = snapPoints(s.project, s.playhead, new Set(origins.map((o) => o.clipId)));
        startDrag({ kind: "group", clipId, origins, origin: ref.clip.start, grab: timeAt(e.clientX) - ref.clip.start, duration: ref.clip.duration, points: pts, x0: e.clientX, y0: e.clientY, started: false, group });
        return;
      }
      const points = snapPoints(s.project, s.playhead, new Set([clipId]));
      if (part === "body") startDrag({ kind: "move", clipId, grab: timeAt(e.clientX) - ref.clip.start, duration: ref.clip.duration, points, x0: e.clientX, y0: e.clientY, started: false, group });
      else if (part === "transition") startDrag({ kind: "transition", clipId, d0: ref.clip.transitionIn?.duration ?? 0, x0: e.clientX, group });
      else startDrag({ kind: "trim", clipId, edge: part, points, group });
    },
    onContextMenu: (e: MouseEvent<HTMLElement>, clipId: string) => {
      if (wantsNativeMenu(e.nativeEvent)) return;
      e.stopPropagation();
      const s = store.getState();
      if (!s.selection.includes(clipId)) store.dispatch({ type: "select", clipIds: [clipId] });
      openMenu(e, () => clipMenu(store, clipId, { notify, openProperties: onOpenProperties }));
    },
    onEdgeKey: (e: KeyboardEvent<HTMLElement>, clipId: string, edge: "start" | "end") => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      const s = store.getState();
      const ref = findClip(s.project, clipId);
      if (!ref) return;
      const step = (e.shiftKey ? 1 : 1 / s.project.fps) * (e.key === "ArrowLeft" ? -1 : 1);
      const at = edge === "start" ? ref.clip.start : clipEnd(ref.clip);
      store.dispatch({ type: "clip/trim", clipId, edge, time: at + step, group: `edge:${clipId}:${edge}` });
    },
    onFocusSelect: (clipId: string) => {
      if (!store.getState().selection.includes(clipId)) store.dispatch({ type: "select", clipIds: [clipId] });
    },
  }), [store, startDrag, timeAt, openMenu, notify, onOpenProperties]);

  const onLaneMenu = useCallback((e: MouseEvent<HTMLElement>, trackId: string) => {
    if (wantsNativeMenu(e.nativeEvent)) return;
    const at = timeAt(e.clientX);
    store.dispatch({ type: "select/track", trackId });
    openMenu(e, () => laneMenu(store, trackId, at));
  }, [store, timeAt, openMenu]);

  const onTrackMenu = useCallback((at: { x: number; y: number }, trackId: string) => {
    openMenuAt(at, () => trackMenu(store, trackId, setRenaming));
  }, [store, openMenuAt]);

  const onLanePointerDown = useCallback((e: PointerEvent<HTMLElement>, trackId: string) => {
    if (e.button !== 0) return;
    store.dispatch({ type: "select", clipIds: [] });
    store.dispatch({ type: "select/track", trackId });
    startScrub(e);
  }, [store, startScrub]);

  const onAddTransition = useCallback((clipId: string) => {
    store.dispatch({ type: "clip/setTransition", clipId, transition: { type: "crossfade", duration: DEFAULT_TRANSITION_SECONDS } });
    store.dispatch({ type: "select", clipIds: [clipId] });
  }, [store]);

  const onDrop = useCallback((e: DragEvent<HTMLElement>, track: Track) => {
    const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (!assetId) return;
    e.preventDefault();
    const s = store.getState();
    const asset = s.project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    const fits = !track.locked && kindsForAsset(asset).includes(track.kind);
    store.dispatch({ type: "clip/addFromAsset", assetId, trackId: fits ? track.id : undefined, start: timeAt(e.clientX) });
  }, [store, timeAt]);

  // ── commands + shortcuts ──
  const ctx = useMemo<CommandContext>(() => ({
    store,
    togglePlay: onTogglePlay ? () => { following.current = true; onTogglePlay(); } : undefined,
    openPalette: () => setPaletteOpen(true),
    fitZoom,
    renameTrack: (id: string) => setRenaming(id),
    notify,
  }), [store, onTogglePlay, fitZoom, notify]);
  useTimelineShortcuts(ctx, shortcuts && !paletteOpen, extraCommands);

  // Follow the playhead again while playing
  useEffect(() => {
    if (playing) following.current = true;
  }, [playing]);

  const zoomTo = (z: number) => {
    zoomAnchor.current = null;
    store.dispatch({ type: "zoom", pxPerSecond: z });
  };

  const sel = selection.length > 0;

  return (
    <Box ref={rootRef} sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", backgroundColor: S.stage, color: S.text, userSelect: "none" }}>
      {/* Toolbar */}
      <Box role="toolbar" aria-label="Timeline tools" sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1, height: 42, flexShrink: 0, borderBottom: `1px solid ${S.line}`, backgroundColor: S.chrome }}>
        <Tooltip title={withShortcut("edit.undo")}><span><IconButton aria-label="Undo" sx={toolSx} disabled={!canUndo} onMouseDown={keepFocus} onClick={() => store.dispatch({ type: "history/undo" })}><Undo2 size={16} /></IconButton></span></Tooltip>
        <Tooltip title={withShortcut("edit.redo")}><span><IconButton aria-label="Redo" sx={toolSx} disabled={!canRedo} onMouseDown={keepFocus} onClick={() => store.dispatch({ type: "history/redo" })}><Redo2 size={16} /></IconButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1, borderColor: S.line }} />
        <Tooltip title={canSplit ? withShortcut("clip.split") : "Move the playhead over a clip to split it"}><span><IconButton aria-label="Split at playhead" sx={toolSx} disabled={!canSplit} onMouseDown={keepFocus} onClick={() => store.dispatch({ type: "clip/split" })}><Scissors size={16} /></IconButton></span></Tooltip>
        <Tooltip title={sel ? withShortcut("clip.duplicate") : "Select a clip to duplicate it"}><span><IconButton aria-label="Duplicate" sx={toolSx} disabled={!sel} onMouseDown={keepFocus} onClick={() => store.dispatch({ type: "clip/duplicate" })}><Copy size={16} /></IconButton></span></Tooltip>
        <Tooltip title={sel ? withShortcut("clip.delete") : "Select a clip to delete it"}><span><IconButton aria-label="Delete" sx={toolSx} disabled={!sel} onMouseDown={keepFocus} onClick={() => store.dispatch({ type: "clip/delete" })}><Trash2 size={16} /></IconButton></span></Tooltip>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1, borderColor: S.line }} />
        <Tooltip title={`${snapping ? "Snapping on" : "Snapping off"} (N). Hold Alt while dragging to skip it`}>
          <IconButton aria-label="Snapping" aria-pressed={snapping} sx={{ ...toolSx, color: snapping ? S.accent : S.faint }} onMouseDown={keepFocus} onClick={() => store.dispatch({ type: "snapping", on: !snapping })}><Magnet size={16} /></IconButton>
        </Tooltip>
        <Tooltip title="Add a track"><IconButton aria-label="Add a track" aria-haspopup="menu" sx={toolSx} onMouseDown={keepFocus} onClick={(e) => setAddMenu(e.currentTarget)}><Plus size={16} /></IconButton></Tooltip>
        <Menu anchorEl={addMenu} open={!!addMenu} onClose={() => setAddMenu(null)} slotProps={{ paper: { sx: { backgroundColor: S.raised } } }}>
          {(["video", "overlay", "text", "caption", "audio"] as TrackKind[]).map((k) => (
            <MenuItem key={k} dense onClick={() => { setAddMenu(null); store.dispatch({ type: "track/add", kind: k }); }} sx={{ fontSize: "0.8125rem", textTransform: "capitalize" }}>{k} track</MenuItem>
          ))}
        </Menu>

        <Box sx={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 1, minWidth: 0 }}>
          {onTogglePlay && (
            <Tooltip title={playing ? "Pause (Space)" : "Play (Space)"}>
              <IconButton aria-label={playing ? "Pause" : "Play"} onMouseDown={keepFocus} onClick={ctx.togglePlay} sx={{ width: 32, height: 32, backgroundColor: S.text, color: S.stage, "&:hover": { backgroundColor: S.muted } }}>
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </IconButton>
            </Tooltip>
          )}
          <Clock />
        </Box>

        <Tooltip title={withShortcut("view.zoomOut")}><span><IconButton aria-label="Zoom out" sx={toolSx} disabled={zoom <= ZOOM_MIN} onMouseDown={keepFocus} onClick={() => zoomTo(zoom / 1.4)}><ZoomOut size={16} /></IconButton></span></Tooltip>
        <Slider
          aria-label="Timeline zoom"
          value={zoomToSlider(zoom)}
          min={0}
          max={1}
          step={0.005}
          onChange={(_, v) => zoomTo(sliderToZoom(v as number))}
          sx={{ width: { xs: 70, md: 110 }, color: S.muted, mx: 0.5, "& .MuiSlider-thumb": { width: 12, height: 12 } }}
        />
        <Tooltip title={withShortcut("view.zoomIn")}><span><IconButton aria-label="Zoom in" sx={toolSx} disabled={zoom >= ZOOM_MAX} onMouseDown={keepFocus} onClick={() => zoomTo(zoom * 1.4)}><ZoomIn size={16} /></IconButton></span></Tooltip>
        <Tooltip title={withShortcut("view.fit")}><IconButton aria-label="Zoom to fit" sx={toolSx} onMouseDown={keepFocus} onClick={fitZoom}><Maximize2 size={15} /></IconButton></Tooltip>
        <Tooltip title={withShortcut("view.palette")}><IconButton aria-label="Show all commands" sx={toolSx} onMouseDown={keepFocus} onClick={() => setPaletteOpen(true)}><Command size={15} /></IconButton></Tooltip>
      </Box>

      {/* Tracks */}
      <Box ref={scrollerRef} sx={{ position: "relative", flex: 1, minHeight: 0, overflow: "auto", overscrollBehavior: "contain" }}>
        <Box ref={contentRef} style={{ width: contentWidth }} sx={{ position: "relative", minHeight: "100%" }}>
          {/* Ruler row */}
          <Box sx={{ position: "sticky", top: 0, zIndex: 5, display: "flex", height: RULER_H, backgroundColor: S.chrome, borderBottom: `1px solid ${S.line}` }}>
            <Box sx={{ position: "sticky", left: 0, zIndex: 1, width: HEADER_W, flexShrink: 0, backgroundColor: S.chrome, borderRight: `1px solid ${S.line}` }} />
            <Box
              sx={{ flex: 1, display: "flex" }}
              onContextMenu={(e) => {
                if (wantsNativeMenu(e.nativeEvent)) return;
                const at = timeAt(e.clientX);
                openMenu(e, () => rulerMenu(store, at, fitZoom));
              }}
            >
              <Ruler scrollerRef={scrollerRef} zoom={zoom} onPointerDown={startScrub} />
            </Box>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: `${TRACK_GAP}px`, pt: `${TRACK_GAP}px`, pb: 3 }}>
            {tracks.map((track, i) => {
              const sound = track.kind === "audio";
              const prev = tracks[i - 1];
              return (
                <Box key={track.id} sx={{ display: "flex", mt: prev && (prev.kind === "audio") !== sound ? "6px" : 0 }}>
                  <TrackHeader
                    track={track}
                    height={trackHeight(track.kind)}
                    focused={focusedTrack === track.id}
                    renaming={renaming === track.id}
                    store={store}
                    onRename={setRenaming}
                    onMenu={onTrackMenu}
                  />
                  <TrackLane track={track} assets={project.assets} zoom={zoom} selection={selection} handlers={handlers} onLanePointerDown={onLanePointerDown} onLaneMenu={onLaneMenu} onAddTransition={onAddTransition} onDrop={onDrop} />
                </Box>
              );
            })}
          </Box>

          {!hasClips && (
            <Box sx={{ position: "absolute", top: RULER_H + 12, left: HEADER_W + 16, pointerEvents: "none", color: S.muted, fontSize: "0.8125rem", px: 1.5, py: 1, borderRadius: "6px", backgroundColor: "rgba(18,20,24,0.85)", border: `1px dashed ${S.line}`, zIndex: 2 }}>
              Your timeline is empty. Add footage from the media panel, or drag a file onto a track.
            </Box>
          )}

          {snapLine !== null && <Box aria-hidden style={{ left: HEADER_W + snapLine * zoom }} sx={{ position: "absolute", top: RULER_H, bottom: 0, width: "1px", backgroundColor: S.text, opacity: 0.7, zIndex: 3, pointerEvents: "none" }} />}

          <Playhead zoom={zoom} scrollerRef={scrollerRef} following={following} onPointerDown={startScrub} />
        </Box>
      </Box>

      {menu.element}
      <Snackbar
        key={toast?.key}
        open={!!toast}
        message={toast?.message}
        autoHideDuration={2200}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ content: { sx: { backgroundColor: S.raised, color: S.text, border: `1px solid ${S.line}`, minWidth: 0, py: 0, fontSize: "0.8125rem" } } }}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} ctx={ctx} extra={extraCommands} />
    </Box>
  );
}
