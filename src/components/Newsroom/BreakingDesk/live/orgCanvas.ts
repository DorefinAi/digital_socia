// The desk's shared X templates (org-card-templates-contract.md) as the design canvas's background.
// A template's picture fills the card at its own size; the headline, the story and today's date become
// ordinary text on it (the headline, and two text boxes), placed from the template's layout. The headline and
// the story are one text box on the card (CardLayout.orgBlock), always placed together as one block. This file
// holds the one decoded copy of each picture and the maths that places and re-places the words.

import { useEffect, useMemo, useState } from "react";
import type { CardTextLayer, CardTextStyle } from "@/types/newsroom";
import type { DrawableCardTemplate, OrgCardTemplate } from "@/lib/socia/types";
import type { TemplateLayout } from "../TemplateCanvas";
import { type CardBackdrop, ORG_BASE_SIZE } from "../cardRender";
import { ORG_CARD_FONT, ORG_DATE_FONT, fontById, nearestWeight } from "../templateFonts";
import { apiFileUrl } from "./LiveDesk";
import { fontsReady, istDate, loadImage } from "./backgroundCard";
import { cardBodyText } from "../cardWords";
import { CARD_GAP_LINES, CARD_LINE, LEGACY_CARD_LINE, type PxRect, V3_CARD_HANG_TOP, V3_CARD_LINE, cardBlockTop, cardTextArea, largestFit, legacyTextArea } from "./cardFit";
import { fitDate } from "./cardDate";

/** The text box that holds the story under the headline */
export const ORG_BODY_ID = "org-body";
/** The text box in the template's date slot */
export const ORG_DATE_ID = "org-date";

// ─── One decoded picture per template version, shared by the canvas, the picker and the feed ────────
const images = new Map<string, Promise<HTMLImageElement>>();

// ─── Mardoto and Noto Devanagari before measuring: a card placed on a fallback face would be sized wrong ──────
let fontsIn = typeof document === "undefined";
let fontsWait: Promise<void> | null = null;
/**
 * Resolves once the card faces (both weights) are in, or have failed, or after 4 s at most: without the TTFs
 * the card is placed on the fallback faces, as before.
 */
export function orgFontsReady(): Promise<void> {
  if (!fontsWait) {
    fontsWait = Promise.race([fontsReady(), new Promise<void>((done) => setTimeout(done, 4000))])
      .catch(() => undefined)
      .then(() => {
        fontsIn = true;
      });
  }
  return fontsWait;
}

/** True once orgFontsReady() has settled: place words on a desk template only then. */
export function useOrgFontsReady(): boolean {
  const [ready, setReady] = useState(fontsIn);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void orgFontsReady().then(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

/** The template's picture, fetched with the session and decoded once. A failed load is tried again next time. */
export function templateImage(backgroundUrl: string): Promise<HTMLImageElement> {
  // The card's faces (Mardoto, Noto Sans Devanagari for Hindi) start downloading with the first template, so the words are measured in them
  void orgFontsReady();
  let p = images.get(backgroundUrl);
  if (!p) {
    p = loadImage(apiFileUrl(backgroundUrl));
    images.set(backgroundUrl, p);
    p.catch(() => images.delete(backgroundUrl));
    // A few versions are plenty; old ones (replaced pictures) drop out first
    if (images.size > 16) images.delete(images.keys().next().value as string);
  }
  return p;
}

/** The decoded picture for `backgroundUrl` (null while it loads), and its load error. */
export function useTemplateImage(backgroundUrl: string | null | undefined) {
  const [state, setState] = useState<{ url: string; image: HTMLImageElement | null; error: string | null; attempt: number }>({ url: "", image: null, error: null, attempt: 0 });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!backgroundUrl) return;
    let cancelled = false;
    templateImage(backgroundUrl).then(
      (image) => !cancelled && setState({ url: backgroundUrl, image, error: null, attempt }),
      (err: Error) => !cancelled && setState({ url: backgroundUrl, image: null, error: err.message, attempt }),
    );
    return () => {
      cancelled = true;
    };
  }, [backgroundUrl, attempt]);
  const current = !!backgroundUrl && state.url === backgroundUrl;
  return {
    image: current ? state.image : null,
    error: current && state.attempt === attempt ? state.error : null,
    retry: () => setAttempt((n) => n + 1),
  };
}

