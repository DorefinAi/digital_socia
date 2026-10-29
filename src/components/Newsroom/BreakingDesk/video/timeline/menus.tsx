"use client";

// Right-click menus of the timeline, built on the shared EditorContextMenu. Each builder reads the store when the
// menu opens and returns plain entries; items act on the selection (the clicked clip is selected first).

import { ArrowDownToLine, ArrowUpToLine, Captions, ClipboardPaste, Copy, CopyPlus, Eye, Gauge, Headphones, Lock, Maximize2, Pencil, Scissors, Settings2, SplitSquareHorizontal, Trash2, Type, Unlink, Volume2, VolumeX, Wand2, Scissors as Cut, ListChecks } from "lucide-react";
import type { Track, TrackKind } from "../model";
import type { StudioStore } from "../store";
import type { MenuEntry } from "../ui/EditorContextMenu";
import { copySelection, cutSelection, hasClipboard, pasteClipboard } from "./clipboard";
import { DEFAULT_TRANSITION_SECONDS, TRANSITIONS, canDetach, canTransition, runDetach, type CommandContext } from "./commands";
import { clipsUnder, findClip, makeCaptionClip, makeTextClip } from "./ops";

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

const icon = (I: typeof Copy) => <I size={13} />;

export function clipMenu(store: StudioStore, clipId: string, ctx: Pick<CommandContext, "notify"> & { openProperties?: (clipId: string) => void }): MenuEntry[] {
  const s = store.getState();
  const ref = findClip(s.project, clipId);
  if (!ref) return [];
  const { clip, track } = ref;
  const locked = track.locked;
  const many = s.selection.length > 1;
  const n = s.selection.length;
  const entries: MenuEntry[] = [
    { label: many ? `Cut ${n} clips` : "Cut", icon: icon(Cut), command: "edit.cut", disabled: locked, onSelect: () => cutSelection(store) },
    { label: many ? `Copy ${n} clips` : "Copy", icon: icon(Copy), command: "edit.copy", onSelect: () => { if (copySelection(store)) ctx.notify?.(many ? `Copied ${n} clips` : "Copied"); } },
    { label: "Paste at playhead", icon: icon(ClipboardPaste), command: "edit.paste", disabled: !hasClipboard(), onSelect: () => pasteClipboard(store, undefined, track.id) },
    { label: "Duplicate", icon: icon(CopyPlus), command: "clip.duplicate", disabled: locked, onSelect: () => store.dispatch({ type: "clip/duplicate" }) },
    { kind: "divider" },
    { label: "Split at playhead", icon: icon(Scissors), command: "clip.split", disabled: locked || !clipsUnder(s.project, s.playhead, [clipId]).length, onSelect: () => store.dispatch({ type: "clip/split", clipIds: [clipId] }) },
  ];
  if (canDetach(s, clipId)) entries.push({ label: "Detach audio", icon: icon(Unlink), onSelect: () => runDetach(store, clipId) });
  if (clip.type === "media" || clip.type === "audio") {
    const speed = clip.speed;
    entries.push({
      label: `Speed (${speed}×)`, icon: icon(Gauge), disabled: locked,
      submenu: SPEEDS.map((v) => ({ label: `${v}×${v === 1 ? "  normal" : ""}`, checked: v === speed, onSelect: () => store.dispatch({ type: "clip/update", clipId, patch: { speed: v } }) })),
    });
    const muted = clip.volume === 0;
    entries.push({ label: muted ? "Unmute clip" : "Mute clip", icon: icon(muted ? Volume2 : VolumeX), disabled: locked, onSelect: () => store.dispatch({ type: "clip/update", clipId, patch: { volume: muted ? 1 : 0 } }) });
  }
  if (canTransition(s, clipId)) {
    entries.push({
      label: "Transition from previous clip", icon: icon(Wand2),
      submenu: [
        ...TRANSITIONS.map<MenuEntry>((t) => ({ label: t.label, checked: clip.transitionIn?.type === t.type, onSelect: () => store.dispatch({ type: "clip/setTransition", clipId, transition: { type: t.type, duration: clip.transitionIn?.duration ?? DEFAULT_TRANSITION_SECONDS } }) })),
        { kind: "divider" },
        { label: "No transition", checked: !clip.transitionIn, onSelect: () => store.dispatch({ type: "clip/setTransition", clipId, transition: null }) },
      ],
    });
  }
  entries.push(
    { kind: "divider" },
    { label: "Delete", icon: icon(Trash2), command: "clip.delete", danger: true, disabled: locked, onSelect: () => store.dispatch({ type: "clip/delete" }) },
    { label: "Delete and close gap", icon: icon(SplitSquareHorizontal), command: "clip.rippleDelete", danger: true, disabled: locked, onSelect: () => store.dispatch({ type: "clip/delete", ripple: true }) },
    { kind: "divider" },
    { label: "Properties", icon: icon(Settings2), onSelect: () => { store.dispatch({ type: "select", clipIds: [clipId] }); ctx.openProperties?.(clipId); } },
  );
  return entries;
}

