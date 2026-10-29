// Video Studio state: one pure reducer over the Project (video/model.ts) plus view state (selection, playhead, zoom).
// Every project edit is an action; undo/redo keeps whole-project snapshots (cheap: edits share untouched tracks).
// Drags send many actions with the same `group` and finish with history/endGroup, so one drag is one undo step.
//
// The store lives outside React (useSyncExternalStore) so the playhead can move 30-60 times a second during
// playback and only the components that select it re-render.

import { createContext, createElement, useCallback, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { newId, projectDuration, type Asset, type CaptionClip, type CaptionStyle, type Clip, type Project, type Track, type TrackKind, type Transition } from "./model";
import * as ops from "./timeline/ops";
import { detachAudio } from "./audio/detach";

export interface StudioState {
  project: Project;
  /** Selected clip ids */
  selection: string[];
  /** Track focused for track-level commands (rename, remove), or null */
  selectedTrackId: string | null;
  /** Timeline seconds */
  playhead: number;
  /** Timeline zoom, pixels per second */
  zoom: number;
  snapping: boolean;
  past: Project[];
  future: Project[];
  /** Open undo group: edits with this same group key merge into one undo step */
  group: string | null;
  /** Increments on every project change (autosave can watch it) */
  revision: number;
  /** Id source, so the reducer stays deterministic */
  seq: number;
  salt: string;
}

/** Undoable edits. `group` merges consecutive edits with the same key into one undo step (end with history/endGroup). */
export type EditAction =
  | { type: "project/set"; patch: Partial<Pick<Project, "aspect" | "fps" | "background">> & { captionStyle?: Partial<CaptionStyle> }; group?: string }
  /** Escape hatch for pure helpers from other modules (e.g. audio/detach detachAudio): one undoable step */
  | { type: "project/edit"; edit: (p: Project) => Project; group?: string; select?: string[] }
  | { type: "assets/add"; assets: Asset[] }
  | { type: "assets/remove"; assetId: string }
  | { type: "clip/addFromAsset"; assetId: string; trackId?: string; start?: number; select?: boolean }
  /**
   * Add a ready-made clip. With trackId: nearest free spot on that track. Otherwise the first unlocked track of
   * `kind` (default: any track that can hold it) with room at clip.start, or a new track of that kind.
   */
  | { type: "clip/add"; clip: Clip; trackId?: string; kind?: TrackKind; select?: boolean }
  /** Replace every clip on a caption track (SRT import); the first caption track unless trackId */
  | { type: "captions/replace"; clips: CaptionClip[]; trackId?: string }
  | { type: "clip/update"; clipId: string; patch: Partial<Clip>; group?: string }
  | { type: "clip/move"; clipId: string; trackId: string; start: number; group?: string }
  | { type: "clip/trim"; clipId: string; edge: "start" | "end"; time: number; group?: string }
  | { type: "clip/split"; at?: number; clipIds?: string[] }
  | { type: "clip/delete"; clipIds?: string[]; ripple?: boolean }
  | { type: "clip/duplicate"; clipIds?: string[] }
  | { type: "clip/setTransition"; clipId: string; transition: Transition | null; group?: string }
  /** Move several clips together by `delta` seconds from their drag-start `origins` (multi-select drag) */
  | { type: "clips/shift"; origins: { clipId: string; start: number }[]; delta: number; group?: string }
  /**
   * Paste copied clips at `at` (+ each item's offset). Each lands on `trackId` / the focused track when it can hold
   * it, else the first compatible track (a new one if none). Missing assets (pasting across projects) are added.
   */
  | { type: "clip/paste"; items: ClipboardItem[]; at: number; trackId?: string; assets?: Asset[] }
  /** Move a video clip's sound to its own audio clip (audio/detach.ts); selects the new audio clip */
  | { type: "clip/detachAudio"; clipId: string }
  | { type: "track/add"; kind: TrackKind; name?: string; index?: number }
  | { type: "track/remove"; trackId: string }
  | { type: "track/rename"; trackId: string; name: string }
  | { type: "track/set"; trackId: string; patch: Partial<Pick<Track, "muted" | "hidden" | "locked" | "solo">> }
  | { type: "track/move"; trackId: string; index: number };

/** One copied clip: its data, the kind of track it came from, and its start relative to the earliest copied clip */
export interface ClipboardItem {
  clip: Clip;
  trackKind: TrackKind;
  offset: number;
}

export type StudioAction =
  | EditAction
  /** Load a project. Clears history unless keepHistory (then it is one undoable step). */
  | { type: "project/replace"; project: Project; keepHistory?: boolean }
  /** Asset metadata learned after load (duration, size). Applied to history snapshots too, never its own undo step. */
  | { type: "assets/update"; assetId: string; patch: Partial<Omit<Asset, "id">> }
  | { type: "history/undo" }
  | { type: "history/redo" }
  | { type: "history/endGroup" }
  | { type: "select"; clipIds: string[]; mode?: "replace" | "add" | "toggle" }
  | { type: "select/all" }
  | { type: "select/track"; trackId: string | null }
  | { type: "seek"; time: number }
  /** Frame step (frames) or jump (seconds), relative to the playhead */
  | { type: "step"; frames?: number; seconds?: number }
  | { type: "seek/edge"; edge: "start" | "end" }
  /** Jump to the previous/next clip edge */
  | { type: "seek/edit"; dir: 1 | -1 }
  | { type: "zoom"; pxPerSecond: number }
  | { type: "snapping"; on: boolean };

export const ZOOM_MIN = 2;
export const ZOOM_MAX = 400;
export const ZOOM_DEFAULT = 40;
const HISTORY_LIMIT = 200;

export function initStudio(project: Project, view: Partial<Pick<StudioState, "zoom" | "snapping" | "playhead">> = {}): StudioState {
  return {
    project, selection: [], selectedTrackId: null,
    playhead: view.playhead ?? 0, zoom: view.zoom ?? ZOOM_DEFAULT, snapping: view.snapping ?? true,
    past: [], future: [], group: null, revision: 0, seq: 0,
    salt: Math.random().toString(36).slice(2, 6),
  };
}

const TRACK_NAMES: Record<TrackKind, string> = { video: "Video", overlay: "Overlay", text: "Text", caption: "Captions", audio: "Audio" };
const KIND_FOR_CLIP: Record<Clip["type"], TrackKind> = { media: "video", text: "text", caption: "caption", audio: "audio" };

function allClipIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const t of p.tracks) for (const c of t.clips) ids.add(c.id);
  return ids;
}

