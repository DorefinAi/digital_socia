// Where a picture lands inside its box: crop first, then fit (letterbox inside the box) or fill
// (cover the box, trimming the overflow from the source so no clip path is needed). Pure.

import type { Box, Crop } from "../model";

/** drawImage arguments in box-local space: the box is centred on (0, 0). Reused by the caller. */
export interface DrawRects {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function newRects(): DrawRects {
  return { sx: 0, sy: 0, sw: 0, sh: 0, dx: 0, dy: 0, dw: 0, dh: 0 };
}

/**
 * Fill `out` for a source of srcW x srcH drawn into a box of boxW x boxH (pixels).
 * Returns false when nothing would be visible (empty source, crop eats everything, zero box).
 */
export function mediaRects(srcW: number, srcH: number, crop: Crop, boxW: number, boxH: number, fit: "fit" | "fill", out: DrawRects): boolean {
  const left = clampFrac(crop.left);
  const top = clampFrac(crop.top);
  const cw = srcW * (1 - left - clampFrac(crop.right));
  const ch = srcH * (1 - top - clampFrac(crop.bottom));
  if (!(cw > 0.5 && ch > 0.5 && boxW > 0 && boxH > 0)) return false;
  const cx = srcW * left;
  const cy = srcH * top;
  if (fit === "fit") {
    const s = Math.min(boxW / cw, boxH / ch);
    out.sx = cx;
    out.sy = cy;
    out.sw = cw;
    out.sh = ch;
    out.dw = cw * s;
    out.dh = ch * s;
  } else {
    const s = Math.max(boxW / cw, boxH / ch);
    // The part of the cropped source that covers the box, centred
    const vw = boxW / s;
    const vh = boxH / s;
    out.sx = cx + (cw - vw) / 2;
    out.sy = cy + (ch - vh) / 2;
    out.sw = vw;
    out.sh = vh;
    out.dw = boxW;
    out.dh = boxH;
  }
  out.dx = -out.dw / 2;
  out.dy = -out.dh / 2;
  return true;
}

const clampFrac = (v: number) => (v > 0 ? (v < 0.95 ? v : 0.95) : 0);

/** Axis-aligned bounds of a (possibly rotated) box, in frame fractions, scaled to the frame's aspect */
export function boxBounds(box: Box, W: number, H: number): { left: number; top: number; right: number; bottom: number } {
  const rad = (box.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const wPx = box.w * W;
  const hPx = box.h * H;
  const halfW = (wPx * cos + hPx * sin) / 2 / W;
  const halfH = (wPx * sin + hPx * cos) / 2 / H;
  return { left: box.x - halfW, top: box.y - halfH, right: box.x + halfW, bottom: box.y + halfH };
}

/** Whether frame point (px, py) in fractions lies inside the rotated box */
export function pointInBox(box: Box, px: number, py: number, W: number, H: number): boolean {
  const rad = (-box.rotation * Math.PI) / 180;
  const dx = (px - box.x) * W;
  const dy = (py - box.y) * H;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= (box.w * W) / 2 && Math.abs(ly) <= (box.h * H) / 2;
}
