// Pure project edits for sound: "Detach audio" and a fresh AudioClip for an imported asset.
// They return a new Project and never mutate the input, so the timeline store can wrap them as undoable actions.

import { newId, type Asset, type AudioClip, type Clip, type MediaClip, type Project, type Track } from "../model";

function overlaps(track: Track, start: number, end: number): boolean {
  return track.clips.some((c) => c.start < end - 1e-6 && c.start + c.duration > start + 1e-6);
}

function insertSorted(clips: Clip[], clip: Clip): Clip[] {
  const next = [...clips, clip];
  next.sort((a, b) => a.start - b.start);
  return next;
}

/** First unlocked audio track that is empty over [start, end), or null */
export function freeAudioTrack(project: Project, start: number, end: number): Track | null {
  return project.tracks.find((t) => t.kind === "audio" && !t.locked && !overlaps(t, start, end)) ?? null;
}

function newAudioTrack(project: Project): Track {
  const n = project.tracks.filter((t) => t.kind === "audio").length + 1;
  return { id: newId("trk"), kind: "audio", name: `Audio ${n}`, muted: false, hidden: false, locked: false, clips: [] };
}

/** Put an AudioClip on the first free audio track, adding a new audio track at the bottom if none is free. */
export function placeAudioClip(project: Project, clip: AudioClip): Project {
  const end = clip.start + clip.duration;
  const free = freeAudioTrack(project, clip.start, end);
  if (free) {
    return { ...project, tracks: project.tracks.map((t) => (t.id === free.id ? { ...t, clips: insertSorted(t.clips, clip) } : t)) };
  }
  const track = newAudioTrack(project);
  return { ...project, tracks: [...project.tracks, { ...track, clips: [clip] }] };
}

/**
 * Move a video clip's sound to its own AudioClip, lined up with the picture (same start, length, in-point, speed,
 * volume and fades; a video transition's crossfade becomes an audio fade so the join still sounds smooth). The video
 * clip is marked audioDetached and plays silent. Returns the project unchanged if the clip is not a video clip with
 * sound or is already detached. `newClipId` lets the caller select the new clip.
 */
export function detachAudio(project: Project, clipId: string, newClipId: string = newId("clip")): Project {
  let media: MediaClip | null = null;
  let host: Track | null = null;
  for (const t of project.tracks) {
    const c = t.clips.find((x) => x.id === clipId);
    if (c) {
      if (c.type === "media") media = c;
      host = t;
      break;
    }
  }
  if (!media || !host || media.audioDetached) return project;
  const asset = project.assets.find((a) => a.id === media.assetId);
  if (!asset || asset.kind !== "video" || asset.hasAudio === false) return project;

  // The next clip's transition fades this clip's picture out; give the sound the same fade.
  const sorted = [...host.clips].sort((a, b) => a.start - b.start);
  const idx = sorted.findIndex((c) => c.id === clipId);
  const next = sorted[idx + 1];
  const end = media.start + media.duration;
  const outXfade = next?.transitionIn && next.start <= end + 1e-3 ? next.transitionIn.duration : 0;
  const inXfade = media.transitionIn?.duration ?? 0;

  const audio: AudioClip = {
    id: newClipId,
    type: "audio",
    assetId: media.assetId,
    start: media.start,
    duration: media.duration,
    in: media.in,
    speed: media.speed,
    volume: media.volume,
    fadeIn: Math.max(media.fadeIn, inXfade),
    fadeOut: Math.max(media.fadeOut, outXfade),
  };
  const detached: MediaClip = { ...media, audioDetached: true };
  const withFlag: Project = {
    ...project,
    tracks: project.tracks.map((t) => (t.id === host!.id ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? detached : c)) } : t)),
  };
  return placeAudioClip(withFlag, audio);
}

/** A new AudioClip for a music/voice asset at timeline time `start` (full length, original volume, no fades). */
export function audioClipFromAsset(asset: Asset, start: number, id: string = newId("clip")): AudioClip {
  return { id, type: "audio", assetId: asset.id, start: Math.max(0, start), duration: asset.duration, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 };
}