/** Empty part of a track, at timeline time `at` */
export function laneMenu(store: StudioStore, trackId: string, at: number): MenuEntry[] {
  const s = store.getState();
  const track = s.project.tracks.find((t) => t.id === trackId);
  if (!track) return [];
  const stamp = `${Date.now().toString(36)}${Math.round(at * 1000).toString(36)}`;
  const addOn = (kind: TrackKind) => (track.kind === kind && !track.locked ? track.id : undefined);
  return [
    { label: "Paste here", icon: icon(ClipboardPaste), command: "edit.paste", disabled: !hasClipboard() || track.locked, onSelect: () => pasteClipboard(store, at, track.id) },
    { kind: "divider" },
    { label: "Add text here", icon: icon(Type), onSelect: () => store.dispatch({ type: "clip/add", kind: "text", trackId: addOn("text"), clip: makeTextClip(`txt-${stamp}`, "Your text", at) }) },
    { label: "Add caption here", icon: icon(Captions), onSelect: () => store.dispatch({ type: "clip/add", kind: "caption", trackId: addOn("caption"), clip: makeCaptionClip(`cap-${stamp}`, "Caption", at) }) },
    { kind: "divider" },
    { label: `Select all on ${track.name}`, icon: icon(ListChecks), disabled: !track.clips.length, onSelect: () => store.dispatch({ type: "select", clipIds: track.clips.map((c) => c.id) }) },
  ];
}

const HAS_SOUND: Record<TrackKind, boolean> = { video: true, overlay: true, text: false, caption: false, audio: true };

export function trackMenu(store: StudioStore, trackId: string, onRename: (id: string) => void): MenuEntry[] {
  const s = store.getState();
  const track = s.project.tracks.find((t) => t.id === trackId);
  if (!track) return [];
  const set = (patch: Partial<Pick<Track, "muted" | "hidden" | "locked" | "solo">>) => store.dispatch({ type: "track/set", trackId, patch });
  const index = s.project.tracks.indexOf(track);
  // Picture tracks are shown top layer first, so "above" on screen is a higher index; sound tracks list in order
  const aboveIndex = track.kind === "audio" ? index : index + 1;
  const belowIndex = track.kind === "audio" ? index + 1 : index;
  const entries: MenuEntry[] = [{ label: "Rename", icon: icon(Pencil), onSelect: () => onRename(trackId) }, { kind: "divider" }];
  if (HAS_SOUND[track.kind]) {
    entries.push(
      { label: "Mute", icon: icon(VolumeX), checked: track.muted, onSelect: () => set({ muted: !track.muted }) },
      { label: "Solo", icon: icon(Headphones), checked: !!track.solo, onSelect: () => set({ solo: !track.solo }) },
    );
  }
  if (track.kind !== "audio") entries.push({ label: "Hide", icon: icon(Eye), checked: track.hidden, onSelect: () => set({ hidden: !track.hidden }) });
  entries.push(
    { label: "Lock", icon: icon(Lock), checked: track.locked, onSelect: () => set({ locked: !track.locked }) },
    { kind: "divider" },
    { label: `Add ${track.kind} track above`, icon: icon(ArrowUpToLine), onSelect: () => store.dispatch({ type: "track/add", kind: track.kind, index: aboveIndex }) },
    { label: `Add ${track.kind} track below`, icon: icon(ArrowDownToLine), onSelect: () => store.dispatch({ type: "track/add", kind: track.kind, index: belowIndex }) },
    { kind: "divider" },
    { label: track.clips.length ? `Delete track and its ${track.clips.length} clip${track.clips.length > 1 ? "s" : ""}` : "Delete track", icon: icon(Trash2), danger: true, onSelect: () => store.dispatch({ type: "track/remove", trackId }) },
  );
  return entries;
}

/** Ruler, at timeline time `at` */
export function rulerMenu(store: StudioStore, at: number, fitZoom: () => void): MenuEntry[] {
  return [
    { label: "Move playhead here", onSelect: () => store.dispatch({ type: "seek", time: at }) },
    { label: "Split all clips here", icon: icon(Scissors), disabled: !clipsUnder(store.getState().project, at).length, onSelect: () => store.dispatch({ type: "clip/split", at, clipIds: clipsUnder(store.getState().project, at) }) },
    { kind: "divider" },
    { label: "Zoom to fit", icon: icon(Maximize2), command: "view.fit", onSelect: fitZoom },
  ];
}
