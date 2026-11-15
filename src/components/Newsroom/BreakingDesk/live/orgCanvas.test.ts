// Unit checks for the one text box on a desk template (orgCanvas.ts) at a size set by hand (orgSize): the top
// edge stays put while the words change, a side handle keeps the size and re-wraps, a corner scales the words and
// keeps the opposite corner, a height-only change is ignored,
// placeOrgWords hands back the same object when nothing moved, and an old two-box draft becomes one box. Also
// blockText's split of the one typed text. Run with npm test.
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

const { ORG_BODY_ID, ORG_DATE_ID, isOneBox, orgBlockRect, orgLayout, placeOrgWords, setOrgBlock, setOrgSize, toOneBox } = await import("./orgCanvas");
const { DATE_STROKE } = await import("./cardDate");
const { joinBlockText, splitBlockText } = await import("../blockText");

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

test("a change of the height alone (no top or bottom handle on a text box) leaves the layout as it is", () => {
  const sized = setOrgSize(fresh(), T, 40);
  const r = rect(sized);
  assert.equal(setOrgBlock(sized, T, { ...r, h: r.h * 1.5 }), sized, "bottom edge, read from the box");
  assert.equal(setOrgBlock(sized, T, { ...r, y: r.y - r.h * 0.25, h: r.h * 1.25 }), sized, "top edge, read from the box");
  assert.equal(setOrgBlock(sized, T, { ...r, h: r.h * 0.5 }, "s"), sized, "named bottom handle");
  assert.equal(setOrgBlock(sized, T, { ...r, y: r.y + 20, h: r.h - 20 }, "n"), sized, "named top handle");
});

test("a side handle keeps the size, re-wraps the words and keeps the top and the opposite side", () => {
  const sized = setOrgSize(fresh(), T, 40);
  const r = rect(sized);
  for (const handle of [undefined, "e"] as const) {
    const narrow = setOrgBlock(sized, T, { ...r, w: r.w * 0.5 }, handle);
    assert.equal(narrow.orgSize, 40, `narrower (${handle ?? "read"}): size kept`);
    close(rect(narrow).x, r.x, "left edge on an east drag");
    close(rect(narrow).y, r.y, "top on an east drag");
    close(rect(narrow).w, r.w * 0.5, "width as dragged");
    assert.ok(rect(narrow).h > r.h + 10, "a narrower box re-wraps into more lines: taller");
    assert.equal(placeOrgWords(narrow, T), narrow, "the words sit where placing them afresh would put them");
  }
  const narrow = setOrgBlock(sized, T, { ...r, w: r.w * 0.5 }, "e");
  const n = rect(narrow);
  const wider = setOrgBlock(narrow, T, { ...n, w: n.w * 1.6 }, "e");
  assert.equal(wider.orgSize, 40, "wider: size kept");
  close(rect(wider).y, n.y, "top on a wider drag");
  assert.ok(rect(wider).h < n.h - 10, "a wider box takes fewer lines: shorter");
  const west = setOrgBlock(sized, T, { ...r, x: r.x + 200, w: r.w - 200 }, "w");
  assert.equal(west.orgSize, 40, "west drag keeps the size");
  close(rect(west).x + rect(west).w, r.x + r.w, "right edge on a west drag");
  close(rect(west).y, r.y, "top on a west drag");
});

