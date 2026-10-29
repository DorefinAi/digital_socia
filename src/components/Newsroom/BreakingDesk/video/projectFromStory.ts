// The starting project for a story: its first video on the Video track (or its photos in a row when it has no
// video), the headline as a lower third over the whole cut, and the platform's usual frame. Every other file
// from the story's folder lands in "Your media" so it is one click away.

import {
  ASPECTS, DEFAULT_FILTERS, DEFAULT_TEXT, FULL_FRAME, NO_CROP, emptyProject, newId,
  type Aspect, type Asset, type AssetKind, type MediaClip, type Project, type TextClip,
} from "./model";

export type StudioPlatform = "Facebook" | "YouTube" | "Shorts" | "Reels";

export const PLATFORM_ASPECT: Record<StudioPlatform, Aspect> = {
  YouTube: "16:9",
  Facebook: "16:9",
  Shorts: "9:16",
  Reels: "9:16",
};

/** The parts of an FTP story / draft view the studio reads */
export interface StoryMediaSource {
  id: string;
  headline: string;
  /** Optional second line of text (YouTube: the description), shown under a title card for the opening seconds */
  description?: string;
  media: { kind: "image" | "video" | "audio"; url: string; fileName: string }[];
}

/** What a probe learned about a file (seconds, pixels); missing when it could not be read */
export interface MediaFacts {
  duration?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

/** How long a still sits on the timeline when it is added */
export const IMAGE_SECONDS = 5;
/** Length used for a video whose duration could not be read yet */
const UNKNOWN_VIDEO_SECONDS = 10;

export function assetFrom(kind: AssetKind, url: string, name: string, facts: MediaFacts = {}): Asset {
  return {
    id: newId("ast"),
    kind,
    url,
    name,
    duration: kind === "image" ? 0 : facts.duration && Number.isFinite(facts.duration) ? facts.duration : 0,
    width: facts.width,
    height: facts.height,
    hasAudio: kind === "audio" ? true : facts.hasAudio,
  };
}

/** A clip that shows the whole asset, starting at `start` */
export function mediaClipFor(asset: Asset, start: number, box = FULL_FRAME): MediaClip {
  const duration = asset.kind === "image" ? IMAGE_SECONDS : asset.duration || UNKNOWN_VIDEO_SECONDS;
  return {
    id: newId("clp"),
    type: "media",
    assetId: asset.id,
    start,
    duration,
    in: 0,
    speed: 1,
    volume: 1,
    audioDetached: false,
    box: { ...box },
    fit: "fit",
    crop: { ...NO_CROP },
    flipH: false,
    flipV: false,
    filters: { ...DEFAULT_FILTERS },
    fadeIn: 0,
    fadeOut: 0,
  };
}

/** Where a lower third sits for each frame shape: low and wide, higher on tall frames to clear app buttons */
export function lowerThirdBox(aspect: Aspect) {
  switch (aspect) {
    case "9:16":
      return { x: 0.5, y: 0.72, w: 0.88, h: 0.12, rotation: 0 };
    case "4:5":
      return { x: 0.5, y: 0.82, w: 0.9, h: 0.13, rotation: 0 };
    case "1:1":
      return { x: 0.5, y: 0.84, w: 0.9, h: 0.14, rotation: 0 };
    default:
      return { x: 0.5, y: 0.85, w: 0.86, h: 0.13, rotation: 0 };
  }
}

export function headlineClip(text: string, aspect: Aspect, start: number, duration: number): TextClip {
  return {
    id: newId("txt"),
    type: "text",
    text,
    start,
    duration,
    // On from the first frame, so the opening frame (the post's thumbnail) carries the headline
    fadeIn: 0,
    fadeOut: 0.3,
    box: lowerThirdBox(aspect),
    style: { ...DEFAULT_TEXT, size: aspect === "16:9" ? 56 : sizeFor(aspect, 0.055), outlineColor: null, outlineWidth: 0, background: "rgba(176,18,24,0.92)", align: "center" },
  };
}

/**
 * TextStyle.size is px at a 1080-high frame and scales with the frame's height, so a tall frame needs a smaller
 * number for the same width-relative size. `share` is the line height's share of the frame width.
 */
function sizeFor(aspect: Aspect, share: number): number {
  const { width, height } = ASPECTS[aspect];
  return Math.round((share * width * 1080) / height);
}

const DESCRIPTION_CHARS = 220;

/** The description as a readable block in the upper middle of the frame, cut at a word near 220 characters */
export function descriptionClip(text: string, aspect: Aspect, duration: number): TextClip {
  const flat = text.replace(/\s+/g, " ").trim();
  const tall = aspect === "9:16";
  const max = tall ? 140 : DESCRIPTION_CHARS;
  const space = flat.lastIndexOf(" ", max);
  const cut = flat.length > max ? `${flat.slice(0, space > max / 2 ? space : max)}…` : flat;
  return {
    id: newId("txt"),
    type: "text",
    text: cut,
    start: 0,
    duration,
    fadeIn: 0,
    fadeOut: 0.3,
    box: { x: 0.5, y: tall ? 0.42 : 0.45, w: tall ? 0.84 : 0.76, h: tall ? 0.3 : 0.36, rotation: 0 },
    style: { ...DEFAULT_TEXT, size: aspect === "16:9" ? 44 : sizeFor(aspect, 0.04), weight: 400, outlineColor: null, outlineWidth: 0, background: "rgba(10,12,16,0.72)" },
  };
}

/**
 * @param facts per media url, from probing the files first (durations make the cut exact; without them a video
 *   gets a 10 s placeholder length that the timeline can trim)
 */
export function projectFromStory(
  story: StoryMediaSource | null,
  platform: StudioPlatform,
  facts: Record<string, MediaFacts> = {},
): Project {
  const aspect = PLATFORM_ASPECT[platform];
  const project = emptyProject(aspect);
  if (!story) return project;

  const assets = story.media.map((m) => assetFrom(m.kind, m.url, m.fileName, facts[m.url]));
  project.assets = assets;
  const videoTrack = project.tracks.find((t) => t.kind === "video")!;
  const textTrack = project.tracks.find((t) => t.kind === "text")!;

  const mainVideo = assets.find((a) => a.kind === "video");
  if (mainVideo) {
    videoTrack.clips = [mediaClipFor(mainVideo, 0)];
  } else {
    let at = 0;
    for (const a of assets.filter((x) => x.kind === "image")) {
      const clip = mediaClipFor(a, at);
      clip.fit = "fill";
      videoTrack.clips.push(clip);
      at += clip.duration;
    }
  }

  const length = videoTrack.clips.reduce((end, c) => Math.max(end, c.start + c.duration), 0);
  const headline = story.headline.trim();
  if (headline) textTrack.clips = [headlineClip(headline, aspect, 0, length || IMAGE_SECONDS)];
  const description = story.description?.trim();
  if (description) project.tracks.splice(project.tracks.indexOf(textTrack) + 1, 0, { ...textTrack, id: newId("trk"), name: "Text 2", clips: [descriptionClip(description, aspect, Math.min(length || IMAGE_SECONDS, 8))] });
  return project;
}
