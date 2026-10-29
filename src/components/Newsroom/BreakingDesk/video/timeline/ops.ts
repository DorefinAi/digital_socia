// Pure timeline operations on the shared Project model (video/model.ts). No React, no DOM: the reducer in
// video/store.ts calls these, and timeline/__checks__ runs them under plain node.

import {
  DEFAULT_FILTERS, DEFAULT_TEXT, FULL_FRAME, NO_CROP,
  type Asset, type AudioClip, type Box, type CaptionClip, type Clip, type MediaClip, type Project, type TextClip,
  type TextStyle, type Track, type TrackKind, type Transition,
} from "../model";

/** Shortest clip the editor allows, seconds */
export const MIN_CLIP = 0.1;
/** Shortest transition, seconds */
export const MIN_TRANSITION = 0.1;
/** Default length of a still image, text or caption dropped on the timeline */
export const DEFAULT_STILL = 5;
const EPS = 1e-6;
/** Overlaps smaller than this are treated as touching (not a transition) */
const TOUCH = 0.02;

export const clipEnd = (c: Clip) => c.start + c.duration;

// ---------------------------------------------------------------------------------------------------------------
// Lookup

export interface ClipRef {
  track: Track;
  trackIndex: number;
  clip: Clip;
  /** Index inside track.clips (sorted by start) */
  index: number;
}

export function findClip(p: Project, clipId: string): ClipRef | null {
  for (let ti = 0; ti < p.tracks.length; ti++) {
    const track = p.tracks[ti];
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index >= 0) return { track, trackIndex: ti, clip: track.clips[index], index };
  }
  return null;
}

export function findTrack(p: Project, trackId: string): Track | null {
  return p.tracks.find((t) => t.id === trackId) ?? null;
}

export function assetOf(p: Project, clip: Clip): Asset | null {
  if (clip.type !== "media" && clip.type !== "audio") return null;
  return p.assets.find((a) => a.id === clip.assetId) ?? null;
}

/** Which track kinds can hold a clip. Media on video/overlay, text on text, captions on caption, audio on audio. */
export function canHost(kind: TrackKind, clip: Pick<Clip, "type">): boolean {
  switch (clip.type) {
    case "media": return kind === "video" || kind === "overlay";
    case "text": return kind === "text";
    case "caption": return kind === "caption";
    case "audio": return kind === "audio";
  }
}

/** Track kinds that can take an asset dropped from the bin (a video's sound can go on an audio track too) */
export function kindsForAsset(asset: Pick<Asset, "kind">): TrackKind[] {
  if (asset.kind === "audio") return ["audio"];
  if (asset.kind === "image") return ["video", "overlay"];
  return ["video", "overlay", "audio"];
}

// ---------------------------------------------------------------------------------------------------------------
// Structural helpers (immutable)

export function mapTrack(p: Project, trackId: string, fn: (t: Track) => Track): Project {
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (t.id !== trackId) return t;
    const next = fn(t);
    if (next !== t) changed = true;
    return next;
  });
  return changed ? { ...p, tracks } : p;
}

export function setClips(track: Track, clips: Clip[]): Track {
  return { ...track, clips: normalizeClips(clips) };
}

/**
 * Keeps a track's invariant: clips sorted by start, and a transitionIn exists only where the clip overlaps the
 * previous clip; its duration always equals that overlap (so trimming a transition shrinks it, separating removes it).
 */
export function normalizeClips(clips: Clip[]): Clip[] {
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    if (!c.transitionIn) continue;
    const prev = sorted[i - 1];
    const overlap = prev ? clipEnd(prev) - c.start : 0;
    if (overlap < MIN_TRANSITION - EPS) {
      const { transitionIn: _drop, ...rest } = c;
      void _drop;
      sorted[i] = rest as Clip;
    } else if (Math.abs(overlap - c.transitionIn.duration) > EPS) {
      sorted[i] = { ...c, transitionIn: { ...c.transitionIn, duration: round(overlap) } };
    }
  }
  return sorted;
}

/** Rounds to 1/1000 s so float noise does not pile up across many edits */
export const round = (t: number) => Math.round(t * 1000) / 1000 || 0;

// ---------------------------------------------------------------------------------------------------------------
// Placement