test("typing after a side drag keeps the size and the top while the height follows the words", () => {
  const sized = setOrgSize(fresh(), T, 40);
  const r = rect(sized);
  const narrow = setOrgBlock(sized, T, { ...r, w: r.w * 0.6 }, "e");
  const n = rect(narrow);
  const longer = placeOrgWords(withStory(narrow, STORY + " " + STORY), T);
  assert.equal(longer.orgSize, 40, "size kept while typing");
  close(rect(longer).y, n.y, "top kept while typing");
  close(rect(longer).w, n.w, "width kept while typing");
  assert.ok(rect(longer).h > n.h + 10, "more words: taller");
  const shorter = placeOrgWords(withStory(longer, "Short."), T);
  close(rect(shorter).y, n.y, "top kept after deleting words");
  assert.ok(rect(shorter).h < n.h, "fewer words: shorter");
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

test("a named corner scales the size even when the box's height did not change", () => {
  const sized = setOrgSize(fresh(), T, 40);
  const r = rect(sized);
  const ne = setOrgBlock(sized, T, { ...r, w: r.w * 0.5 }, "ne");
  close(ne.orgSize!, 20, "half as wide, half the size", 0.01);
  close(rect(ne).x, r.x, "ne: left");
  close(rect(ne).y + rect(ne).h, r.y + r.h, "ne: bottom");
});

test("without a size set by hand a resize starts from the fitted size", () => {
  const placed = placeOrgWords(fresh(), T);
  const fitted = placed.layers!.find((l) => l.id === ORG_BODY_ID)!.size;
  const r = rect(placed);
  const corner = setOrgBlock(placed, T, { x: r.x, y: r.y, w: r.w * 0.8, h: r.h * 0.8 });
  close(corner.orgSize!, fitted * 0.8, "corner", 0.01);
  const side = setOrgBlock(placed, T, { ...r, w: r.w * 0.9 });
  close(side.orgSize!, fitted, "a side keeps the fitted size", 0.01);
  const moved = setOrgBlock(corner, T, { ...rect(corner), x: rect(corner).x + 30 });
  close(rect(moved).x, rect(corner).x + 30, "a move shifts the box");
  close(rect(moved).h, rect(corner).h, "a move keeps its height");
  assert.equal(moved.orgSize, corner.orgSize, "a move keeps the size");
});

test("a draft saved before the one box becomes one box", () => {
  const one = placeOrgWords(fresh(), T);
  // As saved before: the story at the older line pitch, the heading at a size of its own
  const legacy: TemplateLayout = { ...one, fontScale: one.fontScale * 1.3, layers: one.layers!.map((l) => (l.id === ORG_BODY_ID ? { ...l, style: { ...l.style, lineHeight: 1.49 } } : l)) };
  assert.equal(isOneBox(legacy), false);
  const migrated = toOneBox(legacy, T);
  assert.equal(isOneBox(migrated), true);
  assert.equal(placeOrgWords(migrated, T), migrated, "placed as one block");
  assert.equal(toOneBox(migrated, T), migrated, "one box already");
  // The size control now changes heading and story together
  const bigger = setOrgSize(migrated, T, 50);
  const story = bigger.layers!.find((l) => l.id === ORG_BODY_ID)!;
  close(story.size, 50, "story size", 0.01);
  close(bigger.fontScale * 56, 50, "heading size (ORG_BASE_SIZE 56)", 0.01);
});

test("heading and story typed as one text split back at the first blank line", () => {
  assert.equal(joinBlockText("Head", "Story"), "Head\n\nStory");
  assert.deepEqual(splitBlockText("Head\n\nStory one.\n\nTwo."), { headline: "Head", body: "Story one.\n\nTwo." });
  assert.deepEqual(splitBlockText("Line one\nline two\n\nStory"), { headline: "Line one\nline two", body: "Story" });
  assert.deepEqual(splitBlockText("Head\nStory"), { headline: "Head", body: "Story" });
  assert.deepEqual(splitBlockText("Head only"), { headline: "Head only", body: "" });
  assert.deepEqual(splitBlockText("\n\nStory"), { headline: "", body: "Story" });
  assert.deepEqual(splitBlockText("Head\r\n\r\nStory"), { headline: "Head", body: "Story" });
});

test("the editor's date is stroked in its own colour as wide as the X card's (cardDate.DATE_STROKE)", () => {
  const dated: OrgCardTemplate = { ...T, layout: { ...T.layout, date: { x: 0.537, y: 0.186, w: 0.421, h: 0.052, color: "#000000", format: "Date:DD/MM/YYYY" } } };
  const date = orgLayout(dated, { headline: HEADLINE, body: STORY }, BASE).layers?.find((l) => l.id === ORG_DATE_ID);
  assert.ok(date && date.size, "the card has a date box");
  assert.equal(date.style.strokeColor, "#000000");
  // cardRender strokes strokeWidth × u × 2 px wide (u = 1 on a 1080 card); backgroundCard strokes DATE_STROKE × size
  close((date.style.strokeWidth ?? 0) * 2, DATE_STROKE * date.size, "stroke width", 1e-9);
});
