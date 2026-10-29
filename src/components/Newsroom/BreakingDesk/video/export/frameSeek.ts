// Seeks every video visible at a timeline time to its exact source frame before renderFrame draws it.
import { clipsAt, sourceTime, type Asset, type MediaClip, type Project } from "../model";
import type { FrameDriver, SeekablePool } from "./types";

export type FrameSeeker = (t: number) => Promise<void>;

/** Builds a seeker for one project (asset lookup and track list are computed once, not per frame). */
export function createFrameSeeker(project: Project, pool: SeekablePool, fps: number): FrameSeeker {
  const videos = new Map<string, Asset>();
  for (const a of project.assets) if (a.kind === "video") videos.set(a.id, a);
  const pictureTracks = project.tracks.filter((tr) => (tr.kind === "video" || tr.kind === "overlay") && !tr.hidden);
  // Never ask for a time past the last frame: a seek beyond the end never fires "seeked" in some browsers
  const halfFrame = 0.5 / fps;
  const targets = new Map<string, number>();

  return async (t: number) => {
    targets.clear();
    for (const track of pictureTracks) {
      for (const clip of clipsAt(track, t)) {
        if (clip.type !== "media") continue;
        const asset = videos.get(clip.assetId);
        if (!asset) continue;
        const end = asset.duration > 0 ? asset.duration - halfFrame : Infinity;
        // Upper layers win when one asset shows twice at once (one element per asset in the pool)
        targets.set(asset.id, Math.min(Math.max(0, sourceTime(clip as MediaClip, t)), end));
      }
    }
    if (targets.size === 0) return;
    const seeks: Promise<void>[] = [];
    for (const [assetId, time] of targets) seeks.push(pool.seekVideo(assetId, time));
    await Promise.all(seeks);
  };
}

/** The default frame driver: the pool's own prepareFrame when it has one, else a seek per visible video. */
export function seekingDriver<P extends SeekablePool>(project: Project, pool: P, fps: number): FrameDriver<P> {
  const seek = pool.prepareFrame ? (t: number) => pool.prepareFrame!(project, t) : createFrameSeeker(project, pool, fps);
  return { pool, advance: seek, dispose: () => {} };
}

/** Whether anything in the project can make sound (decides if an audio encoder is required). */
export function projectHasSound(project: Project): boolean {
  const audible = new Map<string, boolean>();
  for (const a of project.assets) audible.set(a.id, a.kind === "audio" || (a.kind === "video" && a.hasAudio !== false));
  // Solo (optional Track.solo): when any track is soloed only soloed tracks are heard
  const anySolo = project.tracks.some((tr) => tr.solo);
  return project.tracks.some(
    (tr) =>
      !tr.muted &&
      (!anySolo || tr.solo) &&
      tr.clips.some((c) => (c.type === "audio" || (c.type === "media" && !c.audioDetached)) && c.volume > 0 && audible.get(c.assetId) === true),
  );
}