/** Occupied intervals on a track (merged), optionally ignoring some clips */
function occupied(clips: Clip[], exclude: ReadonlySet<string>): [number, number][] {
  const spans = clips.filter((c) => !exclude.has(c.id)).map((c) => [c.start, clipEnd(c)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1] + EPS) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

/**
 * Nearest start to `desired` where a clip of `duration` fits on the track without overlapping anything.
 * The space after the last clip is unbounded, so there is always an answer.
 */
export function freeStart(clips: Clip[], duration: number, desired: number, exclude: ReadonlySet<string> = new Set()): number {
  const spans = occupied(clips, exclude);
  const want = Math.max(0, desired);
  let best = Infinity;
  let bestDist = Infinity;
  let gapStart = 0;
  for (let i = 0; i <= spans.length; i++) {
    const gapEnd = i < spans.length ? spans[i][0] : Infinity;
    if (gapEnd - gapStart >= duration - EPS) {
      const pos = Math.min(Math.max(want, gapStart), gapEnd - duration);
      const dist = Math.abs(pos - want);
      if (dist < bestDist - EPS) {
        best = pos;
        bestDist = dist;
      }
    }
    if (i < spans.length) gapStart = Math.max(gapStart, spans[i][1]);
  }
  return round(Math.max(0, best));
}

export function trackEnd(track: Track): number {
  let end = 0;
  for (const c of track.clips) end = Math.max(end, clipEnd(c));
  return end;
}

// ---------------------------------------------------------------------------------------------------------------
// Clip factories

export function defaultBox(kind: TrackKind): Box {
  return kind === "overlay" ? { x: 0.72, y: 0.28, w: 0.4, h: 0.4, rotation: 0 } : { ...FULL_FRAME };
}

export function makeMediaClip(id: string, asset: Asset, start: number, trackKind: TrackKind = "video"): MediaClip {
  return {
    id, type: "media", assetId: asset.id, start,
    duration: asset.kind === "video" && asset.duration > 0 ? asset.duration : DEFAULT_STILL,
    fadeIn: 0, fadeOut: 0, in: 0, speed: 1, volume: 1, audioDetached: false,
    box: defaultBox(trackKind), fit: "fit", crop: { ...NO_CROP }, flipH: false, flipV: false, filters: { ...DEFAULT_FILTERS },
  };
}

export function makeAudioClip(id: string, asset: Asset, start: number): AudioClip {
  return { id, type: "audio", assetId: asset.id, start, duration: asset.duration > 0 ? asset.duration : DEFAULT_STILL, fadeIn: 0, fadeOut: 0, in: 0, speed: 1, volume: 1 };
}

export function makeTextClip(id: string, text: string, start: number, duration = DEFAULT_STILL, style: Partial<TextStyle> = {}): TextClip {
  return { id, type: "text", text, start, duration, fadeIn: 0, fadeOut: 0, style: { ...DEFAULT_TEXT, ...style }, box: { x: 0.5, y: 0.8, w: 0.8, h: 0.16, rotation: 0 } };
}

export function makeCaptionClip(id: string, text: string, start: number, duration = 3): CaptionClip {
  return { id, type: "caption", text, start, duration, fadeIn: 0, fadeOut: 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Edit operations. Each returns the same Project object when nothing changed, so callers can skip history.

/** Longest a media/audio clip can run from its in-point, in timeline seconds (Infinity for stills/text) */
export function sourceLimit(p: Project, clip: Clip): number {
  const asset = assetOf(p, clip);
  if (!asset || asset.kind === "image" || !(asset.duration > 0)) return Infinity;
  const c = clip as MediaClip | AudioClip;
  return Math.max(0, (asset.duration - c.in) / c.speed);
}

/** Add a clip to a track at the nearest free spot to its start */
export function insertClip(p: Project, trackId: string, clip: Clip): Project {
  const track = findTrack(p, trackId);
  if (!track || track.locked || !canHost(track.kind, clip)) return p;
  const start = freeStart(track.clips, clip.duration, clip.start);
  const placed = { ...clip, start } as Clip;
  delete placed.transitionIn;
  return mapTrack(p, trackId, (t) => setClips(t, [...t.clips, placed]));
}

/** Move a clip to `start` on `trackId` (same or another compatible track); lands on the nearest free spot */
export function moveClip(p: Project, clipId: string, trackId: string, start: number): Project {
  const ref = findClip(p, clipId);
  const target = findTrack(p, trackId);
  if (!ref || !target || ref.track.locked || target.locked || !canHost(target.kind, ref.clip)) return p;
  const exclude = new Set([clipId]);
  const pos = freeStart(target.clips, ref.clip.duration, start, exclude);
  if (target.id === ref.track.id && Math.abs(pos - ref.clip.start) < EPS) return p;
  const moved = { ...ref.clip, start: pos } as Clip;
  delete moved.transitionIn;
  if (target.id === ref.track.id) {
    return mapTrack(p, trackId, (t) => setClips(t, t.clips.map((c) => (c.id === clipId ? moved : c))));
  }
  let next = mapTrack(p, ref.track.id, (t) => setClips(t, t.clips.filter((c) => c.id !== clipId)));
  // A media clip moved between video and overlay tracks keeps its box; nothing else changes kind
  next = mapTrack(next, trackId, (t) => setClips(t, [...t.clips, moved]));
  return next;
}

/** Drag one edge of a clip to timeline time `time`. Start edge moves the in-point too (frame stays put). */
export function trimClip(p: Project, clipId: string, edge: "start" | "end", time: number): Project {
  const ref = findClip(p, clipId);
  if (!ref || ref.track.locked) return p;
  const { clip, track, index } = ref;
  const prev = track.clips[index - 1];
  const next = track.clips[index + 1];
  const end = clipEnd(clip);
  const speed = clip.type === "media" || clip.type === "audio" ? clip.speed : 1;

  if (edge === "start") {
    const overlapPrev = clip.transitionIn && prev ? clipEnd(prev) - clip.start : 0;
    let lower = prev ? clipEnd(prev) - overlapPrev : 0;
    if (clip.type === "media" || clip.type === "audio") {
      const asset = assetOf(p, clip);
      if (asset && asset.kind !== "image") lower = Math.max(lower, clip.start - clip.in / speed);
    }
    const upper = end - MIN_CLIP;
    const t = round(Math.min(upper, Math.max(lower, time)));
    if (Math.abs(t - clip.start) < EPS) return p;
    const delta = t - clip.start;
    const updated = { ...clip, start: t, duration: round(end - t) } as Clip;
    if (updated.type === "media" || updated.type === "audio") updated.in = round(Math.max(0, updated.in + delta * speed));
    updated.fadeIn = Math.min(updated.fadeIn, updated.duration);
    updated.fadeOut = Math.min(updated.fadeOut, updated.duration);
    return mapTrack(p, track.id, (tr) => setClips(tr, tr.clips.map((c) => (c.id === clipId ? updated : c))));
  }

  const overlapNext = next?.transitionIn ? end - next.start : 0;
  let upper = next ? next.start + Math.max(0, overlapNext) : Infinity;
  upper = Math.min(upper, clip.start + sourceLimit(p, clip));
  const lower = clip.start + MIN_CLIP;
  const t = round(Math.max(lower, Math.min(upper, time)));
  if (Math.abs(t - end) < EPS) return p;
  const duration = round(t - clip.start);
  const updated = { ...clip, duration, fadeIn: Math.min(clip.fadeIn, duration), fadeOut: Math.min(clip.fadeOut, duration) } as Clip;
  return mapTrack(p, track.id, (tr) => setClips(tr, tr.clips.map((c) => (c.id === clipId ? updated : c))));
}

/** Split a clip at timeline time `at`; the right part gets `newId`. No-op unless `at` is inside by MIN_CLIP. */
export function splitClip(p: Project, clipId: string, at: number, newId: string): Project {
  const ref = findClip(p, clipId);
  if (!ref || ref.track.locked) return p;
  const { clip, track } = ref;
  if (at <= clip.start + MIN_CLIP - EPS || at >= clipEnd(clip) - MIN_CLIP + EPS) return p;
  const t = round(at);
  const leftDur = round(t - clip.start);
  const left = { ...clip, duration: leftDur, fadeOut: 0, fadeIn: Math.min(clip.fadeIn, leftDur) } as Clip;
  const rightDur = round(clipEnd(clip) - t);
  const right = { ...clip, id: newId, start: t, duration: rightDur, fadeIn: 0, fadeOut: Math.min(clip.fadeOut, rightDur) } as Clip;
  delete right.transitionIn;
  if (right.type === "media" || right.type === "audio") right.in = round(right.in + leftDur * right.speed);
  return mapTrack(p, track.id, (tr) => setClips(tr, tr.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c]))));
}

