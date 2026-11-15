// Unit checks for Canva-style resizing of the card designer's extra text boxes and headline (textResize.ts): a side
// handle keeps the size and re-wraps with the top and the opposite side kept, a corner scales the size with the
// width and keeps the opposite corner, a height-only change is ignored. The words are measured by a stand-in: a
// fixed number of characters per line at 0.55 of the size, one line at 1.2 of the size. Run with npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardLayout, CardTextLayer } from "@/types/newsroom";
import { TEXT_HANDLES, anchoredTop, resizeHeadline, resizeLayer, resizedTextSize, textResizeKind } from "./textResize";

const card = { W: 1080, H: 1080, u: 1 };
const close = (a: number, b: number, msg: string, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const CHARS = 120;
/** Height of `chars` characters wrapped in `widthPx` at `sizePx` */
const wrapped = (widthPx: number, sizePx: number, chars = CHARS) => Math.ceil(chars / Math.max(1, Math.floor(widthPx / (sizePx * 0.55)))) * sizePx * 1.2;

const layer: CardTextLayer = { id: "a", text: "x".repeat(CHARS), x: 0.5, y: 0.5, width: 0.5, size: 40, style: {} };
const layerBox = (l: CardTextLayer) => {
  const w = l.width * card.W;
  const h = wrapped(w, l.size * card.u);
  return { x: l.x * card.W - w / 2, y: l.y * card.H - h / 2, w, h };
};
const layerHeight = (l: CardTextLayer) => wrapped(l.width * card.W, l.size * card.u);

test("text boxes offer the corners and the sides, never the top or bottom", () => {
  assert.deepEqual([...TEXT_HANDLES].sort(), ["e", "ne", "nw", "se", "sw", "w"]);
  assert.equal(textResizeKind("e"), "side");
  assert.equal(textResizeKind("sw"), "corner");
  assert.equal(textResizeKind("n"), "height");
  close(resizedTextSize(40, "e", 100, 50, { min: 16, max: 240 }), 40, "side keeps", 0);
  close(resizedTextSize(40, "se", 100, 50, { min: 16, max: 240 }), 20, "corner halves", 0);
  close(resizedTextSize(40, "se", 100, 10, { min: 16, max: 240 }), 16, "corner stops at the minimum", 0);
  close(resizedTextSize(10, "se", 100, 50, { min: 16, max: 240 }), 10, "an older size under the minimum stays, never smaller", 0);
  close(resizedTextSize(10, "se", 100, 200, { min: 16, max: 240 }), 20, "and grows from there", 0);
  assert.equal(anchoredTop({ x: 0, y: 100, w: 50, h: 40 }, "ne", 60), 80);
  assert.equal(anchoredTop({ x: 0, y: 100, w: 50, h: 40 }, "se", 60), 100);
});

test("a side handle on a text box keeps the size, re-wraps and keeps the top and the opposite side", () => {
  const start = layerBox(layer);
  const narrow = resizeLayer(layer, "e", start, { ...start, w: start.w * 0.5 }, card, 40, layerHeight);
  const n = layerBox(narrow);
  assert.equal(narrow.size, 40, "size kept");
  assert.equal(narrow.height, undefined, "height follows the words");
  close(n.x, start.x, "left edge kept");
  close(n.y, start.y, "top kept");
  close(n.w, start.w * 0.5, "width as dragged");
  assert.ok(n.h > start.h + 10, "narrower: taller");

  const wide = resizeLayer(narrow, "w", n, { ...n, x: n.x - 200, w: n.w + 200 }, card, 40, layerHeight);
  const r = layerBox(wide);
  assert.equal(wide.size, 40, "size kept on the left side");
  close(r.x + r.w, n.x + n.w, "right edge kept");
  close(r.y, n.y, "top kept");
  assert.ok(r.h < n.h - 10, "wider: shorter");
});

test("a side drag on a box sized by hand starts from the size its words were fitted at, and drops the height", () => {
  const sized: CardTextLayer = { ...layer, height: 0.05 };
  const start = { x: 270, y: 513, w: 540, h: 54 };
  const next = resizeLayer(sized, "e", start, { ...start, w: 600 }, card, 22, layerHeight);
  assert.equal(next.size, 22, "the fitted size, so the words do not jump");
  assert.equal(next.height, undefined);
  close(layerBox(next).y, start.y, "top kept");
});

test("a corner on a text box scales the size with the width and keeps the opposite corner", () => {
  const start = layerBox(layer);
  const se = resizeLayer(layer, "se", start, { ...start, w: start.w * 0.75, h: start.h * 0.5 }, card, 40, layerHeight);
  close(se.size, 30, "size follows the width", 0.001);
  close(layerBox(se).x, start.x, "se: left");
  close(layerBox(se).y, start.y, "se: top");
  const nw = resizeLayer(layer, "nw", start, { x: start.x + start.w * 0.25, y: start.y + 10, w: start.w * 0.75, h: start.h - 10 }, card, 40, layerHeight);
  const b = layerBox(nw);
  close(b.x + b.w, start.x + start.w, "nw: right");
  close(b.y + b.h, start.y + start.h, "nw: bottom");
});

test("a height-only change leaves a text box and the headline as they are", () => {
  const start = layerBox(layer);
  assert.equal(resizeLayer(layer, "s", start, { ...start, h: start.h * 2 }, card, 40, layerHeight), layer);
  const layout = { headline: "x".repeat(CHARS), fontScale: 1 } as CardLayout;
  assert.equal(resizeHeadline(layout, "n", start, { ...start, h: 10 }, card, { width: 1000, baseSize: 60 }, 60, () => 100), layout);
});

test("the headline: a side keeps its size and fits the box to its words, a corner scales it", () => {
  const area = { width: 1000, baseSize: 60 };
  const layout = { headline: "x".repeat(CHARS), fontScale: 1, textY: 0.5 } as CardLayout;
  const heightOf = (l: CardLayout) => wrapped((l.textWidth ?? 1) * area.width, area.baseSize * l.fontScale);
  const start = { x: 40, y: 600, w: 1000, h: heightOf({ ...layout, textWidth: 1 }) };

  const side = resizeHeadline(layout, "e", start, { ...start, w: 500 }, card, area, 60, heightOf);
  assert.equal(side.fontScale, 1, "size kept");
  close(side.textWidth!, 0.5, "width as dragged", 0.001);
  const h = side.textHeight! * card.H;
  close(h, heightOf(side) + 1, "box as tall as its words");
  assert.ok(h > start.h + 10, "narrower: taller");
  close(side.textY * card.H - h / 2, start.y, "top kept");
  close(side.textX! * card.W, start.x + 250, "left edge kept");

  const fitted = resizeHeadline({ ...layout, textHeight: 0.1 }, "e", start, { ...start, w: 800 }, card, area, 45, heightOf);
  close(fitted.fontScale, 0.75, "a box sized by hand starts from the fitted size", 0.001);

  const ne = resizeHeadline(layout, "ne", start, { ...start, y: start.y + 20, w: 800, h: start.h - 20 }, card, area, 60, heightOf);
  close(ne.fontScale, 0.8, "corner scales with the width", 0.001);
  const nh = ne.textHeight! * card.H;
  close(ne.textY * card.H + nh / 2, start.y + start.h, "ne: bottom kept");
});