/** Apply a new project as one undo step (or merged into the open group) */
function commit(state: StudioState, project: Project, group: string | undefined, extra: Partial<StudioState> = {}): StudioState {
  if (project === state.project) {
    // Nothing changed: still honour selection changes etc., never push history
    return Object.keys(extra).length ? { ...state, ...extra } : state;
  }
  const merging = group !== undefined && state.group === group;
  const past = merging ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT);
  const ids = allClipIds(project);
  const selection = (extra.selection ?? state.selection).filter((id) => ids.has(id));
  const selectedTrackId = extra.selectedTrackId !== undefined ? extra.selectedTrackId : state.selectedTrackId;
  return {
    ...state, ...extra, project, past, future: [], group: group ?? null, revision: state.revision + 1, selection,
    selectedTrackId: selectedTrackId && project.tracks.some((t) => t.id === selectedTrackId) ? selectedTrackId : null,
  };
}

function withIds(state: StudioState, prefix: string) {
  let seq = state.seq;
  const make = () => `${prefix}-${state.salt}${(++seq).toString(36)}`;
  return { make, seq: () => seq };
}

function targets(state: StudioState, ids?: string[]): string[] {
  return ids ?? state.selection;
}

function editReducer(state: StudioState, action: EditAction): StudioState {
  const p = state.project;
  switch (action.type) {
    case "project/set": {
      const { captionStyle, ...rest } = action.patch;
      const changed = (Object.keys(rest) as (keyof typeof rest)[]).some((k) => p[k] !== rest[k]) ||
        (!!captionStyle && (Object.keys(captionStyle) as (keyof CaptionStyle)[]).some((k) => p.captionStyle[k] !== captionStyle[k]));
      if (!changed) return state;
      return commit(state, { ...p, ...rest, captionStyle: captionStyle ? { ...p.captionStyle, ...captionStyle } : p.captionStyle }, action.group);
    }

    case "project/edit": {
      const next = action.edit(p);
      return commit(state, next === p ? p : { ...next, tracks: next.tracks.map((t) => (p.tracks.includes(t) ? t : ops.setClips(t, t.clips))) }, action.group, action.select ? { selection: action.select } : {});
    }

    case "assets/add": {
      const known = new Set(p.assets.map((a) => a.id));
      const fresh = action.assets.filter((a) => !known.has(a.id));
      return fresh.length ? commit(state, { ...p, assets: [...p.assets, ...fresh] }, undefined) : state;
    }

    case "assets/remove": {
      const used = p.tracks.flatMap((t) => t.clips.filter((c) => (c.type === "media" || c.type === "audio") && c.assetId === action.assetId).map((c) => c.id));
      // Removing an asset removes its clips, even on locked tracks (the clip can no longer render)
      const tracks = p.tracks.map((t) => (t.clips.some((c) => used.includes(c.id)) ? ops.setClips(t, t.clips.filter((c) => !used.includes(c.id))) : t));
      return commit(state, { ...p, tracks, assets: p.assets.filter((a) => a.id !== action.assetId) }, undefined);
    }

    case "clip/addFromAsset": {
      const asset = p.assets.find((a) => a.id === action.assetId);
      if (!asset) return state;
      const kinds = ops.kindsForAsset(asset);
      let project = p;
      let track = action.trackId ? ops.findTrack(p, action.trackId) : p.tracks.find((t) => t.kind === kinds[0] && !t.locked);
      if (track && (!kinds.includes(track.kind) || track.locked)) return state;
      let seq = state.seq;
      if (!track) {
        track = { id: `trk-${state.salt}${(++seq).toString(36)}`, kind: kinds[0], name: TRACK_NAMES[kinds[0]], muted: false, hidden: false, locked: false, clips: [] };
        project = { ...project, tracks: insertTrackAt(project.tracks, track) };
      }
      const start = action.start ?? ops.trackEnd(track);
      const id = `clip-${state.salt}${(++seq).toString(36)}`;
      const clip = track.kind === "audio" ? ops.makeAudioClip(id, asset, start) : ops.makeMediaClip(id, asset, start, track.kind);
      const next = ops.insertClip(project, track.id, clip);
      if (next === project) return state;
      return commit({ ...state, seq }, next, undefined, action.select === false ? {} : { selection: [id] });
    }

    case "clip/add": {
      const { clip } = action;
      const select = action.select === false ? {} : { selection: [clip.id] };
      if (action.trackId) return commit(state, ops.insertClip(p, action.trackId, clip), undefined, select);
      const fits = (t: Track) => !t.locked && (action.kind ? t.kind === action.kind : ops.canHost(t.kind, clip)) && ops.canHost(t.kind, clip);
      const room = p.tracks.find((t) => fits(t) && ops.freeStart(t.clips, clip.duration, clip.start) === ops.round(Math.max(0, clip.start)));
      if (room) return commit(state, ops.insertClip(p, room.id, clip), undefined, select);
      const kind = action.kind ?? KIND_FOR_CLIP[clip.type];
      if (!ops.canHost(kind, clip)) return state;
      const seq = state.seq + 1;
      const count = p.tracks.filter((t) => t.kind === kind).length;
      const track: Track = { id: `trk-${state.salt}${seq.toString(36)}`, kind, name: count ? `${TRACK_NAMES[kind]} ${count + 1}` : TRACK_NAMES[kind], muted: false, hidden: false, locked: false, clips: [] };
      const withTrack = { ...p, tracks: insertTrackAt(p.tracks, track) };
      return commit({ ...state, seq }, ops.insertClip(withTrack, track.id, clip), undefined, select);
    }

    case "captions/replace": {
      const track = action.trackId ? ops.findTrack(p, action.trackId) : p.tracks.find((t) => t.kind === "caption");
      if (!track) {
        const seq = state.seq + 1;
        const fresh: Track = { id: `trk-${state.salt}${seq.toString(36)}`, kind: "caption", name: TRACK_NAMES.caption, muted: false, hidden: false, locked: false, clips: action.clips };
        return commit({ ...state, seq }, { ...p, tracks: insertTrackAt(p.tracks, ops.setClips(fresh, action.clips)) }, undefined);
      }
      if (track.kind !== "caption" || track.locked) return state;
      return commit(state, ops.mapTrack(p, track.id, (t) => ops.setClips(t, action.clips)), undefined);
    }

    case "clip/update":
      return commit(state, ops.updateClip(p, action.clipId, action.patch), action.group);

    case "clip/move":
      return commit(state, ops.moveClip(p, action.clipId, action.trackId, action.start), action.group);

    case "clip/trim":
      return commit(state, ops.trimClip(p, action.clipId, action.edge, action.time), action.group);

    case "clip/split": {
      const at = action.at ?? state.playhead;
      const scope = action.clipIds ?? (state.selection.length ? state.selection : undefined);
      let ids = ops.clipsUnder(p, at, scope);
      // Selected clips that aren't under the playhead: fall back to every clip under it
      if (!ids.length && scope && !action.clipIds) ids = ops.clipsUnder(p, at);
      if (!ids.length) return state;
      const gen = withIds(state, "clip");
      let next = p;
      const rights: string[] = [];
      for (const id of ids) {
        const rightId = gen.make();
        const before = next;
        next = ops.splitClip(next, id, at, rightId);
        if (next !== before) rights.push(rightId);
      }
      // Clipchamp-style: the part after the cut stays selected so S then Del removes the tail
      return commit({ ...state, seq: gen.seq() }, next, undefined, { selection: state.selection.length ? rights : [] });
    }

    case "clip/delete": {
      const ids = targets(state, action.clipIds);
      if (!ids.length) return state;
      return commit(state, ops.deleteClips(p, ids, action.ripple), undefined, { selection: state.selection.filter((id) => !ids.includes(id)) });
    }

    case "clip/duplicate": {
      const ids = targets(state, action.clipIds);
      if (!ids.length) return state;
      const gen = withIds(state, "clip");
      const { project, ids: copies } = ops.duplicateClips(p, ids, gen.make);
      return commit({ ...state, seq: gen.seq() }, project, undefined, { selection: copies });
    }

    case "clip/setTransition":
      return commit(state, ops.setTransition(p, action.clipId, action.transition), action.group);

    case "clips/shift":
      return commit(state, ops.shiftClips(p, action.origins, action.delta), action.group);

    case "clip/paste": {
      if (!action.items.length) return state;
      let project = p;
      const known = new Set(p.assets.map((a) => a.id));
      const extra = (action.assets ?? []).filter((a) => !known.has(a.id));
      if (extra.length) project = { ...project, assets: [...project.assets, ...extra] };
      let seq = state.seq;
      const pasted: string[] = [];
      const preferred = action.trackId ?? state.selectedTrackId;
      for (const item of action.items) {
        const id = `clip-${state.salt}${(++seq).toString(36)}`;
        const clip = { ...item.clip, id, start: ops.round(Math.max(0, action.at + item.offset)) } as Clip;
        const usable = (t: Track | null | undefined): t is Track => !!t && !t.locked && ops.canHost(t.kind, clip);
        let track: Track | undefined = [preferred ? ops.findTrack(project, preferred) : null].find(usable) ??
          project.tracks.find((t) => usable(t) && t.kind === item.trackKind) ?? project.tracks.find(usable);
        if (!track) {
          const kind = ops.canHost(item.trackKind, clip) ? item.trackKind : KIND_FOR_CLIP[clip.type];
          track = { id: `trk-${state.salt}${(++seq).toString(36)}`, kind, name: TRACK_NAMES[kind], muted: false, hidden: false, locked: false, clips: [] };
          project = { ...project, tracks: insertTrackAt(project.tracks, track) };
        }
        const before = project;
        project = ops.insertClip(project, track.id, clip);
        if (project !== before) pasted.push(id);
      }
      if (!pasted.length) return state;
      return commit({ ...state, seq }, project, undefined, { selection: pasted });
    }

    case "clip/detachAudio": {
      const ref = ops.findClip(p, action.clipId);
      if (!ref || ref.track.locked) return state;
      const seq = state.seq + 1;
      const id = `clip-${state.salt}${seq.toString(36)}`;
      const next = detachAudio(p, action.clipId, id);
      if (next === p) return state;
      return commit({ ...state, seq }, { ...next, tracks: next.tracks.map((t) => (p.tracks.includes(t) ? t : ops.setClips(t, t.clips))) }, undefined, { selection: [id] });
    }

    case "track/add": {
      const seq = state.seq + 1;
      const track: Track = { id: `trk-${state.salt}${seq.toString(36)}`, kind: action.kind, name: action.name ?? TRACK_NAMES[action.kind], muted: false, hidden: false, locked: false, clips: [] };
      const tracks = action.index === undefined ? insertTrackAt(p.tracks, track) : [...p.tracks.slice(0, action.index), track, ...p.tracks.slice(action.index)];
      return commit({ ...state, seq }, { ...p, tracks }, undefined, { selectedTrackId: track.id });
    }

    case "track/remove": {
      if (!p.tracks.some((t) => t.id === action.trackId)) return state;
      return commit(state, { ...p, tracks: p.tracks.filter((t) => t.id !== action.trackId) }, undefined);
    }

    case "track/rename": {
      const name = action.name.trim();
      if (!name) return state;
      return commit(state, ops.mapTrack(p, action.trackId, (t) => (t.name === name ? t : { ...t, name })), undefined);
    }

    case "track/set":
      return commit(state, ops.mapTrack(p, action.trackId, (t) => {
        const changed = (Object.keys(action.patch) as (keyof typeof action.patch)[]).some((k) => t[k] !== action.patch[k]);
        return changed ? { ...t, ...action.patch } : t;
      }), undefined);

    case "track/move": {
      const from = p.tracks.findIndex((t) => t.id === action.trackId);
      const to = Math.max(0, Math.min(p.tracks.length - 1, action.index));
      if (from < 0 || from === to) return state;
      const tracks = [...p.tracks];
      const [t] = tracks.splice(from, 1);
      tracks.splice(to, 0, t);
      return commit(state, { ...p, tracks }, undefined);
    }
  }
}

