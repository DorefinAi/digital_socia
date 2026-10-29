// Timeline geometry and colours. Colours come from the studio theme (panels/studioTheme.ts) so the bay reads as
// one product: grey chrome, amber for what is selected and for the playhead, one hue per clip type.

import type { Clip, Project, Track, TrackKind } from "../model";
import { S } from "../panels/studioTheme";

export { S };

export const HEADER_W = 172;
export const RULER_H = 28;
export const TRACK_GAP = 2;

const HEIGHTS: Record<TrackKind, number> = { video: 62, overlay: 48, text: 34, caption: 30, audio: 46 };
export const trackHeight = (kind: TrackKind) => HEIGHTS[kind];

/** Mime type for dragging an asset from the media bin onto a track: dataTransfer.setData(ASSET_DRAG_TYPE, assetId) */
export const ASSET_DRAG_TYPE = "application/x-studio-asset";

/** Clip fill colour by type (images get the overlay hue so stills and footage are told apart at a glance) */
export function clipColor(clip: Clip, project: Pick<Project, "assets">): string {
  switch (clip.type) {
    case "media": {
      const asset = project.assets.find((a) => a.id === clip.assetId);
      return asset?.kind === "image" ? S.clip.overlay : S.clip.video;
    }
    case "text": return S.clip.text;
    case "caption": return S.clip.caption;
    case "audio": return S.clip.audio;
  }
}

export function clipLabel(clip: Clip, project: Pick<Project, "assets">): string {
  if (clip.type === "text" || clip.type === "caption") return clip.text.replace(/\s+/g, " ").trim() || (clip.type === "text" ? "Text" : "Caption");
  return project.assets.find((a) => a.id === clip.assetId)?.name ?? "Missing file";
}

/**
 * Display order, top to bottom: picture tracks with the top layer first (tracks[0] draws at the bottom), then
 * sound tracks in project order, the way editors stack them.
 */
export function displayTracks(tracks: Track[]): Track[] {
  const picture = tracks.filter((t) => t.kind !== "audio").reverse();
  const sound = tracks.filter((t) => t.kind === "audio");
  return [...picture, ...sound];
}

/** Ruler step (seconds) so labels sit at least ~90 px apart */
export function rulerStep(zoom: number): { major: number; minor: number } {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const major = steps.find((s) => s * zoom >= 90) ?? 1200;
  const minor = major / (major >= 1 && major % 5 === 0 ? 5 : major === 2 || major === 0.2 ? 4 : major === 15 ? 3 : 2);
  return { major, minor };
}

/** m:ss, m:ss.f when the step is under a second */
export function rulerLabel(t: number, step: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = step < 1 ? s.toFixed(1).padStart(4, "0") : String(Math.round(s)).padStart(2, "0");
  return `${m}:${ss}`;
}

/** Timecode m:ss:ff for the toolbar (frames, so frame stepping is visible) */
export function timecodeFrames(t: number, fps: number): string {
  const total = Math.max(0, Math.round(t * fps));
  const f = total % fps;
  const secs = Math.floor(total / fps);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}