/** The canvas's backdrop: the same object while size and picture stay, so the card is not repainted for nothing. */
export function useBackdrop(w: number, h: number, image: HTMLImageElement | null): CardBackdrop | null {
  return useMemo(() => (w && h ? { w, h, image } : null), [w, h, image]);
}

// ─── Placing the words ───────────────────────────────────────────────────────────────────────────────

/** Headline size against the story's: the desk's cards set both bold at the same size */
const HEAD_RATIO = 1;
// Line pitch, gap and padding are cardFit's, shared with backgroundCard.ts so every card path matches
const HEAD_LINE = CARD_LINE;
const BODY_LINE = CARD_LINE;
/** Space between headline and story, in story lines: one blank line, as the desk's cards */
const GAP = CARD_GAP_LINES;
/** Boxes are planned this many px taller than their lines, so the card's own fit never shrinks the words */
const SLACK_PX = 1;

// Headline, story and date are Mardoto Bold (Hindi letters from Noto Sans Devanagari Bold), centred (the
// headline's look is cardRender.ORG_HEADLINE)
export const BODY_STYLE: CardTextStyle = { font: ORG_CARD_FONT, weight: 700, align: "center", lineHeight: BODY_LINE, shadow: 0 };
// Line height 1: the date's box is one line tall (dateBox), and a taller line would make the
// card shrink it to fit the box, smaller than backgroundCard.ts draws it
const DATE_STYLE: CardTextStyle = { font: ORG_DATE_FONT, weight: 700, align: "center", lineHeight: 1, shadow: 0 };
/** The fonts a fresh card on a desk template is measured and drawn with */
const ORG_FONTS = { head: ORG_CARD_FONT, body: ORG_CARD_FONT, date: ORG_DATE_FONT };

type Words = { headline: string; body: string };
type Frame = { W: number; H: number; u: number };

const frameOf = (t: DrawableCardTemplate): Frame => {
  const W = t.width || 1080;
  const H = t.height || 1080;
  return { W, H, u: Math.min(W, H) / 1080 };
};

let measurer: CanvasRenderingContext2D | null = null;
const measure = () => {
  if (!measurer && typeof document !== "undefined") measurer = document.createElement("canvas").getContext("2d");
  return measurer;
};

// A layer without its own font draws in the desk-template face (Mardoto), so it is measured in it too; measuring
// in the general fallback (Noto, wider) sized the date about 10% under its slot and the words under their box
const fontFor = (fontId: string | undefined, weight: number, px: number) => {
  const font = fontById(fontId ?? ORG_CARD_FONT);
  return `${nearestWeight(font, weight)} ${px}px ${font.family}, "Nirmala UI", sans-serif`;
};

/** Lines `text` wraps to at the current font (words only, as the card's own wrapping). */
function lineCount(ctx: CanvasRenderingContext2D, text: string, width: number): number {
  let count = 0;
  for (const paragraph of text.replace(/\*\*/g, "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      count += 1;
      continue;
    }
    const space = ctx.measureText(" ").width;
    let line = 0;
    count += 1;
    for (const word of words) {
      const w = ctx.measureText(word).width;
      if (line && line + space + w > width) {
        count += 1;
        line = w;
      } else line += (line ? space : 0) + w;
    }
  }
  return count;
}

interface Fit {
  /** Story size in canvas px; the headline is HEAD_RATIO times it */
  size: number;
  headH: number;
  bodyH: number;
}

/** Faces and weights the words are measured in: the ones they are drawn in (unset weights draw bold) */
export interface OrgFonts {
  head?: string;
  body?: string;
  date?: string;
  headWeight?: number;
  bodyWeight?: number;
}

/** The faces a card's heading, story and date are drawn in (an unset heading face is Mardoto on a desk template) */
export function orgFontsOf(layout: TemplateLayout): OrgFonts {
  const body = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  return {
    head: layout.headlineStyle?.font ?? ORG_CARD_FONT,
    body: body?.style.font,
    date: layout.layers?.find((l) => l.id === ORG_DATE_ID)?.style.font,
    headWeight: layout.headlineStyle?.weight,
    bodyWeight: body?.style.weight,
  };
}

/** The room the block of words is laid out in at a size, in card px (cardFit.cardTextArea, or a box set by hand) */
type AreaAt = (size: number) => PxRect;

