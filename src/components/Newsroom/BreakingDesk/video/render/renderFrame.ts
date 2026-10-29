// renderFrame: one frame of the project at timeline time t, drawn into the whole canvas of `ctx`
// (any size: the preview's HiDPI canvas, the export's 720p or 1080p OffscreenCanvas). Preview and
// export both call this, so what the editor shows is what the MP4 gets. Pure apart from drawing:
// it reads the project and the pool, never changes them, and allocates nothing on a steady frame.
//
// Order: background, picture tracks bottom (tracks[0]) to top with hidden tracks skipped, then
// captions over everything. Videos must already show the right frame: export awaits
// pool.prepareFrame(project, t) first, the preview calls pool.syncPreview each animation frame.

import { projectSize, type MediaClip, type Project, type TextClip } from "../model";
import { applyFiltersToPixels, cssFilter, isNeutral, supportsCtxFilter } from "./filters";
import { mediaRects, newRects } from "./geometry";
import { collectLayers, newLayerList, type Layer } from "./layers";
import type { MediaPool } from "./mediaPool";
import { drawCaption, drawTextClip } from "./text";
import { fadeAlpha } from "./transitions";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const layers = newLayerList();
const rects = newRects();
const DEG = Math.PI / 180;

export function renderFrame(ctx: Ctx, project: Project, t: number, pool: MediaPool): void {
  const { width: W, height: H } = projectSize(project);
  const canvas = ctx.canvas;
  ctx.save();
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.fillStyle = project.background || "#000000";
  ctx.fillRect(0, 0, W, H);

  const list = collectLayers(project, t, layers);
  for (let i = 0; i < list.count; i++) {
    const layer = list.items[i];
    if (layer.alpha <= 0.001) continue;
    if (layer.clip.type === "media") drawMedia(ctx, layer, layer.clip, pool, W, H);
    else drawText(ctx, layer, layer.clip, W, H);
  }

  // Captions sit above every picture track
  const tracks = project.tracks;
  for (let ti = 0; ti < tracks.length; ti++) {
    const track = tracks[ti];
    if (track.kind !== "caption" || track.hidden) continue;
    for (let i = 0; i < track.clips.length; i++) {
      const c = track.clips[i];
      if (c.start > t) break;
      if (c.type !== "caption" || t >= c.start + c.duration) continue;
      const a = fadeAlpha(c, t);
      if (a <= 0.001) continue;
      ctx.globalAlpha = a;
      drawCaption(ctx, c, project.captionStyle, W, H);
    }
  }
  ctx.restore();
}

/** Restrict drawing to the visible part of a wipe, in frame coordinates */
function clipToWipe(ctx: Ctx, layer: Layer, W: number, H: number) {
  const fx = layer.fx;
  if (fx.clipLeft <= 0 && fx.clipRight >= 1) return;
  ctx.beginPath();
  ctx.rect(fx.clipLeft * W, 0, Math.max(0, fx.clipRight - fx.clipLeft) * W, H);
  ctx.clip();
}

function drawMedia(ctx: Ctx, layer: Layer, clip: MediaClip, pool: MediaPool, W: number, H: number) {
  const src = pool.frame(clip.assetId, layer.voice);
  const size = pool.frameSize(clip.assetId);
  if (!src || !size) return;
  const box = clip.box;
  if (!mediaRects(size.width, size.height, clip.crop, box.w * W, box.h * H, clip.fit, rects)) return;
  const fx = layer.fx;
  ctx.save();
  clipToWipe(ctx, layer, W, H);
  ctx.translate((box.x + fx.dx) * W, box.y * H);
  if (box.rotation) ctx.rotate(box.rotation * DEG);
  if (clip.flipH || clip.flipV) ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);
  ctx.globalAlpha = layer.alpha;

  if (isNeutral(clip.filters)) {
    ctx.drawImage(src, rects.sx, rects.sy, rects.sw, rects.sh, rects.dx, rects.dy, rects.dw, rects.dh);
  } else if (supportsCtxFilter(ctx)) {
    ctx.filter = cssFilter(clip.filters);
    ctx.drawImage(src, rects.sx, rects.sy, rects.sw, rects.sh, rects.dx, rects.dy, rects.dw, rects.dh);
    ctx.filter = "none";
  } else {
    drawFilteredFallback(ctx, src, clip, W);
  }

  if (fx.tint && fx.tintAlpha > 0) {
    // A dip to black/white covers the clip's own picture, so an overlay dips without darkening what is under it
    ctx.globalAlpha = layer.alpha * fx.tintAlpha;
    ctx.fillStyle = fx.tint;
    ctx.fillRect(rects.dx, rects.dy, rects.dw, rects.dh);
  }
  ctx.restore();
}

function drawText(ctx: Ctx, layer: Layer, clip: TextClip, W: number, H: number) {
  const fx = layer.fx;
  // Text has no picture to tint: a dip to colour fades it instead
  const alpha = fx.tint ? layer.alpha * (1 - fx.tintAlpha) : layer.alpha;
  if (alpha <= 0.001 || !clip.text) return;
  const box = clip.box;
  ctx.save();
  clipToWipe(ctx, layer, W, H);
  ctx.translate((box.x + fx.dx) * W, box.y * H);
  if (box.rotation) ctx.rotate(box.rotation * DEG);
  ctx.globalAlpha = alpha;
  drawTextClip(ctx, clip, box.w * W, box.h * H, H);
  ctx.restore();
}

// ----- filter fallback: pixels through the same maths as ctx.filter ---------------------------

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;
let scratchCtx: Ctx | null = null;

function scratchOf(w: number, h: number): Ctx | null {
  if (!scratch) {
    scratch = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : typeof document !== "undefined" ? document.createElement("canvas") : null;
    if (!scratch) return null;
    scratchCtx = scratch.getContext("2d", { willReadFrequently: true }) as Ctx | null;
  }
  if (scratch.width < w) scratch.width = w;
  if (scratch.height < h) scratch.height = h;
  return scratchCtx;
}

/** Draw `src` (already placed by the current transform) through a scratch canvas whose pixels get the filters */
function drawFilteredFallback(ctx: Ctx, src: CanvasImageSource, clip: MediaClip, W: number) {
  // Work at the output's real resolution: project px times the canvas scale
  const scale = ctx.canvas.width / W;
  const w = Math.max(1, Math.min(4096, Math.round(rects.dw * scale)));
  const h = Math.max(1, Math.min(4096, Math.round(rects.dh * scale)));
  const s = scratchOf(w, h);
  if (!s || !scratch) {
    ctx.drawImage(src, rects.sx, rects.sy, rects.sw, rects.sh, rects.dx, rects.dy, rects.dw, rects.dh);
    return;
  }
  s.clearRect(0, 0, w, h);
  s.drawImage(src, rects.sx, rects.sy, rects.sw, rects.sh, 0, 0, w, h);
  const img = s.getImageData(0, 0, w, h);
  applyFiltersToPixels(img.data, clip.filters);
  s.putImageData(img, 0, 0);
  ctx.drawImage(scratch, 0, 0, w, h, rects.dx, rects.dy, rects.dw, rects.dh);
}
