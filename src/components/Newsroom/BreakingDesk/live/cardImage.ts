// The card image that goes up to the server and out on X: a JPEG (quality 0.92). The API takes JPEG or PNG
// (PUT /drafts/:id/card reads the type from the bytes) and posts either; a JPEG of a photo card is a few
// hundred KB and encodes in tens of milliseconds, where the lossless PNG was several MB and much slower.
// JPEG has no alpha channel, so the RGB-only rule (rgbPng.ts) holds by itself. A browser that can't write
// JPEG (toBlob then hands back a PNG) gets the RGB PNG as before.

import { flatCopy, rgbPng } from "./rgbPng";

export const CARD_JPEG_QUALITY = 0.92;
/** Sizes tried, largest first, until the card fits the byte limit (X takes up to 5 MB) */
export const CARD_SCALES = [1, 0.8, 0.65, 0.5] as const;

/** True when `head` starts like a JPEG file (SOI marker then another marker) */
export function isJpeg(head: Uint8Array): boolean {
  return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

/** The file extension for a card of this content type: "jpg" for JPEG, else "png" */
export function cardExt(type: string | undefined | null): "jpg" | "png" {
  return /jpe?g/i.test(type ?? "") ? "jpg" : "png";
}

export type FitResult = { blob: Blob; scale: number } | { error: "tainted" | "failed" | "too_big" };

/**
 * Encodes at each scale in turn until the result is at most `maxBytes`. `encode` resolves to null when the
 * browser could not encode (out of memory), and throws on a tainted canvas; `tainted` tells that error apart.
 */
export async function fitCard(
  encode: (scale: number) => Promise<Blob | null>,
  maxBytes: number,
  tainted: (err: unknown) => boolean,
  scales: readonly number[] = CARD_SCALES,
): Promise<FitResult> {
  let last: FitResult = { error: "too_big" };
  for (const scale of scales) {
    let blob: Blob | null;
    try {
      blob = await encode(scale);
    } catch (err) {
      // Tainted stays tainted; any other failure may still work smaller
      if (tainted(err)) return { error: "tainted" };
      last = { error: "failed" };
      continue;
    }
    if (!blob) {
      last = { error: "failed" };
      continue;
    }
    if (blob.size <= maxBytes) return { blob, scale };
    last = { error: "too_big" };
  }
  return last;
}

/** True when `canvas` already draws on an opaque 2D context ({ alpha: false }) */
function isOpaque(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  return !!ctx && typeof ctx.getContextAttributes === "function" && ctx.getContextAttributes().alpha === false;
}

/**
 * `source` as a JPEG at `scale` of its size (an RGB PNG where the browser can't write JPEG). Null when the
 * browser could not encode it; throws on a tainted canvas, as canvas.toBlob does.
 */
export async function cardJpeg(source: HTMLCanvasElement, scale = 1): Promise<Blob | null> {
  // Opaque first (black under anything see-through, as the PNG path), so JPEG and PNG cards look the same
  const flat = scale === 1 && isOpaque(source) ? source : flatCopy(source, scale);
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    try {
      flat.toBlob(resolve, "image/jpeg", CARD_JPEG_QUALITY);
    } catch (err) {
      reject(err);
    }
  });
  if (blob && blob.type === "image/jpeg" && isJpeg(new Uint8Array(await blob.slice(0, 3).arrayBuffer()))) return blob;
  // No JPEG encoder here: the lossless RGB PNG, as before
  return rgbPng(flat);
}
