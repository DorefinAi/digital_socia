// Unit checks for rgbPng.ts: the fallback encoder writes a valid 8-bit RGB PNG with no alpha channel.
// The repo has no test runner; run with Node 22+ (type stripping) and a resolver that accepts extensionless
// TypeScript imports, as srt.test.ts:
//   node --import <register-ts-resolve.mjs> --test src/components/Newsroom/BreakingDesk/live/rgbPng.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { encodeRgbPng, isRgbPng } from "./rgbPng";

/** The chunks of a PNG, by type (IDAT parts joined) */
function chunks(png: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Record<string, Uint8Array> = {};
  for (let at = 8; at < png.length; ) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + len);
    out[type] = out[type] ? new Uint8Array([...out[type], ...data]) : data;
    at += 12 + len;
  }
  return out;
}

test("RGBA pixels come out as an RGB PNG, see-through pixels over black", async () => {
  // 3 × 2: red, green, blue / white, half-transparent white, fully transparent yellow
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 128, 255, 255, 0, 0]);
  const png = new Uint8Array(await (await encodeRgbPng(3, 2, rgba)).arrayBuffer());
  assert.ok(isRgbPng(png));
  const c = chunks(png);
  const ihdr = new DataView(c.IHDR.buffer, c.IHDR.byteOffset);
  assert.equal(ihdr.getUint32(0), 3);
  assert.equal(ihdr.getUint32(4), 2);
  assert.equal(c.IHDR[8], 8);
  assert.equal(c.IHDR[9], 2);
  assert.ok(c.IEND);
  // Undo the Sub filter row by row
  const raw = inflateSync(c.IDAT);
  const pixels: number[] = [];
  for (let y = 0; y < 2; y++) {
    const row = raw.subarray(y * 10, y * 10 + 10);
    assert.equal(row[0], 1);
    const line = Array.from(row.subarray(1));
    for (let i = 3; i < line.length; i++) line[i] = (line[i] + line[i - 3]) & 0xff;
    pixels.push(...line);
  }
  assert.deepEqual(pixels, [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 128, 128, 128, 0, 0, 0]);
});

test("isRgbPng tells RGB from RGBA and from other files", () => {
  const head = (colourType: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 56, 0, 0, 4, 56, 8, colourType]);
  assert.equal(isRgbPng(head(2)), true);
  assert.equal(isRgbPng(head(6)), false);
  assert.equal(isRgbPng(new Uint8Array([0xff, 0xd8, 0xff])), false);
});
