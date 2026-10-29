// Every timeline action as a command: one list feeds the keyboard shortcuts, the command palette (Ctrl+K) and
// the toolbar tooltips, so a shortcut shown anywhere is the one that works.

import type { TrackKind, TransitionType } from "../model";
import { ZOOM_MAX, ZOOM_MIN, selectedClips, type StudioState, type StudioStore } from "../store";
import { clipsUnder, findClip } from "./ops";
import { copySelection, cutSelection, hasClipboard, pasteClipboard } from "./clipboard";
import { bindingForKey, keyLabel as keyLabelOf, keysFor, withShortcut as withShortcutOf } from "../keymap";

export { eventKey, isTypingTarget, isTextEntryTarget, keyLabel, keysFor, shortcutLabel } from "../keymap";

export interface CommandContext {
  store: StudioStore;
  /** Playback lives in the preview (Agent B); the timeline only forwards the key */
  togglePlay?: () => void;
  openPalette?: () => void;
  /** Fit the whole project in the visible timeline width */
  fitZoom?: () => void;
  /** Start renaming the focused track */
  renameTrack?: (trackId: string) => void;
  /** Short confirmation ("Saved", "Copied 2 clips") */
  notify?: (message: string) => void;
}

export type CommandSection = "Edit" | "Clip" | "Playhead" | "View" | "Tracks";

export interface StudioCommand {
  id: string;
  label: string;
  section: CommandSection;
  /** Shortcuts come from video/keymap.ts by id; this only overrides them (avoid: keep one keymap) */
  keys?: string[];
  /** Extra words the palette matches */
  keywords?: string;
  enabled?: (s: StudioState, ctx: CommandContext) => boolean;
  /** May return a promise: a rejection is shown as a message, success shows `done` if set */
  run: (ctx: CommandContext) => void | Promise<unknown>;
  /** Message after a successful run, e.g. "Saved" */
  done?: string;
}

const hasSelection = (s: StudioState) => s.selection.length > 0;
const firstSelected = (s: StudioState) => selectedClips(s)[0] ?? null;

const TRANSITIONS: { type: TransitionType; label: string }[] = [
  { type: "crossfade", label: "Crossfade" },
  { type: "fade-black", label: "Fade through black" },
  { type: "fade-white", label: "Fade through white" },
  { type: "slide-left", label: "Slide left" },
  { type: "slide-right", label: "Slide right" },
  { type: "wipe", label: "Wipe" },
];
export { TRANSITIONS };

export const DEFAULT_TRANSITION_SECONDS = 0.8;

/** Can the clip take a transition in (video/overlay track, touching or overlapping the previous clip)? */
export function canTransition(s: StudioState, clipId: string): boolean {
  const ref = findClip(s.project, clipId);
  if (!ref || ref.track.locked || (ref.track.kind !== "video" && ref.track.kind !== "overlay")) return false;
  const prev = ref.track.clips[ref.index - 1];
  if (!prev) return false;
  return !!ref.clip.transitionIn || Math.abs(prev.start + prev.duration - ref.clip.start) < 0.02;
}

export function canDetach(s: StudioState, clipId: string): boolean {
  const ref = findClip(s.project, clipId);
  if (!ref || ref.clip.type !== "media" || ref.clip.audioDetached || ref.track.locked) return false;
  const assetId = ref.clip.assetId;
  const asset = s.project.assets.find((a) => a.id === assetId);
  return asset?.kind === "video" && asset.hasAudio !== false;
}

export function runDetach(store: StudioStore, clipId: string) {
  store.dispatch({ type: "clip/detachAudio", clipId });
}

const addTrack = (kind: TrackKind, label: string): StudioCommand => ({
  id: `track.add.${kind}`, label: `Add ${label} track`, section: "Tracks", keywords: "new layer",
  run: ({ store }) => store.dispatch({ type: "track/add", kind }),
});

const trackFlag = (flag: "muted" | "hidden" | "locked" | "solo", on: string, off: string): StudioCommand => ({
  id: `track.${flag}`, label: `${on} / ${off} focused track`, section: "Tracks",
  enabled: (s) => !!(s.selectedTrackId ?? findClip(s.project, s.selection[0] ?? "")?.track.id),
  run: ({ store }) => {
    const s = store.getState();
    const id = s.selectedTrackId ?? findClip(s.project, s.selection[0] ?? "")?.track.id;
    const track = s.project.tracks.find((t) => t.id === id);
    if (track) store.dispatch({ type: "track/set", trackId: track.id, patch: { [flag]: !track[flag] } });
  },
});