/** New visual tracks go just above the last track of the same kind; audio at the end */
function insertTrackAt(tracks: Track[], track: Track): Track[] {
  let at = tracks.length;
  for (let i = tracks.length - 1; i >= 0; i--) {
    if (tracks[i].kind === track.kind) {
      at = i + 1;
      break;
    }
  }
  if (at === tracks.length && track.kind !== "audio") {
    // No track of this kind: put visual tracks below the first audio/caption track so they draw under captions
    const firstNonVisual = tracks.findIndex((t) => t.kind === "audio" || t.kind === "caption");
    if (firstNonVisual >= 0 && track.kind !== "caption") at = firstNonVisual;
  }
  return [...tracks.slice(0, at), track, ...tracks.slice(at)];
}

const frameOf = (state: StudioState) => 1 / state.project.fps;

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "project/replace":
      if (action.keepHistory) return commit(state, action.project, undefined, { selection: [] });
      return { ...state, project: action.project, past: [], future: [], group: null, selection: [], selectedTrackId: null, revision: state.revision + 1, playhead: Math.min(state.playhead, projectDuration(action.project)) };

    case "assets/update": {
      const patchAssets = (p: Project): Project => (p.assets.some((a) => a.id === action.assetId) ? { ...p, assets: p.assets.map((a) => (a.id === action.assetId ? { ...a, ...action.patch } : a)) } : p);
      return { ...state, project: patchAssets(state.project), past: state.past.map(patchAssets), future: state.future.map(patchAssets), revision: state.revision + 1 };
    }

    case "history/undo": {
      if (!state.past.length) return state;
      const project = state.past[state.past.length - 1];
      const ids = allClipIds(project);
      return { ...state, project, past: state.past.slice(0, -1), future: [state.project, ...state.future], group: null, revision: state.revision + 1, selection: state.selection.filter((id) => ids.has(id)) };
    }

    case "history/redo": {
      if (!state.future.length) return state;
      const [project, ...future] = state.future;
      const ids = allClipIds(project);
      return { ...state, project, past: [...state.past, state.project], future, group: null, revision: state.revision + 1, selection: state.selection.filter((id) => ids.has(id)) };
    }

    case "history/endGroup":
      return state.group === null ? state : { ...state, group: null };

    case "select": {
      const { clipIds, mode = "replace" } = action;
      let selection: string[];
      if (mode === "replace") selection = clipIds;
      else if (mode === "add") selection = [...state.selection, ...clipIds.filter((id) => !state.selection.includes(id))];
      else {
        selection = state.selection.filter((id) => !clipIds.includes(id));
        for (const id of clipIds) if (!state.selection.includes(id)) selection.push(id);
      }
      if (selection.length === state.selection.length && selection.every((id, i) => id === state.selection[i])) return state;
      return { ...state, selection, group: null };
    }

    case "select/all": {
      const selection = state.project.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.map((c) => c.id));
      return { ...state, selection };
    }

    case "select/track":
      return state.selectedTrackId === action.trackId ? state : { ...state, selectedTrackId: action.trackId };

    case "seek": {
      const time = Math.max(0, Number.isFinite(action.time) ? action.time : 0);
      return time === state.playhead ? state : { ...state, playhead: time };
    }

    case "step": {
      const f = frameOf(state);
      let time = state.playhead + (action.seconds ?? 0) + (action.frames ?? 0) * f;
      // Land on a frame boundary so exported frames match what was shown
      time = Math.max(0, Math.round(time / f) * f);
      return studioReducer(state, { type: "seek", time: ops.round(time) });
    }

    case "seek/edge":
      return studioReducer(state, { type: "seek", time: action.edge === "start" ? 0 : projectDuration(state.project) });

    case "seek/edit": {
      const points = ops.editPoints(state.project);
      const t = state.playhead;
      const target = action.dir > 0 ? points.find((x) => x > t + 1e-3) : [...points].reverse().find((x) => x < t - 1e-3);
      return target === undefined ? state : studioReducer(state, { type: "seek", time: target });
    }

    case "zoom": {
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, action.pxPerSecond));
      return zoom === state.zoom ? state : { ...state, zoom };
    }

    case "snapping":
      return state.snapping === action.on ? state : { ...state, snapping: action.on };

    default:
      return editReducer(state, action);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// External store + React bindings