/** Largest size between `minPx` and `maxPx` at which headline and story, both measured, fit the room. */
function fitWords(words: Words, areaAt: AreaAt, minPx: number, maxPx: number, fonts: OrgFonts): Fit {
  const width = areaAt(0).w;
  const ctx = measure();
  const headline = words.headline.trim();
  const body = words.body.trim();
  const at = (size: number): Fit => {
    if (!ctx) return { size, headH: headline ? size * HEAD_RATIO * HEAD_LINE : 0, bodyH: body ? size * BODY_LINE * 3 : 0 };
    ctx.font = fontFor(fonts.head, fonts.headWeight ?? 700, size * HEAD_RATIO);
    const headH = headline ? lineCount(ctx, headline, width) * size * HEAD_RATIO * HEAD_LINE : 0;
    ctx.font = fontFor(fonts.body, fonts.bodyWeight ?? BODY_STYLE.weight ?? 700, size);
    const bodyH = body ? lineCount(ctx, body, width) * size * BODY_LINE : 0;
    return { size, headH, bodyH };
  };
  // The largest size whose block fits the room, in half pixels (cardFit.largestFit, as backgroundCard.ts)
  const size = largestFit(minPx, maxPx, (px) => areaAt(px).h, (px) => blockHeight(at(px)));
  // Too long even at the smallest size: the story takes what is left and shrinks further on the card
  return at(size ?? Math.max(6, Math.min(minPx, maxPx)));
}

/** Heading, the blank line and story, as one block */
const blockHeight = (f: Fit) => f.headH + f.bodyH + (f.headH && f.bodyH ? GAP * f.size * BODY_LINE : 0);

/** Where the headline, the story and the date go on a template, in the layout's own terms. */
export interface Placement {
  head: Pick<TemplateLayout, "textX" | "textY" | "textWidth" | "textHeight" | "fontScale">;
  body: Pick<CardTextLayer, "x" | "y" | "width" | "height" | "size">;
  date: Pick<CardTextLayer, "x" | "y" | "width" | "height" | "size"> | null;
}

/** The template's box in card px */
const rawBox = (t: DrawableCardTemplate, f: Frame): PxRect => {
  const b = t.layout.box;
  return { x: b.x * f.W, y: b.y * f.H, w: b.w * f.W, h: b.h * f.H };
};
/** The words' column over the template's box, in card px (cardFit.cardTextArea at no hang) */
const boxPx = (t: DrawableCardTemplate, f: Frame) => cardTextArea(rawBox(t, f));

/**
 * The date box for `text` in the template's date slot (layout shares), sized and placed as backgroundCard.ts
 * draws it (cardDate.fitDate): the box's centre is where the centred line puts the ink in the tag, it is at
 * least the slot's width (never narrower than the line, which would make the card shrink the date) and at
 * least one line tall.
 */
function dateBox(d: { x: number; y: number; w: number; h: number }, f: Frame, text: string, font: string | undefined): NonNullable<Placement["date"]> {
  const slot = { x: d.x * f.W, y: d.y * f.H, w: d.w * f.W, h: d.h * f.H };
  const ctx = measure();
  if (!ctx) return { x: d.x + d.w / 2, y: d.y + d.h / 2, width: d.w, height: d.h, size: slot.h / f.u };
  const at = fitDate(ctx, text, slot, (px) => fontFor(font, DATE_STYLE.weight ?? 700, px));
  const lineH = (at.size * (DATE_STYLE.lineHeight ?? 1)) / f.H;
  return {
    x: (at.originX + at.advance / 2) / f.W,
    y: at.middleY / f.H,
    width: Math.max(d.w, (at.advance + 2) / f.W),
    height: Math.max(d.h, lineH * 1.01),
    size: at.size / f.u,
  };
}

/**
 * Heading and story as one block in the room, as the desk's posts and backgroundCard.ts set them: one size,
 * one blank line between, every line centred across the room and the block centred up and down in it.
 */