export const COMMANDS: StudioCommand[] = [
  { id: "edit.undo", label: "Undo", section: "Edit", enabled: (s) => s.past.length > 0, run: ({ store }) => store.dispatch({ type: "history/undo" }) },
  { id: "edit.redo", label: "Redo", section: "Edit", enabled: (s) => s.future.length > 0, run: ({ store }) => store.dispatch({ type: "history/redo" }) },
  { id: "edit.cut", label: "Cut", section: "Edit", enabled: hasSelection, run: (ctx) => { if (cutSelection(ctx.store)) ctx.notify?.("Cut to the clipboard"); } },
  { id: "edit.copy", label: "Copy", section: "Edit", enabled: hasSelection, run: (ctx) => { if (copySelection(ctx.store)) ctx.notify?.(`Copied ${ctx.store.getState().selection.length} clip${ctx.store.getState().selection.length > 1 ? "s" : ""}`); } },
  { id: "edit.paste", label: "Paste at playhead", section: "Edit", enabled: () => hasClipboard(), run: ({ store }) => { pasteClipboard(store); } },
  { id: "edit.selectAll", label: "Select all clips", section: "Edit", run: ({ store }) => store.dispatch({ type: "select/all" }) },
  { id: "edit.deselect", label: "Clear selection", section: "Edit", enabled: hasSelection, run: ({ store }) => store.dispatch({ type: "select", clipIds: [] }) },
  { id: "edit.snapping", label: "Turn snapping on or off", section: "Edit", keywords: "magnet snap", run: ({ store }) => store.dispatch({ type: "snapping", on: !store.getState().snapping }) },

  {
    id: "clip.split", label: "Split at playhead", section: "Clip", keywords: "cut razor",
    enabled: (s) => clipsUnder(s.project, s.playhead).length > 0,
    run: ({ store }) => store.dispatch({ type: "clip/split" }),
  },
  { id: "clip.delete", label: "Delete selected clips", section: "Clip", keywords: "remove", enabled: hasSelection, run: ({ store }) => store.dispatch({ type: "clip/delete" }) },
  { id: "clip.rippleDelete", label: "Ripple delete (close the gap)", section: "Clip", keywords: "remove gap", enabled: hasSelection, run: ({ store }) => store.dispatch({ type: "clip/delete", ripple: true }) },
  { id: "clip.duplicate", label: "Duplicate selected clips", section: "Clip", keywords: "copy", enabled: hasSelection, run: ({ store }) => store.dispatch({ type: "clip/duplicate" }) },
  {
    id: "clip.detach", label: "Detach audio from video", section: "Clip", keywords: "sound separate",
    enabled: (s) => !!firstSelected(s) && canDetach(s, firstSelected(s)!.id),
    run: ({ store }) => {
      const c = firstSelected(store.getState());
      if (c) runDetach(store, c.id);
    },
  },
  ...TRANSITIONS.map<StudioCommand>((t) => ({
    id: `clip.transition.${t.type}`, label: `Transition in: ${t.label}`, section: "Clip", keywords: "transition",
    enabled: (s) => !!firstSelected(s) && canTransition(s, firstSelected(s)!.id),
    run: ({ store }) => {
      const s = store.getState();
      const c = firstSelected(s);
      if (c) store.dispatch({ type: "clip/setTransition", clipId: c.id, transition: { type: t.type, duration: c.transitionIn?.duration ?? DEFAULT_TRANSITION_SECONDS } });
    },
  })),
  {
    id: "clip.transition.none", label: "Remove transition", section: "Clip", keywords: "transition",
    enabled: (s) => !!firstSelected(s)?.transitionIn,
    run: ({ store }) => {
      const c = firstSelected(store.getState());
      if (c) store.dispatch({ type: "clip/setTransition", clipId: c.id, transition: null });
    },
  },

  { id: "play.toggle", label: "Play / pause", section: "Playhead", enabled: (_s, ctx) => !!ctx.togglePlay, run: (ctx) => ctx.togglePlay?.() },
  { id: "playhead.prevFrame", label: "Previous frame", section: "Playhead", run: ({ store }) => store.dispatch({ type: "step", frames: -1 }) },
  { id: "playhead.nextFrame", label: "Next frame", section: "Playhead", run: ({ store }) => store.dispatch({ type: "step", frames: 1 }) },
  { id: "playhead.back1s", label: "Back 1 second", section: "Playhead", run: ({ store }) => store.dispatch({ type: "step", seconds: -1 }) },
  { id: "playhead.fwd1s", label: "Forward 1 second", section: "Playhead", run: ({ store }) => store.dispatch({ type: "step", seconds: 1 }) },
  { id: "playhead.prevEdit", label: "Previous cut", section: "Playhead", keywords: "edit point", run: ({ store }) => store.dispatch({ type: "seek/edit", dir: -1 }) },
  { id: "playhead.nextEdit", label: "Next cut", section: "Playhead", keywords: "edit point", run: ({ store }) => store.dispatch({ type: "seek/edit", dir: 1 }) },
  { id: "playhead.start", label: "Go to start", section: "Playhead", run: ({ store }) => store.dispatch({ type: "seek/edge", edge: "start" }) },
  { id: "playhead.end", label: "Go to end", section: "Playhead", run: ({ store }) => store.dispatch({ type: "seek/edge", edge: "end" }) },

  { id: "view.zoomIn", label: "Zoom in", section: "View", enabled: (s) => s.zoom < ZOOM_MAX, run: ({ store }) => store.dispatch({ type: "zoom", pxPerSecond: store.getState().zoom * 1.4 }) },
  { id: "view.zoomOut", label: "Zoom out", section: "View", enabled: (s) => s.zoom > ZOOM_MIN, run: ({ store }) => store.dispatch({ type: "zoom", pxPerSecond: store.getState().zoom / 1.4 }) },
  { id: "view.fit", label: "Zoom to fit", section: "View", enabled: (_s, ctx) => !!ctx.fitZoom, run: (ctx) => ctx.fitZoom?.() },
  { id: "view.palette", label: "Show all commands", section: "View", enabled: (_s, ctx) => !!ctx.openPalette, run: (ctx) => ctx.openPalette?.() },

  addTrack("video", "video"),
  addTrack("overlay", "overlay"),
  addTrack("text", "text"),
  addTrack("caption", "caption"),
  addTrack("audio", "audio"),
  trackFlag("muted", "Mute", "unmute"),
  trackFlag("solo", "Solo", "unsolo"),
  trackFlag("hidden", "Hide", "show"),
  trackFlag("locked", "Lock", "unlock"),
  {
    id: "track.rename", label: "Rename focused track", section: "Tracks",
    enabled: (s, ctx) => !!s.selectedTrackId && !!ctx.renameTrack,
    run: (ctx) => {
      const id = ctx.store.getState().selectedTrackId;
      if (id) ctx.renameTrack?.(id);
    },
  },
  {
    id: "track.remove", label: "Remove focused track", section: "Tracks", keywords: "delete layer",
    enabled: (s) => !!s.selectedTrackId,
    run: ({ store }) => {
      const id = store.getState().selectedTrackId;
      if (id) store.dispatch({ type: "track/remove", trackId: id });
    },
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Key matching (the keys themselves live in video/keymap.ts)

/** Keys of a command: its own override, else the keymap's */
export const commandKeys = (c: Pick<StudioCommand, "id" | "keys">) => c.keys ?? keysFor(c.id);

export function findCommand(key: string, commands: readonly StudioCommand[] = COMMANDS): StudioCommand | undefined {
  const own = commands.find((c) => c.keys?.includes(key));
  if (own) return own;
  const binding = bindingForKey(key);
  return binding ? commands.find((c) => c.id === binding.id && !c.keys) : undefined;
}

/** Shortcut hint for a command id, for tooltips: "Split at playhead (S)" */
export function withShortcut(id: string): string {
  const c = COMMANDS.find((x) => x.id === id);
  return withShortcutOf(c?.label ?? id, id);
}

/** Display label of a key string (re-exported for older imports) */
export const keyName = keyLabelOf;