export interface StudioStore {
  getState: () => StudioState;
  dispatch: (action: StudioAction) => void;
  subscribe: (listener: () => void) => () => void;
}

/** Edits sharing a group key merge into one undo step while they keep coming within this window */
export const GROUP_IDLE_MS = 900;
/** Group keys with this prefix stay open until history/endGroup (pointer drags), whatever the pauses */
export const GESTURE = "gesture:";

export function createStudioStore(project: Project, view?: Parameters<typeof initStudio>[1]): StudioStore {
  let state = initStudio(project, view);
  let groupAt = 0;
  const listeners = new Set<() => void>();
  const apply = (action: StudioAction) => {
    const next = studioReducer(state, action);
    if (next === state) return false;
    state = next;
    return true;
  };
  return {
    getState: () => state,
    dispatch: (action) => {
      let changed = false;
      const group = "group" in action ? action.group : undefined;
      if (group !== undefined) {
        const now = Date.now();
        // A slider nudged again after a pause is a new undo step
        if (state.group === group && !group.startsWith(GESTURE) && now - groupAt > GROUP_IDLE_MS) changed = apply({ type: "history/endGroup" });
        groupAt = now;
      }
      changed = apply(action) || changed;
      if (changed) listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const StudioContext = createContext<StudioStore | null>(null);

/** Create the store once for a component tree (pass it to <StudioProvider>). `project` is read on first render only. */
export function useCreateStudio(project: Project | (() => Project)): StudioStore {
  const [store] = useState(() => createStudioStore(typeof project === "function" ? project() : project));
  return store;
}

export function StudioProvider({ store, children }: { store: StudioStore; children: ReactNode }) {
  return createElement(StudioContext.Provider, { value: store }, children);
}

export function useStudioStore(): StudioStore {
  const store = useContext(StudioContext);
  if (!store) throw new Error("useStudio must be used inside <StudioProvider>");
  return store;
}

export function useStudioDispatch(): StudioStore["dispatch"] {
  return useStudioStore().dispatch;
}

const identity = (s: StudioState) => s;

/**
 * Read studio state. With a selector, re-renders only when the selected value changes (by `equal`, default
 * Object.is). Selectors must return existing objects or primitives, or pass an `equal` such as shallowEqual.
 *   const playhead = useStudio((s) => s.playhead);
 *   const { project, dispatch } = ... // or useStudio() for everything
 */
export function useStudio(): StudioState;
export function useStudio<T>(selector: (s: StudioState) => T, equal?: (a: T, b: T) => boolean): T;
export function useStudio<T>(selector: (s: StudioState) => T = identity as (s: StudioState) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const store = useStudioStore();
  const cache = useRef<{ state: StudioState; selector: (s: StudioState) => T; value: T } | null>(null);
  const read = useCallback(() => {
    const state = store.getState();
    const hit = cache.current;
    if (hit && hit.state === state && hit.selector === selector) return hit.value;
    const value = selector(state);
    if (hit && equal(hit.value, value)) {
      cache.current = { state, selector, value: hit.value };
      return hit.value;
    }
    cache.current = { state, selector, value };
    return value;
  }, [store, selector, equal]);
  return useSyncExternalStore(store.subscribe, read, read);
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Convenience: history flags for undo/redo buttons */
export function useHistoryFlags(): { canUndo: boolean; canRedo: boolean } {
  return useStudio(historyFlags, shallowEqual);
}
const historyFlags = (s: StudioState) => ({ canUndo: s.past.length > 0, canRedo: s.future.length > 0 });

/** Selected clips (resolved), or empty */
export function selectedClips(s: StudioState): Clip[] {
  if (!s.selection.length) return [];
  const out: Clip[] = [];
  for (const t of s.project.tracks) for (const c of t.clips) if (s.selection.includes(c.id)) out.push(c);
  return out;
}

export { newId };