function placeBlock(f: Frame, words: Words, fonts: OrgFonts, areaAt: AreaAt, minPx: number, maxPx: number): Pick<Placement, "head" | "body"> {
  const fit = fitWords(words, areaAt, minPx, maxPx, fonts);
  const area = areaAt(fit.size);
  const top = cardBlockTop(area, blockHeight(fit));
  // A pixel of room, so the card's own measuring never finds the words too tall and shrinks them
  const headH = fit.headH ? Math.min(area.h, fit.headH + SLACK_PX) : fit.size * HEAD_RATIO * HEAD_LINE;
  const bodyTop = fit.headH ? top + fit.headH + GAP * fit.size * BODY_LINE : top;
  const bodyH = Math.max(fit.size * BODY_LINE, Math.min(area.y + area.h - bodyTop, fit.bodyH ? fit.bodyH + SLACK_PX : fit.size * BODY_LINE));
  const cx = (area.x + area.w / 2) / f.W;
  return {
    head: { textX: cx, textY: (top + headH / 2) / f.H, textWidth: area.w / f.W, textHeight: headH / f.H, fontScale: (fit.size * HEAD_RATIO) / (ORG_BASE_SIZE * f.u) },
    body: { x: cx, y: (bodyTop + bodyH / 2) / f.H, width: area.w / f.W, height: bodyH / f.H, size: fit.size / f.u },
  };
}

/** The template's own room at a size: its box, padded across, its leading hanging over top and bottom */
const templateArea = (t: DrawableCardTemplate, f: Frame): AreaAt => (size) => cardTextArea(rawBox(t, f), size);

export function orgPlacement(t: DrawableCardTemplate, words: Words, fonts: OrgFonts = {}): Placement {
  const f = frameOf(t);
  const d = t.layout.date;
  return {
    ...placeBlock(f, words, fonts, templateArea(t, f), t.layout.fontMinPx, t.layout.fontMaxPx),
    date: d ? dateBox(d, f, istDate(d.format), fonts.date) : null,
  };
}

const dateLayer = (t: DrawableCardTemplate, p: NonNullable<Placement["date"]>, style?: CardTextStyle): CardTextLayer => ({
  id: ORG_DATE_ID,
  text: istDate(t.layout.date!.format),
  ...p,
  style: { ...DATE_STYLE, ...style, lineHeight: DATE_STYLE.lineHeight, color: t.layout.date!.color },
});

/** The story's text on the card: its own box when there is one, else the FTP story. */
export const orgBodyText = (layout: TemplateLayout, fallback: string) => layout.layers?.find((l) => l.id === ORG_BODY_ID)?.text ?? cardBodyText(fallback);

/**
 * A fresh card on template `t`: the words placed in its box as one block (heading, a blank line, the story,
 * sized to fill it and centred in it), today's date in its date slot. `base` keeps everything a template does
 * not set (the photo choice, video settings, the operator's own text boxes).
 */
export function orgLayout(t: OrgCardTemplate, words: Words, base: TemplateLayout): TemplateLayout {
  // The story as the desk's posts carry it: one paragraph of all its points (a fresh card, or Reset)
  words = { ...words, body: cardBodyText(words.body) };
  const p = orgPlacement(t, words, ORG_FONTS);
  const own = (base.layers ?? []).filter((l) => l.id !== ORG_BODY_ID && l.id !== ORG_DATE_ID);
  const body: CardTextLayer = { id: ORG_BODY_ID, text: words.body, ...p.body, style: { ...BODY_STYLE, color: t.layout.body.color } };
  return {
    ...base,
    orgTemplate: t.slug,
    orgBlock: undefined,
    headline: words.headline,
    ...p.head,
    align: "center",
    color: t.layout.headline.color,
    headlineStyle: {},
    layers: [body, ...(p.date ? [dateLayer(t, p.date)] : []), ...own],
  };
}

const near = (a: number | undefined, b: number | undefined, tol = 0.004) => a !== undefined && b !== undefined && Math.abs(a - b) <= tol;

