// Which clips make sound, when, and how loud: a pure plan from the Project that both mixAudio (export) and the
// AudioEngine (preview) turn into Web Audio nodes with the same maths.

import type { AudioClip, Clip, MediaClip, Project, Track } from "../model";
import { clampVolume, clipEnvelope, type EnvPoint } from "./gain";

/** Track solo is not in model.ts v1; it is read as an optional `solo` flag so it works once the field is added. */
export function isSolo(track: Track): boolean {
  return (track as Track & { solo?: boolean }).solo === true;
}

/** Track ids whose sound is heard: not muted and, when any track is soloed, soloed. */
export function audibleTrackIds(project: Project): Set<string> {
  const anySolo = project.tracks.some(isSolo);
  const ids = new Set<string>();
  for (const t of project.tracks) if (!t.muted && (!anySolo || isSolo(t))) ids.add(t.id);
  return ids;
}

export interface VoicePlan {
  clipId: string;
  trackId: string;
  assetId: string;
  /** Timeline start and length, seconds */
  start: number;
  duration: number;
  /** Source in-point and speed (playbackRate) */
  in: number;
  speed: number;
  /** 0..2, applied on its own gain node so it can change live */
  volume: number;
  /** Fades and transition crossfades, 0..1, t from the clip start */
  envelope: EnvPoint[];
}

type SoundClip = MediaClip | AudioClip;

function canSound(clip: Clip, project: Project): clip is SoundClip {
  if (clip.type === "audio") return true;
  if (clip.type !== "media" || clip.audioDetached) return false;
  const asset = project.assets.find((a) => a.id === clip.assetId);
  return !!asset && asset.kind === "video" && asset.hasAudio !== false;
}

/** Transition crossfade lengths for each clip on a track (in = from its own transitionIn, out = from the next clip's). */
function crossfades(track: Track): Map<string, { xin: number; xout: number }> {
  const res = new Map<string, { xin: number; xout: number }>();
  const clips = [...track.clips].sort((a, b) => a.start - b.start);
  for (const c of clips) res.set(c.id, { xin: 0, xout: 0 });
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const d = c.transitionIn?.duration ?? 0;
    if (!(d > 0)) continue;
    res.get(c.id)!.xin = d;
    const prev = clips[i - 1];
    // The outgoing clip fades over the same span when it overlaps or touches the incoming one.
    if (prev && prev.start + prev.duration >= c.start - 1e-3) res.get(prev.id)!.xout = d;
  }
  return res;
}

/**
 * Every clip that can make sound. `includeMuted` keeps clips on muted/non-solo tracks (the live engine needs them so
 * unmuting is instant); the export leaves them out.
 */
export function planVoices(project: Project, opts: { includeMuted?: boolean } = {}): VoicePlan[] {
  const audible = audibleTrackIds(project);
  const plans: VoicePlan[] = [];
  for (const track of project.tracks) {
    if (!opts.includeMuted && !audible.has(track.id)) continue;
    let xf: Map<string, { xin: number; xout: number }> | null = null;
    for (const clip of track.clips) {
      if (!canSound(clip, project) || !(clip.duration > 0)) continue;
      const volume = clampVolume(clip.volume);
      if (!opts.includeMuted && volume === 0) continue;
      xf ??= crossfades(track);
      const x = xf.get(clip.id) ?? { xin: 0, xout: 0 };
      plans.push({
        clipId: clip.id,
        trackId: track.id,
        assetId: clip.assetId,
        start: clip.start,
        duration: clip.duration,
        in: Math.max(0, clip.in),
        speed: clip.speed > 0 ? clip.speed : 1,
        volume,
        envelope: clipEnvelope({ duration: clip.duration, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, xfadeIn: x.xin, xfadeOut: x.xout }),
      });
    }
  }
  return plans;
}

/** Everything about a voice except volume: if this changes the voice must restart, otherwise volume updates live. */
export function voiceShape(p: VoicePlan, assetUrl: string): string {
  return `${p.trackId}|${p.assetId}|${assetUrl}|${p.start}|${p.duration}|${p.in}|${p.speed}|${p.envelope.map((e) => `${e.t.toFixed(4)}:${e.g.toFixed(4)}`).join(",")}`;
}