/** Remove clips. With ripple, later clips on the same track slide left to close the gap. */
export function deleteClips(p: Project, clipIds: readonly string[], ripple = false): Project {
  let next = p;
  // Ripple one at a time from the right so earlier shifts don't disturb later lookups
  const refs = clipIds.map((id) => findClip(p, id)).filter((r): r is ClipRef => !!r && !r.track.locked);
  refs.sort((a, b) => b.clip.start - a.clip.start);
  for (const { clip, track } of refs) {
    next = mapTrack(next, track.id, (t) => {
      const index = t.clips.findIndex((c) => c.id === clip.id);
      if (index < 0) return t;
      const rest = t.clips.filter((c) => c.id !== clip.id);
      if (!ripple) return setClips(t, rest);
      const prev = t.clips[index - 1];
      const after = t.clips[index + 1];
      if (!after) return setClips(t, rest);
      // The next clip takes the deleted clip's place; if both had transitions, it keeps overlapping the previous one
      const target = after.transitionIn && prev && clip.transitionIn ? clipEnd(prev) - after.transitionIn.duration : clip.start;
      const shift = Math.max(0, after.start - target);
      return setClips(t, rest.map((c, i) => (i >= index ? ({ ...c, start: round(c.start - shift) } as Clip) : c)));
    });
  }
  return next;
}

