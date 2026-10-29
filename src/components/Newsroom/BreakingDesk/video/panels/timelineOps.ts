// Shell-level actions built on the StudioApi surface: adding a file from the bin at a sensible place and adding
// a text preset. Pure helpers so the bins and the inspector share one behaviour.

import { newId, type Asset, type AudioClip, type Project, type TextClip } from "../model";
import { mediaClipFor } from "../projectFromStory";
import type { TextPreset } from "./catalog";
import type { StudioApi } from "./studioApi";

export type AddMode = "main" | "overlay";

const OVERLAY_BOX = { x: 0.76, y: 0.26, w: 0.36, h: 0.36, rotation: 0 };

const trackEnd = (p: Project, kind: string) =>
  p.tracks.filter((t) => t.kind === kind).reduce((end, t) => t.clips.reduce((e, c) => Math.max(e, c.start + c.duration), end), 0);

/** Main: after the last clip on the Video track. Overlay and sound: at the playhead. */
export function addAssetToTimeline(api: StudioApi, asset: Asset, mode: AddMode = "main") {
  if (asset.kind === "audio") {
    const clip: AudioClip = { id: newId("clp"), type: "audio", assetId: asset.id, start: api.getPlayhead(), duration: asset.duration || 10, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 };
    api.addClip("audio", clip);
    return;
  }
  if (mode === "overlay") {
    const clip = mediaClipFor(asset, api.getPlayhead(), OVERLAY_BOX);
    clip.fit = "fill";
    api.addClip("overlay", clip);
    return;
  }
  const clip = mediaClipFor(asset, trackEnd(api.project, "video"));
  if (asset.kind === "image") clip.fit = "fill";
  api.addClip("video", clip);
}

export function addTextPreset(api: StudioApi, preset: TextPreset, text?: string) {
  const clip: TextClip = {
    id: newId("txt"),
    type: "text",
    text: text?.trim() || preset.sample,
    start: api.getPlayhead(),
    duration: 5,
    fadeIn: 0,
    fadeOut: 0.2,
    style: { ...preset.style },
    box: preset.box(api.project.aspect),
  };
  api.addClip("text", clip);
}
