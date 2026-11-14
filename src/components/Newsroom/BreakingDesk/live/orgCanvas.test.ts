// Unit checks for the one text box on a desk template (orgCanvas.ts) at a size set by hand (orgSize): the top
// edge stays put while the words change, top and bottom handles do nothing, a corner keeps the opposite corner,
// and placeOrgWords hands back the same object when nothing moved. Run with npm test.
//
// orgCanvas pulls in next/font (through templateFonts) and the LiveDesk component, neither of which loads in
// plain node, and imports with the "@/" alias. The hooks below map "@/" to src/ and stand in small stubs for
// those two. orgCanvas measures words on a canvas; node has no document, so a fake one measures every letter
// at 0.55 of the font size, which is enough for the words to wrap and the box to grow and shrink.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import type { TemplateLayout } from "../TemplateCanvas";
import type { OrgCardTemplate } from "@/lib/socia/types";

const SRC = new URL("../../../../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const SRC = ${JSON.stringify(SRC)};
export async function resolve(specifier, context, next) {
  if (specifier === "next/font/google") return { url: "stub:font?" + encodeURIComponent(context.parentURL), shortCircuit: true };
  if (/\\/LiveDesk$/.test(specifier)) return { url: "stub:livedesk", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const href = new URL(specifier.slice(2), SRC).href;
    try { return await next(href + ".ts", context); } catch {}
    return next(href + "/index.ts", context);
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url === "stub:livedesk") return { format: "module", source: "export const apiFileUrl = (u) => u;", shortCircuit: true };
  if (url.startsWith("stub:font?")) {
    // Every face the importer asks next/font/google for, as a loader that returns a family name
    const parent = readFileSync(fileURLToPath(decodeURIComponent(url.slice("stub:font?".length))), "utf8");
    const names = [...parent.matchAll(/import\\s*\\{([^}]*)\\}\\s*from\\s*"next\\/font\\/google"/g)].flatMap((m) => m[1].split(",").map((n) => n.trim()).filter(Boolean));
    const source = names.map((n) => "export const " + n + " = () => ({ style: { fontFamily: '" + n + "' }, variable: '', className: '' });").join("\\n");
    return { format: "module", source, shortCircuit: true };
  }
  const out = await next(url, context);
  if (!url.startsWith(SRC) || !/\\.ts$/.test(url) || out.source == null) return out;
  // Types imported without "import type" (cardRender.ts) are elided by the bundler but not by node's type
  // stripping: an import from "@/types/..." naming no ALL_CAPS constant is made a type import
  const source = String(out.source).replace(/^import \\{([^}]*)\\} from "(@\\/types\\/[^"]+)";/gm, (all, names, from) =>
    /\\b[A-Z][A-Z0-9_]+\\b/.test(names) ? all : "import type {" + names + "} from " + JSON.stringify(from) + ";",
  );
  return { ...out, source };
}`),
  import.meta.url,
);

// A canvas that measures each letter at 0.55 of the font size
const fakeCtx = {
  font: "10px sans-serif",
  measureText(text: string) {
    const px = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10);
    const width = text.length * px * 0.55;
    return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  },
};
(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => fakeCtx }) };

const { ORG_BODY_ID, ORG_DATE_ID, orgBlockRect, orgLayout, placeOrgWords, setOrgBlock, setOrgSize } = await import("./orgCanvas");
const { DATE_STROKE } = await import("./cardDate");

const T: OrgCardTemplate = {
  slug: "test",
  label: "Test",
  platform: "x",
  backgroundUrl: "/card-templates/test.png",
  width: 1080,
  height: 1080,
  layout: { date: null, box: { x: 0.08, y: 0.3, w: 0.84, h: 0.5 }, headline: { color: "#FFFFFF" }, body: { color: "#FFFFFF" }, fontMinPx: 24, fontMaxPx: 72 },
  defaultFor: [],
  updatedAt: "2026-11-14T00:00:00Z",
};
const BASE = { headline: "", fontScale: 1, textY: 0.5, align: "left", color: "auto", fit: "cover", backdrop: "blur", bgZoom: 1, bgX: 0, bgY: 0, template: "classic" } as TemplateLayout;
const HEADLINE = "Jaipur: officer sent to wait for orders";
const STORY = "The municipal board relieved him of charge on administrative grounds and asked him to report to the directorate.";
const fresh = () => orgLayout(T, { headline: HEADLINE, body: STORY }, BASE);
const withStory = (l: TemplateLayout, text: string) => ({ ...l, layers: (l.layers ?? []).map((x) => (x.id === ORG_BODY_ID ? { ...x, text } : x)) });
const rect = (l: TemplateLayout) => {
  const r = orgBlockRect(l, T);
  assert.ok(r, "the card has a text box");
  return r;
};
const close = (a: number, b: number, msg: string, tol = 0.6) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("placeOrgWords returns the same object when nothing changed", () => {
  const placed = placeOrgWords(fresh(), T);
  assert.equal(placeOrgWords(placed, T), placed, "template's box");
  const sized = setOrgSize(fresh(), T, 40);
  assert.equal(placeOrgWords(sized, T), sized, "size set by hand");
  const typed = placeOrgWords(withStory(sized, STORY + " " + STORY), T);
  assert.equal(placeOrgWords(typed, T), typed, "after typing");
});

test("setOrgSize keeps the box's top edge", () => {
  const before = rect(placeOrgWords(fresh(), T));
  const small = setOrgSize(fresh(), T, 30);
  close(rect(small).y, before.y, "top after the first size");
  close(rect(small).w, before.w, "width after the first size");
  const big = setOrgSize(small, T, 60);
  close(rect(big).y, before.y, "top after a second size");
  assert.ok(rect(big).h > rect(small).h, "a bigger size makes a taller box");
});

test("typing keeps the top edge and grows or shrinks the box at the bottom", () => {
  const sized = setOrgSize(fresh(), T, 40);
  const start = rect(sized);
  const longer = placeOrgWords(withStory(sized, STORY + " " + STORY + " " + STORY), T);
  close(rect(longer).y, start.y, "top after typing more");
  assert.ok(rect(longer).h > start.h + 10, "more words make the box taller");
  const shorter = placeOrgWords(withStory(longer, "Short."), T);
  close(rect(shorter).y, start.y, "top after deleting words");
  assert.ok(rect(shorter).h < start.h, "fewer words make the box shorter");
});

test("a top or bottom handle drag changes nothing at a size set by hand", () => {
  const sized = setOrgSize(fresh(), T, 40);
  const r = rect(sized);
  assert.equal(setOrgBlock(sized, T, { ...r, y: r.y - 60, h: r.h + 60 }), sized, "top handle");
  assert.equal(setOrgBlock(sized, T, { ...r, h: r.h + 80 }), sized, "bottom handle");
  assert.equal(setOrgBlock(sized, T, { ...r, h: r.h - 30 }), sized, "bottom handle up");
});

test("a side handle re-wraps at the same size and keeps the top and the opposite side", () => {
  const sized = setOrgSize(fresh(), T, 40);
  const r = rect(sized);
  const east = setOrgBlock(sized, T, { ...r, w: r.w - 200 });
  assert.equal(east.orgSize, sized.orgSize);
  close(rect(east).x, r.x, "left edge on an east drag");
  close(rect(east).y, r.y, "top on an east drag");
  assert.ok(rect(east).h > r.h, "narrower box wraps to more lines");
  const west = setOrgBlock(sized, T, { ...r, x: r.x + 200, w: r.w - 200 });
  close(rect(west).x + rect(west).w, r.x + r.w, "right edge on a west drag");
});

test("a corner drag scales the size with the width and keeps the opposite corner", () => {
  const sized = setOrgSize(fresh(), T, 40);
  const r = rect(sized);
  const right = r.x + r.w;
  const bottom = r.y + r.h;
  const shrink = 0.75;
  const w = r.w * shrink;
  const dh = 30;

  const se = setOrgBlock(sized, T, { x: r.x, y: r.y, w, h: r.h - dh });
  close(se.orgSize!, 40 * shrink, "size follows the width", 0.01);
  close(rect(se).x, r.x, "se: left");
  close(rect(se).y, r.y, "se: top");

  const sw = setOrgBlock(sized, T, { x: right - w, y: r.y, w, h: r.h - dh });
  close(rect(sw).x + rect(sw).w, right, "sw: right");
  close(rect(sw).y, r.y, "sw: top");

  const ne = setOrgBlock(sized, T, { x: r.x, y: r.y + dh, w, h: r.h - dh });
  close(rect(ne).x, r.x, "ne: left");
  close(rect(ne).y + rect(ne).h, bottom, "ne: bottom");

  const nw = setOrgBlock(sized, T, { x: right - w, y: r.y + dh, w, h: r.h - dh });
  close(rect(nw).x + rect(nw).w, right, "nw: right");
  close(rect(nw).y + rect(nw).h, bottom, "nw: bottom");

  // The words sit where placing them afresh in that box would put them
  for (const l of [se, sw, ne, nw]) assert.equal(placeOrgWords(l, T), l);
});

test("without a size set by hand a resize takes the box as dragged", () => {
  const placed = placeOrgWords(fresh(), T);
  const r = rect(placed);
  const box = { x: r.x + 20, y: r.y - 40, w: r.w - 100, h: r.h + 60 };
  const resized = setOrgBlock(placed, T, box);
  assert.equal(resized.orgSize, undefined);
  assert.deepEqual(resized.orgBlock, { x: box.x / 1080, y: box.y / 1080, w: box.w / 1080, h: box.h / 1080 });
  const moved = setOrgBlock(resized, T, { ...rect(resized), x: rect(resized).x + 30 });
  close(rect(moved).x, rect(resized).x + 30, "a move shifts the box");
  close(rect(moved).h, rect(resized).h, "a move keeps its height");
});

test("the editor's date is stroked in its own colour as wide as the X card's (cardDate.DATE_STROKE)", () => {
  const dated: OrgCardTemplate = { ...T, layout: { ...T.layout, date: { x: 0.537, y: 0.186, w: 0.421, h: 0.052, color: "#000000", format: "Date:DD/MM/YYYY" } } };
  const date = orgLayout(dated, { headline: HEADLINE, body: STORY }, BASE).layers?.find((l) => l.id === ORG_DATE_ID);
  assert.ok(date && date.size, "the card has a date box");
  assert.equal(date.style.strokeColor, "#000000");
  // cardRender strokes strokeWidth × u × 2 px wide (u = 1 on a 1080 card); backgroundCard strokes DATE_STROKE × size
  close((date.style.strokeWidth ?? 0) * 2, DATE_STROKE * date.size, "stroke width", 1e-9);
});
