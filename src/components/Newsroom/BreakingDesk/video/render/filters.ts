// Colour filters: brightness, contrast and saturation, as the CSS filter functions define them.
// Canvas 2D applies them through ctx.filter where it can; Safari (and OffscreenCanvas in some
// Firefox versions) ignores ctx.filter, so the same maths runs on the pixels instead.

import type { Filters } from "../model";

export function isNeutral(f: Filters | undefined | null): boolean {
  return !f || (f.brightness === 1 && f.contrast === 1 && f.saturation === 1);
}

const filterStrings = new WeakMap<Filters, string>();

/** The ctx.filter value for a clip's filters ("none" when neutral). Cached per filters object. */
export function cssFilter(f: Filters): string {
  if (isNeutral(f)) return "none";
  let s = filterStrings.get(f);
  if (s === undefined) {
    s = `brightness(${round(f.brightness)}) contrast(${round(f.contrast)}) saturate(${round(f.saturation)})`;
    filterStrings.set(f, s);
  }
  return s;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Per channel lookup for brightness then contrast (both are per channel and clamp, like CSS) */
export function buildToneLut(brightness: number, contrast: number, out: Uint8ClampedArray = new Uint8ClampedArray(256)): Uint8ClampedArray {
  const intercept = 0.5 - 0.5 * contrast;
  for (let i = 0; i < 256; i++) {
    let v = (i / 255) * brightness;
    v = v > 1 ? 1 : v;
    v = v * contrast + intercept;
    out[i] = Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
  }
  return out;
}

/** The CSS saturate() matrix (Filter Effects spec), row-major 3x3 */
export function saturateMatrix(s: number, out: Float32Array = new Float32Array(9)): Float32Array {
  out[0] = 0.213 + 0.787 * s;
  out[1] = 0.715 - 0.715 * s;
  out[2] = 0.072 - 0.072 * s;
  out[3] = 0.213 - 0.213 * s;
  out[4] = 0.715 + 0.285 * s;
  out[5] = 0.072 - 0.072 * s;
  out[6] = 0.213 - 0.213 * s;
  out[7] = 0.715 - 0.715 * s;
  out[8] = 0.072 + 0.928 * s;
  return out;
}

const lut = new Uint8ClampedArray(256);
const mat = new Float32Array(9);

/** Apply the filters to RGBA pixels in place (alpha untouched). The fallback for contexts without ctx.filter. */
export function applyFiltersToPixels(data: Uint8ClampedArray, f: Filters): void {
  if (isNeutral(f)) return;
  buildToneLut(f.brightness, f.contrast, lut);
  const satOn = f.saturation !== 1;
  if (satOn) saturateMatrix(f.saturation, mat);
  const m0 = mat[0], m1 = mat[1], m2 = mat[2], m3 = mat[3], m4 = mat[4], m5 = mat[5], m6 = mat[6], m7 = mat[7], m8 = mat[8];
  for (let i = 0, n = data.length; i < n; i += 4) {
    const r = lut[data[i]];
    const g = lut[data[i + 1]];
    const b = lut[data[i + 2]];
    if (satOn) {
      // Uint8ClampedArray rounds and clamps on store
      data[i] = m0 * r + m1 * g + m2 * b;
      data[i + 1] = m3 * r + m4 * g + m5 * b;
      data[i + 2] = m6 * r + m7 * g + m8 * b;
    } else {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
}

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const supportCache = new Map<string, boolean>();

/**
 * Whether this kind of context really applies ctx.filter. Tested once per context kind by drawing a
 * red pixel through grayscale(1): a browser that only pretends (or lacks the property) leaves it red.
 */
export function supportsCtxFilter(ctx: AnyCtx): boolean {
  const kind = typeof OffscreenCanvasRenderingContext2D !== "undefined" && ctx instanceof OffscreenCanvasRenderingContext2D ? "offscreen" : "dom";
  const known = supportCache.get(kind);
  if (known !== undefined) return known;
  let ok = false;
  try {
    let probe: AnyCtx | null = null;
    if (kind === "offscreen") probe = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
    else if (typeof document !== "undefined") probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (probe && "filter" in probe) {
      probe.fillStyle = "#ff0000";
      probe.filter = "grayscale(1)";
      probe.fillRect(0, 0, 1, 1);
      const [r, g] = probe.getImageData(0, 0, 1, 1).data;
      ok = Math.abs(r - g) < 8;
    }
  } catch {
    ok = false;
  }
  supportCache.set(kind, ok);
  return ok;
}
