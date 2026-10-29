// What is on screen at time t, bottom to top: the one walk over the project that renderFrame, the
// export's frame preparation, the preview's video sync and on-canvas hit testing all share, so they
// can never disagree about which clip is where. Pure, and allocation-free after warm-up.

import type { Clip, MediaClip, Project, TextClip, Track } from "../model";
import { fadeAlpha, newFx, resetFx, soloTransitionFx, transitionFx, transitionProgress, transitionSpan, type TransitionFx } from "./transitions";

export interface Layer {
  clip: MediaClip | TextClip;
  track: Track;
  /**
   * Which copy of the asset's video element draws this clip. 0 normally; 1+ when the same video
   * shows twice at once (a transition between two cuts of one file, or the same file on two tracks).
   */
  voice: number;
  /** Clip fade multiplied by the transition's opacity, 0..1 */
  alpha: number;
  fx: TransitionFx;
}

export interface LayerList {
  items: Layer[];
  count: number;
}

export function newLayerList(): LayerList {
  return { items: [], count: 0 };
}

const PICTURE_TRACKS = new Set(["video", "overlay", "text"]);

const isPicture = (c: Clip): c is MediaClip | TextClip => c.type === "media" || c.type === "text";

const voiceCount = new Map<string, number>();

function push(list: LayerList, clip: MediaClip | TextClip, track: Track): Layer {
  let layer = list.items[list.count];
  if (!layer) {
    layer = { clip, track, voice: 0, alpha: 1, fx: newFx() };
    list.items.push(layer);
  }
  list.count++;
  layer.clip = clip;
  layer.track = track;
  layer.voice = 0;
  layer.alpha = 1;
  resetFx(layer.fx);
  return layer;
}

/** Fill `out` with the visible picture layers at time t, bottom to top. Hidden tracks are skipped. */
export function collectLayers(project: Project, t: number, out: LayerList): LayerList {
  out.count = 0;
  voiceCount.clear();
  const tracks = project.tracks;
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (track.hidden || !PICTURE_TRACKS.has(track.kind)) continue;
    const clips = track.clips;
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      if (c.start > t) break;
      if (t >= c.start + c.duration || !isPicture(c)) continue;
      const layer = push(out, c, track);
      let alpha = fadeAlpha(c, t);

      // This clip is the incoming side of its own transition
      if (c.transitionIn) {
        const prev = i > 0 ? clips[i - 1] : null;
        const prevEnd = prev ? prev.start + prev.duration : null;
        const span = transitionSpan(c, prevEnd);
        const p = transitionProgress(c.start, span, t);
        if (p >= 0) {
          const paired = prev !== null && prevEnd !== null && prevEnd > t && isPicture(prev);
          if (paired) transitionFx(c.transitionIn.type, p, "in", layer.fx);
          else soloTransitionFx(c.transitionIn.type, p, layer.fx);
        }
      }
      // ...or the outgoing side of the next clip's transition
      const next = i + 1 < clips.length ? clips[i + 1] : null;
      if (next && next.transitionIn && isPicture(next) && next.start <= t) {
        const span = transitionSpan(next, c.start + c.duration);
        const p = transitionProgress(next.start, span, t);
        if (p >= 0) transitionFx(next.transitionIn.type, p, "out", layer.fx);
      }

      alpha *= layer.fx.alpha;
      layer.alpha = alpha;
      if (c.type === "media") {
        const n = voiceCount.get(c.assetId) ?? 0;
        layer.voice = n;
        voiceCount.set(c.assetId, n + 1);
      }
    }
  }
  return out;
}

/** Topmost selectable layer under a frame point (fractions), or null */
export function layerAt(list: LayerList, hit: (layer: Layer) => boolean): Layer | null {
  for (let i = list.count - 1; i >= 0; i--) {
    const layer = list.items[i];
    if (layer.track.locked) continue;
    if (hit(layer)) return layer;
  }
  return null;
}
