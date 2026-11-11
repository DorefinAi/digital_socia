// Card images leave the browser as RGB PNGs: no alpha channel at all, as the desk's own posts. The card is
// flattened onto an opaque canvas first; Chrome then encodes it as RGB itself. A browser whose encoder still
// writes RGBA (or an older one) gets the pixels re-encoded here, as an 8-bit RGB PNG.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** IHDR colour type for truecolour without alpha */
const RGB = 2;

/** True when `head` (a PNG's first 26 bytes or more) is an 8-bit RGB PNG: colour type 2, no alpha channel. */
export function isRgbPng(head: Uint8Array): boolean {
  if (head.length < 26 || SIGNATURE.some((b, i) => head[i] !== b)) return false;
  // Length (4) + "IHDR" (4) after the signature, then width (4), height (4), bit depth, colour type
  const isIhdr = head[12] === 0x49 && head[13] === 0x48 && head[14] === 0x44 && head[15] === 0x52;
  return isIhdr && head[24] === 8 && head[25] === RGB;
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, (crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0);
  return out;
}

/** zlib (RFC 1950) of `raw`: CompressionStream where there is one, else stored (uncompressed) blocks. */
async function zlib(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let b = 0; b < blocks; b++) {
    const part = raw.subarray(b * 65535, Math.min(raw.length, (b + 1) * 65535));
    out[at] = b === blocks - 1 ? 1 : 0;
    out[at + 1] = part.length & 0xff;
    out[at + 2] = part.length >>> 8;
    out[at + 3] = ~part.length & 0xff;
    out[at + 4] = (~part.length >>> 8) & 0xff;
    out.set(part, at + 5);
    at += 5 + part.length;
  }
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < raw.length; i++) {
    s1 = (s1 + raw[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  new DataView(out.buffer).setUint32(at, ((s2 << 16) | s1) >>> 0);
  return out;
}

/**
 * An 8-bit RGB PNG of RGBA pixels (canvas ImageData order). Alpha is dropped: each pixel is composited over
 * black first, which leaves opaque pixels as they are. Rows use the Sub filter, which suits card artwork.
 */
export async function encodeRgbPng(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): Promise<Blob> {
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 1; // Sub: each byte minus the same channel of the pixel to its left
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const a = rgba[p + 3];
      const o = row + 1 + x * 3;
      for (let c = 0; c < 3; c++) {
        const v = a === 255 ? rgba[p + c] : Math.round((rgba[p + c] * a) / 255);
        raw[o + c] = v;
      }
    }
    for (let i = stride - 1; i > 3; i--) raw[row + i] = (raw[row + i] - raw[row + i - 3]) & 0xff;
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = RGB;
  const parts = [new Uint8Array(SIGNATURE), chunk("IHDR", header), chunk("IDAT", await zlib(raw)), chunk("IEND", new Uint8Array(0))];
  return new Blob(parts as BlobPart[], { type: "image/png" });
}

/** A copy of `source` on an opaque canvas (black under anything see-through), at `scale` of its size. */
export function flatCopy(source: HTMLCanvasElement, scale = 1): HTMLCanvasElement {
  const flat = document.createElement("canvas");
  flat.width = Math.max(1, Math.round(source.width * scale));
  flat.height = Math.max(1, Math.round(source.height * scale));
  const ctx = flat.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser can't draw cards.");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, flat.width, flat.height);
  if (scale !== 1) ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, flat.width, flat.height);
  return flat;
}

/** True for the error a tainted canvas (pixels from another origin without CORS) throws on export */
export const isTainted = (err: unknown) => typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "SecurityError";

/** True when `canvas` already draws on an opaque 2D context ({ alpha: false }), so it has no alpha to flatten */
function isOpaque(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  return !!ctx && typeof ctx.getContextAttributes === "function" && ctx.getContextAttributes().alpha === false;
}

/**
 * `source` as an RGB PNG (no alpha channel), at `scale` of its size. Null when the browser could not
 * encode it (out of memory). Throws on a tainted canvas (see isTainted), as canvas.toBlob does.
 */
export async function rgbPng(source: HTMLCanvasElement, scale = 1): Promise<Blob | null> {
  // An opaque canvas at full size is encoded as it is; anything else is copied onto an opaque one first
  const flat = scale === 1 && isOpaque(source) ? source : flatCopy(source, scale);
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    try {
      flat.toBlob(resolve, "image/png");
    } catch (err) {
      reject(err);
    }
  });
  if (blob && isRgbPng(new Uint8Array(await blob.slice(0, 26).arrayBuffer()))) return blob;
  // This browser kept an alpha channel (or failed): encode the pixels here
  const ctx = flat.getContext("2d", { alpha: false });
  if (!ctx) return blob;
  try {
    return await encodeRgbPng(flat.width, flat.height, ctx.getImageData(0, 0, flat.width, flat.height).data);
  } catch {
    return null;
  }
}