/** The heading's and the story's boxes together, in card px (null when the card has no story box or sized heading) */
function unionPx(layout: TemplateLayout, f: Frame): PxRect | null {
  const body = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  if (!body || layout.textHeight === undefined || body.height === undefined) return null;
  const hw = (layout.textWidth ?? 1) * f.W;
  const hx = (layout.textX ?? 0.5) * f.W - hw / 2;
  const hy = (layout.textY - layout.textHeight / 2) * f.H;
  const bw = body.width * f.W;
  const bx = body.x * f.W - bw / 2;
  const by = (body.y - body.height / 2) * f.H;
  const x = Math.min(hx, bx);
  const y = Math.min(hy, by);
  const right = Math.max(hx + hw, bx + bw);
  const bottom = Math.max(hy + layout.textHeight * f.H, by + body.height * f.H);
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * True while the headline and the story still sit where the template put them, in any drawing version: the
 * block centred in the template's room (version 4 on), at the room's top with lines 1.49 sizes apart
 * (versions 2-3), or centred in the narrower padded box (cardFit LEGACY_*, version 1). Their heights follow
 * the words, so they are not compared. Such a card is placed afresh in the template's box.
 */
function untouched(layout: TemplateLayout, t: DrawableCardTemplate): boolean {
  const body = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  if (!body || layout.textHeight === undefined || body.height === undefined) return false;
  const f = frameOf(t);
  const tol = f.H * 0.004;
  const size = body.size * f.u;
  const raw = rawBox(t, f);
  const headTop = (layout.textY - layout.textHeight / 2) * f.H;
  const headBottom = (layout.textY + layout.textHeight / 2) * f.H;
  const bodyTop = (body.y - body.height / 2) * f.H;
  // An empty or hidden story takes no room in the block: the heading alone is centred
  const bodyBottom = body.text.trim() && !body.hidden ? (body.y + body.height / 2) * f.H : headBottom;
  const inColumn = (c: PxRect) =>
    near(layout.textX, (c.x + c.w / 2) / f.W) && near(layout.textWidth, c.w / f.W) && near(body.x, (c.x + c.w / 2) / f.W) && near(body.width, c.w / f.W);
  // No heading: the story starts where the block does
  const storyUnder = (pitch: number) => !layout.headline.trim() || (bodyTop >= headBottom - tol && bodyTop - headBottom <= size * pitch * (GAP + 0.5));
  // Version 4 on: the block centred up and down in the template's room at the story's size
  const now = cardTextArea(raw, size);
  if (inColumn(now) && storyUnder(BODY_LINE) && Math.abs((headTop + bodyBottom) / 2 - (now.y + now.h / 2)) <= tol * 2) return true;
  // Versions 2-3: from the top of the room as it hung then
  if (inColumn(now) && Math.abs(headTop - (raw.y - V3_CARD_HANG_TOP * size)) <= tol && storyUnder(V3_CARD_LINE)) return true;
  // Version 1: the block centred in the padded box (at its top when it filled the box)
  const old = legacyTextArea(raw);
  const centred = Math.abs(headTop - old.y - (old.y + old.h - bodyBottom)) <= tol * 2 || Math.abs(headTop - old.y) <= tol;
  return inColumn(old) && headTop >= old.y - tol && centred && storyUnder(LEGACY_CARD_LINE);
}

/**
 * The card's one text box as set by hand, as shares of the card: its `orgBlock`, or, on a card from before the
 * one box whose heading and story were moved by hand, the two boxes together. Null when the words sit in the
 * template's own box.
 */
function handBlock(layout: TemplateLayout, t: DrawableCardTemplate, legacy = false): TemplateLayout["orgBlock"] | null {
  if (layout.orgBlock) return layout.orgBlock;
  // Since the one box, every move by hand sets orgBlock: without it the words follow the template's box (also
  // after the template's box is edited). Only a draft from before the one box (its story still at the older
  // line pitch) moving to another template is looked at more closely.
  const story = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  if (!legacy || story?.style.lineHeight === BODY_LINE || untouched(layout, t)) return null;
  const f = frameOf(t);
  const u = unionPx(layout, f);
  return u ? { x: u.x / f.W, y: u.y / f.H, w: u.w / f.W, h: u.h / f.H } : null;
}

/**
 * The heading and the story placed as one block in the card's one text box (its `orgBlock`, else the
 * template's box): sized to fill it, centred in it, as backgroundCard.ts draws the X card. Returns `layout`
 * itself when they already sit there, so it can run on every change of the words.
 */
export function placeOrgWords(layout: TemplateLayout, t: DrawableCardTemplate): TemplateLayout {
  const bodyLayer = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  if (!bodyLayer) return layout;
  const f = frameOf(t);
  const block = handBlock(layout, t);
  const area: AreaAt = block ? () => ({ x: block.x * f.W, y: block.y * f.H, w: block.w * f.W, h: block.h * f.H }) : templateArea(t, f);
  // A hidden story takes no room: the heading alone is placed
  const p = placeBlock(f, { headline: layout.headline, body: bodyLayer.hidden ? "" : bodyLayer.text }, orgFontsOf(layout), area, t.layout.fontMinPx, t.layout.fontMaxPx);
  const tight = 0.0005;
  // handBlock returns the layout's own orgBlock object when it has one, so identity says "box unchanged"
  const same =
    (block ?? undefined) === layout.orgBlock &&
    near(layout.textX, p.head.textX, tight) &&
    near(layout.textY, p.head.textY, tight) &&
    near(layout.textWidth, p.head.textWidth, tight) &&
    near(layout.textHeight, p.head.textHeight, tight) &&
    near(layout.fontScale, p.head.fontScale, 0.001) &&
    near(bodyLayer.x, p.body.x, tight) &&
    near(bodyLayer.y, p.body.y, tight) &&
    near(bodyLayer.width, p.body.width, tight) &&
    near(bodyLayer.height, p.body.height, tight) &&
    near(bodyLayer.size, p.body.size, 0.01) &&
    bodyLayer.style.lineHeight === BODY_LINE;
  if (same) return layout;
  return {
    ...layout,
    ...p.head,
    orgBlock: block ?? undefined,
    layers: (layout.layers ?? []).map((l) => (l.id === ORG_BODY_ID ? storyAt(l, p.body) : l)),
  };
}

/**
 * The story box at `at`, with the line pitch the words were placed at (a story saved before drawing version 4
 * carries the older 1.49 pitch, which would draw it taller than its box and so smaller than the heading).
 */
const storyAt = (l: CardTextLayer, at: Placement["body"]): CardTextLayer => ({ ...l, ...at, style: { ...l.style, lineHeight: BODY_LINE } });

/**
 * True for a card made with the one text box (a fresh card on a desk template from now on, or one moved by hand
 * since): its story carries the current line pitch, or it has an orgBlock. A draft saved before stays as it
 * was saved, with its headline and story as two boxes, and is never re-placed on its own.
 */
export function isOneBox(layout: TemplateLayout): boolean {
  return !!layout.orgBlock || layout.layers?.find((l) => l.id === ORG_BODY_ID)?.style.lineHeight === BODY_LINE;
}

/** The card's one text box in card px: the box set by hand, else the template's room at the story's size. */
export function orgBlockRect(layout: TemplateLayout, t: DrawableCardTemplate): PxRect | null {
  const bodyLayer = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  if (!bodyLayer) return null;
  const f = frameOf(t);
  const block = handBlock(layout, t);
  if (block) return { x: block.x * f.W, y: block.y * f.H, w: block.w * f.W, h: block.h * f.H };
  return cardTextArea(rawBox(t, f), bodyLayer.size * f.u);
}

/**
 * The one text box moved or resized by hand to `rect` (card px): heading and story placed afresh in it. A move
 * that keeps the box's size only shifts the words (no measuring), so dragging stays smooth on a long story.
 */
export function setOrgBlock(layout: TemplateLayout, t: DrawableCardTemplate, rect: PxRect): TemplateLayout {
  const f = frameOf(t);
  rect = { ...rect, w: Math.max(rect.w, MIN_BLOCK * f.W), h: Math.max(rect.h, MIN_BLOCK * f.H) };
  const orgBlock = { x: rect.x / f.W, y: rect.y / f.H, w: rect.w / f.W, h: rect.h / f.H };
  const was = orgBlockRect(layout, t);
  const bodyLayer = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  if (was && bodyLayer && Math.abs(was.w - rect.w) < 0.5 && Math.abs(was.h - rect.h) < 0.5) {
    const dx = (rect.x - was.x) / f.W;
    const dy = (rect.y - was.y) / f.H;
    return {
      ...layout,
      orgBlock,
      textX: (layout.textX ?? 0.5) + dx,
      textY: layout.textY + dy,
      layers: (layout.layers ?? []).map((l) => (l.id === ORG_BODY_ID ? { ...l, x: l.x + dx, y: l.y + dy } : l)),
    };
  }
  return placeOrgWords({ ...layout, orgBlock }, t);
}

/** The one text box back in the template's own box, the words placed afresh in it. */
export function resetOrgBlock(layout: TemplateLayout, t: DrawableCardTemplate): TemplateLayout {
  const fresh = orgPlacement(t, { headline: layout.headline, body: orgBodyText(layout, "") }, orgFontsOf(layout));
  return {
    ...layout,
    ...fresh.head,
    orgBlock: undefined,
    layers: (layout.layers ?? []).map((l) => (l.id === ORG_BODY_ID ? storyAt(l, fresh.body) : l)),
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** The one text box is never smaller than this share of the card each way, so the words always have room */
const MIN_BLOCK = 0.1;

/**
 * Moves a card from template `from` to `to`, keeping the words and every style choice.
 * - The one text box in the old template's own box: placed afresh in the new box (best fit for its shape).
 * - Moved or resized by hand: the same spot inside the new box (scaled with it), the words placed in it.
 * Colours still at the old template's defaults take the new template's; the date follows the new date slot
 * (hidden, not deleted, when the new design has none). The operator's own text boxes and photo stay put.
 */
export function switchOrgTemplate(layout: TemplateLayout, from: OrgCardTemplate | null, to: OrgCardTemplate, fallbackBody: string): TemplateLayout {
  const bodyLayer = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  const words = { headline: layout.headline, body: bodyLayer?.text ?? cardBodyText(fallbackBody) };
  // Not on a desk template yet (a photo card): start a fresh one, keeping the operator's own text boxes
  if (!layout.orgTemplate || !from || !bodyLayer) return orgLayout(to, words, { ...layout, photoBox: layout.photoBox });

  const fresh = orgPlacement(to, words, orgFontsOf(layout));
  const a = frameOf(from);
  const b = frameOf(to);
  // A draft from before the one box that was arranged by hand keeps that spot, as one box
  const block = handBlock(layout, from, true);
  let orgBlock: TemplateLayout["orgBlock"];
  if (block) {
    const ob = boxPx(from, a);
    const nb = boxPx(to, b);
    // Old card px → share of the old box → new card px → share of the new card
    const x = clamp01((nb.x + ((block.x * a.W - ob.x) / ob.w) * nb.w) / b.W);
    const y = clamp01((nb.y + ((block.y * a.H - ob.y) / ob.h) * nb.h) / b.H);
    const w = Math.max(MIN_BLOCK, Math.min(1, (block.w * a.W * (nb.w / ob.w)) / b.W));
    const h = Math.max(MIN_BLOCK, Math.min(1, (block.h * a.H * (nb.h / ob.h)) / b.H));
    // Kept whole on the card, never squeezed to nothing at an edge
    orgBlock = { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h };
  }

  const keepOr = (current: string | undefined, oldDefault: string, newDefault: string) => (!current || current.toLowerCase() === oldDefault.toLowerCase() ? newDefault : current);
  const layers = (layout.layers ?? []).flatMap((l): CardTextLayer[] => {
    if (l.id === ORG_BODY_ID) return [{ ...l, ...fresh.body, style: { ...l.style, lineHeight: BODY_LINE, color: keepOr(l.style.color, from.layout.body.color, to.layout.body.color) } }];
    if (l.id === ORG_DATE_ID) {
      if (!fresh.date) return [{ ...l, hidden: true }];
      return [{ ...dateLayer(to, fresh.date, l.style), hidden: undefined }];
    }
    return [l];
  });
  // A design with a date slot and a card that never had one (it started on a design without)
  if (fresh.date && !layers.some((l) => l.id === ORG_DATE_ID)) layers.splice(1, 0, dateLayer(to, fresh.date));

  const moved: TemplateLayout = {
    ...layout,
    ...fresh.head,
    orgTemplate: to.slug,
    orgBlock,
    color: keepOr(layout.color === "auto" ? undefined : layout.color, from.layout.headline.color, to.layout.headline.color),
    layers,
  };
  // In the template's box the words already sit right; in a box set by hand they are placed in it
  return orgBlock ? placeOrgWords(moved, to) : moved;
}

/** Reopened on another day: a date box still showing a date in the template's format shows today's. */
export function refreshOrgDate(layout: TemplateLayout, t: DrawableCardTemplate): TemplateLayout {
  const format = t.layout.date?.format;
  const dateBox = layout.layers?.find((l) => l.id === ORG_DATE_ID);
  if (!format || !dateBox) return layout;
  const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped.replace("DD", "\\d{2}").replace("MM", "\\d{2}").replace("YYYY", "\\d{4}")}$`);
  const today = istDate(format);
  if (dateBox.text === today || !pattern.test(dateBox.text.trim())) return layout;
  return { ...layout, layers: (layout.layers ?? []).map((l) => (l.id === ORG_DATE_ID ? { ...l, text: today } : l)) };
}