/** Copy clips; each copy lands right after its original (or the next free spot). Returns the new project and copy ids. */
export function duplicateClips(p: Project, clipIds: readonly string[], makeId: () => string): { project: Project; ids: string[] } {
  let next = p;
  const ids: string[] = [];
  for (const id of clipIds) {
    const ref = findClip(next, id);
    if (!ref || ref.track.locked) continue;
    const copy = { ...ref.clip, id: makeId(), start: clipEnd(ref.clip) } as Clip;
    const before = next;
    next = insertClip(next, ref.track.id, copy);
    if (next !== before) ids.push(copy.id);
  }
  return { project: next, ids };
}

/**
 * Set, change or remove the transition into a clip. A transition is an overlap with the previous clip on the same
 * track, so this slides the clip (and everything after it on the track) left or right by the change in overlap.
 * Only on video/overlay tracks, and only where the clip touches or already overlaps the previous one.
 */
export function setTransition(p: Project, clipId: string, transition: Transition | null): Project {
  const ref = findClip(p, clipId);
  if (!ref || ref.track.locked || (ref.track.kind !== "video" && ref.track.kind !== "overlay")) return p;
  const { clip, track, index } = ref;
  const prev = track.clips[index - 1];
  if (!prev) return p;
  const prevEnd = clipEnd(prev);
  if (!transition && !clip.transitionIn) return p;
  if (!clip.transitionIn && Math.abs(clip.start - prevEnd) > TOUCH) return p;
  const following = track.clips[index + 1];
  const followingOverlap = following?.transitionIn ? clipEnd(clip) - following.start : 0;

  let duration = 0;
  if (transition) {
    const max = Math.min(prev.duration - (prev.transitionIn?.duration ?? 0), clip.duration - followingOverlap) - MIN_CLIP / 2;
    if (max < MIN_TRANSITION) return p;
    duration = round(Math.min(max, Math.max(MIN_TRANSITION, transition.duration)));
  }
  const start = round(prevEnd - duration);
  const sameType = clip.transitionIn?.type === transition?.type;
  if (Math.abs(start - clip.start) < EPS && sameType && Math.abs((clip.transitionIn?.duration ?? 0) - duration) < EPS) return p;

  const delta = start - clip.start;
  return mapTrack(p, track.id, (t) =>
    setClips(t, t.clips.map((c, i) => {
      if (i < index) return c;
      if (i === index) {
        const moved = { ...c, start } as Clip;
        if (transition) moved.transitionIn = { type: transition.type, duration };
        else delete moved.transitionIn;
        return moved;
      }
      return { ...c, start: round(c.start + delta) } as Clip;
    })),
  );
}

/** Points where the playhead can be split: clips under `at` on unlocked tracks, or only the given ids */
export function clipsUnder(p: Project, at: number, onlyIds?: readonly string[]): string[] {
  const ids: string[] = [];
  for (const t of p.tracks) {
    if (t.locked) continue;
    for (const c of t.clips) {
      if (onlyIds && !onlyIds.includes(c.id)) continue;
      if (at > c.start + MIN_CLIP - EPS && at < clipEnd(c) - MIN_CLIP + EPS) ids.push(c.id);
    }
  }
  return ids;
}

/** Every clip edge on the timeline, sorted and de-duplicated (for jump-to-next-edit and snapping) */
export function editPoints(p: Project, exclude: ReadonlySet<string> = new Set()): number[] {
  const set = new Set<number>([0]);
  for (const t of p.tracks) for (const c of t.clips) {
    if (exclude.has(c.id)) continue;
    set.add(round(c.start));
    set.add(round(clipEnd(c)));
  }
  return [...set].sort((a, b) => a - b);
}

