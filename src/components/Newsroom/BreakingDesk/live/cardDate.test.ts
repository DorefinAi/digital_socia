// Unit checks for cardDate.ts with a stand-in canvas context whose font measures every character alike.
// The repo has no test runner; run with Node 22+ (type stripping) and a resolver that accepts extensionless
// TypeScript imports, as srt.test.ts:
//   node --import <register-ts-resolve.mjs> --test src/components/Newsroom/BreakingDesk/live/cardDate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitDate } from "./cardDate";

/** Each character 0.55 font sizes wide, ink flush with the advance; capitals 0.7 tall, 0.4 above "middle" */
function fakeContext() {
  const ctx = {
    font: "",
    textAlign: "center" as CanvasTextAlign,
    textBaseline: "middle" as CanvasTextBaseline,
    measureText(text: string) {
      const size = Number(/([\d.]+)px/.exec(ctx.font)?.[1] ?? 0);
      const width = text.length * 0.55 * size;
      const ascent = (ctx.textBaseline === "middle" ? 0.4 : 0.7) * size;
      return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width, actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: 0 } as TextMetrics;
    },
  };
  return ctx;
}

const font = (px: number) => `700 ${px}px Mardoto`;
const TEXT = "Date:09/11/2026";

test("a date that fits is set at the tag's height, inked from 3.7% in, capitals' middle a little above the tag's", () => {
  const ctx = fakeContext();
  const slot = { x: 580, y: 200, w: 600, h: 56 };
  const at = fitDate(ctx as unknown as CanvasRenderingContext2D, TEXT, slot, font);
  assert.equal(at.size, 56);
  assert.ok(Math.abs(at.originX - (580 + 600 * 0.037)) < 1e-9);
  // Capitals 0.7 × 56 tall, their middle 3.5% of the tag's height above its middle
  const capMiddle = at.baseline - (0.7 * 56) / 2;
  assert.ok(Math.abs(capMiddle - (200 + 56 * 0.465)) < 1e-9);
  // The same ink top whether drawn on the alphabetic baseline or on the "middle" line
  assert.ok(Math.abs(at.middleY - 0.4 * 56 - (at.baseline - 0.7 * 56)) < 1e-9);
  assert.equal(at.advance, TEXT.length * 0.55 * 56);
  // The caller's alignment is left as it was
  assert.equal(ctx.textAlign, "center");
  assert.equal(ctx.textBaseline, "middle");
});

test("a date too wide for the tag steps down until its ink fits inside the margins", () => {
  const ctx = fakeContext();
  const slot = { x: 0, y: 0, w: 455, h: 56 };
  const at = fitDate(ctx as unknown as CanvasRenderingContext2D, TEXT, slot, font);
  const ink = TEXT.length * 0.55 * at.size;
  assert.ok(at.size < 56);
  assert.ok(ink <= 455 * (1 - 0.037 - 0.022));
  assert.ok(TEXT.length * 0.55 * (at.size + 1) > 455 * (1 - 0.037 - 0.022));
});
