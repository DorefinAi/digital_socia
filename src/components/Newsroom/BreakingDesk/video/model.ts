// Video Studio project model: one plain JSON object that the timeline edits, the preview and the MP4 export both
// render from (render/renderFrame, audio/mixAudio), and the draft saves. Times are seconds on the timeline unless
// named `in`/`out` (seconds in the source file). Positions are fractions of the frame (0..1) so a project survives
// an aspect change. Contract: handoff/video-studio-contract.md.

export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";

export const ASPECTS: Record<Aspect, { width: number; height: number; label: string }> = {
  "16:9": { width: 1920, height: 1080, label: "YouTube / Facebook landscape" },
  "9:16": { width: 1080, height: 1920, label: "Shorts / Reels / Stories" },
  "1:1": { width: 1080, height: 1080, label: "Facebook / X square" },
  "4:5": { width: 1080, height: 1350, label: "Facebook feed portrait" },
};

export type AssetKind = "video" | "image" | "audio";

/** A source file: story footage, an upload, music, a logo. url must be same-origin (or blob:) so canvases stay readable. */
export interface Asset {
  id: string;
  kind: AssetKind;
  url: string;
  name: string;
  /** Seconds; 0 for images */
  duration: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

export type TrackKind = "video" | "overlay" | "text" | "audio" | "caption";

export type TransitionType = "crossfade" | "fade-black" | "fade-white" | "slide-left" | "slide-right" | "wipe";

export interface Transition {
  type: TransitionType;
  /** Seconds, taken from the overlap with the previous clip on the same track */
  duration: number;
}

export interface Box {
  /** Centre x/y and size as fractions of the frame */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees */
  rotation: number;
}

export interface Crop {
  /** Fractions of the source cut from each side */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Filters {
  /** 1 = unchanged */
  brightness: number;
  contrast: number;
  saturation: number;
}

interface ClipBase {
  id: string;
  /** Timeline start, seconds */
  start: number;
  /** Timeline length, seconds (after speed) */
  duration: number;
  /** Opacity fade in/out, seconds */
  fadeIn: number;
  fadeOut: number;
  transitionIn?: Transition;
}

/** A video or image on the main video track or an overlay track (picture in picture, logo, sticker). */
export interface MediaClip extends ClipBase {
  type: "media";
  assetId: string;
  /** Source in-point, seconds (video only) */
  in: number;
  /** 0.25..4 */
  speed: number;
  /** 0..2, 1 = original (video sound) */
  volume: number;
  /** Sound moved to its own audio clip: this clip plays silent */
  audioDetached: boolean;
  box: Box;
  fit: "fit" | "fill";
  crop: Crop;
  flipH: boolean;
  flipV: boolean;
  filters: Filters;
}

export interface TextStyle {
  font: string;
  /** Px at the project height of 1080 */
  size: number;
  weight: 400 | 700;
  color: string;
  outlineColor: string | null;
  outlineWidth: number;
  background: string | null;
  align: "left" | "center" | "right";
}

export interface TextClip extends ClipBase {
  type: "text";
  text: string;
  style: TextStyle;
  box: Box;
}

export interface AudioClip extends ClipBase {
  type: "audio";
  assetId: string;
  in: number;
  speed: number;
  volume: number;
}

/** One subtitle line on the caption track (typed or from an .srt) */
export interface CaptionClip extends ClipBase {
  type: "caption";
  text: string;
}

export type Clip = MediaClip | TextClip | AudioClip | CaptionClip;

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  /** When any track is solo, only solo tracks are heard */
  solo?: boolean;
  hidden: boolean;
  locked: boolean;
  /** Sorted by start, no overlaps except a transition's overlap on video/overlay tracks */
  clips: Clip[];
}

export interface CaptionStyle extends TextStyle {
  /** Fraction of frame height from the bottom */
  bottom: number;
}

export interface Project {
  version: 1;
  aspect: Aspect;
  fps: 25 | 30 | 60;
  background: string;
  /** Draw order: tracks[0] is the bottom layer. Audio/caption tracks have no picture except captions on top. */
  tracks: Track[];
  assets: Asset[];
  captionStyle: CaptionStyle;
}

export const DEFAULT_FILTERS: Filters = { brightness: 1, contrast: 1, saturation: 1 };
export const FULL_FRAME: Box = { x: 0.5, y: 0.5, w: 1, h: 1, rotation: 0 };
export const NO_CROP: Crop = { left: 0, top: 0, right: 0, bottom: 0 };

export const DEFAULT_TEXT: TextStyle = {
  font: "Mangal", size: 72, weight: 700, color: "#FFFFFF", outlineColor: "#000000", outlineWidth: 4, background: null, align: "center",
};

export function projectSize(p: Pick<Project, "aspect">) {
  return ASPECTS[p.aspect];
}

/** Timeline length: the end of the last clip on any track */
export function projectDuration(p: Project): number {
  let end = 0;
  for (const t of p.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  return end;
}

/** Clips visible/audible at time t on one track (two during a transition overlap) */
export function clipsAt(track: Track, t: number): Clip[] {
  return track.clips.filter((c) => t >= c.start && t < c.start + c.duration);
}

/** Source time inside a media/audio clip for timeline time t */
export function sourceTime(clip: MediaClip | AudioClip, t: number): number {
  return clip.in + (t - clip.start) * clip.speed;
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyProject(aspect: Aspect = "16:9"): Project {
  return {
    version: 1,
    aspect,
    fps: 30,
    background: "#000000",
    tracks: [
      { id: newId("trk"), kind: "video", name: "Video", muted: false, hidden: false, locked: false, clips: [] },
      { id: newId("trk"), kind: "overlay", name: "Overlay", muted: false, hidden: false, locked: false, clips: [] },
      { id: newId("trk"), kind: "text", name: "Text", muted: false, hidden: false, locked: false, clips: [] },
      { id: newId("trk"), kind: "caption", name: "Captions", muted: false, hidden: false, locked: false, clips: [] },
      { id: newId("trk"), kind: "audio", name: "Audio", muted: false, hidden: false, locked: false, clips: [] },
      { id: newId("trk"), kind: "audio", name: "Music", muted: false, hidden: false, locked: false, clips: [] },
    ],
    assets: [],
    captionStyle: { ...DEFAULT_TEXT, size: 56, background: "rgba(0,0,0,0.6)", outlineColor: null, outlineWidth: 0, bottom: 0.08 },
  };
}