/** Apply a generic patch to a clip, keeping track invariants (start/duration changes go through move/trim) */
export function updateClip(p: Project, clipId: string, patch: Partial<Clip>): Project {
  const ref = findClip(p, clipId);
  if (!ref || ref.track.locked) return p;
  const { start, duration, ...rest } = patch as Partial<Clip> & Record<string, unknown>;
  delete (rest as Record<string, unknown>).id;
  delete (rest as Record<string, unknown>).type;
  let clip = ref.clip;
  let changed = false;
  for (const key of Object.keys(rest)) {
    if ((clip as unknown as Record<string, unknown>)[key] !== (rest as Record<string, unknown>)[key]) {
      changed = true;
      break;
    }
  }
  let next = p;
  if (changed) {
    clip = { ...clip, ...rest } as Clip;
    // Speed change keeps the same source span, so the timeline length scales
    if ((clip.type === "media" || clip.type === "audio") && "speed" in rest && duration === undefined) {
      const old = (ref.clip as MediaClip | AudioClip).speed;
      const speed = Math.min(4, Math.max(0.25, clip.speed));
      clip = { ...clip, speed } as Clip;
      const scaled = round((ref.clip.duration * old) / speed);
      const nextClip = ref.track.clips[ref.index + 1];
      const room = nextClip ? nextClip.start + (nextClip.transitionIn ? clipEnd(ref.clip) - nextClip.start : 0) - clip.start : Infinity;
      clip = { ...clip, duration: Math.max(MIN_CLIP, Math.min(scaled, room)) } as Clip;
    }
    clip = { ...clip, fadeIn: clamp(clip.fadeIn, 0, clip.duration), fadeOut: clamp(clip.fadeOut, 0, clip.duration) } as Clip;
    const updated = clip;
    next = mapTrack(p, ref.track.id, (t) => setClips(t, t.clips.map((c) => (c.id === clipId ? updated : c))));
  }
  if (typeof duration === "number") next = trimClip(next, clipId, "end", (start ?? clip.start) + duration);
  if (typeof start === "number") next = moveClip(next, clipId, ref.track.id, start);
  return next;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Move several clips by the same `delta` from their drag-start positions (`origins`), each staying on its track.
 * Stops at the furthest point toward `delta` where nothing collides with a clip that is not moving (and nothing
 * goes before 0). Transitions between clips that move together survive; ones with a clip left behind shrink/drop.
 */
export function shiftClips(p: Project, origins: readonly { clipId: string; start: number }[], delta: number): Project {
  const startOf = new Map(origins.map((o) => [o.clipId, o.start]));
  const lanes = p.tracks
    .filter((t) => !t.locked && t.clips.some((c) => startOf.has(c.id)))
    .map((t) => {
      const moving = t.clips.filter((c) => startOf.has(c.id));
      const still = t.clips.filter((c) => !startOf.has(c.id));
      // Overlap each moving clip already has with a still clip (a transition): allowed not to grow
      const base = moving.map((m) => still.map((o) => overlapOf(startOf.get(m.id)!, m.duration, o)));
      return { track: t, moving, still, base };
    });
  if (!lanes.length) return p;
  const valid = (d: number) =>
    lanes.every(({ moving, still, base }) =>
      moving.every((m, i) => {
        const s = startOf.get(m.id)! + d;
        if (s < -EPS) return false;
        return still.every((o, j) => overlapOf(s, m.duration, o) <= base[i][j] + EPS);
      }),
    );
  let d = delta;
  if (!valid(d)) {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (valid(delta * mid)) lo = mid;
      else hi = mid;
    }
    d = delta * lo;
  }
  let next = p;
  for (const { track } of lanes) {
    next = mapTrack(next, track.id, (t) => {
      let changed = false;
      const clips = t.clips.map((c) => {
        const o = startOf.get(c.id);
        if (o === undefined) return c;
        const start = round(o + d);
        if (Math.abs(start - c.start) < EPS) return c;
        changed = true;
        return { ...c, start } as Clip;
      });
      return changed ? setClips(t, clips) : t;
    });
  }
  return next;
}

function overlapOf(start: number, duration: number, o: Clip): number {
  return Math.max(0, Math.min(start + duration, clipEnd(o)) - Math.max(start, o.start));
}
