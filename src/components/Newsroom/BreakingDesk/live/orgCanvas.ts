// The desk's shared X templates (org-card-templates-contract.md) as the design canvas's background.
// A template's picture fills the card at its own size; the headline, the story and today's date become
// ordinary text on it (the headline, and two text boxes), placed from the template's layout. This file
// holds the one decoded copy of each picture and the maths that places and re-places the words.

import { useEffect, useMemo, useState } from "react";
import type { CardTextLayer, CardTextStyle } from "@/types/newsroom";
import type { DrawableCardTemplate, OrgCardTemplate } from "@/lib/socia/types";
import type { TemplateLayout } from "../TemplateCanvas";
import { type CardBackdrop, ORG_BASE_SIZE } from "../cardRender";
import { ORG_CARD_FONT, fontById, nearestWeight } from "../templateFonts";
import { apiFileUrl } from "./LiveDesk";
import { fontsReady, istDate, loadImage } from "./backgroundCard";

/** The text box that holds the story under the headline */
export const ORG_BODY_ID = "org-body";
/** The text box in the template's date slot */
export const ORG_DATE_ID = "org-date";

// ─── One decoded picture per template version, shared by the canvas, the picker and the feed ────────
const images = new Map<string, Promise<HTMLImageElement>>();

// ─── Mangal before measuring: a card placed on a fallback face would be sized wrong ──────────────────
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
  // The card's Mangal starts downloading with the first template, so the words are measured in it
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
const HEAD_LINE = 1.3;
const BODY_LINE = 1.4;
/** Space between headline and story, in story lines: one blank line, as the desk's cards */
const GAP = 1;
/** Inside the template's box, as a share of its width and height (as backgroundCard.ts) */
const PAD = 0.04;

// Headline, story and date are all bold Mangal, centred (the headline's look is cardRender.ORG_HEADLINE)
export const BODY_STYLE: CardTextStyle = { font: ORG_CARD_FONT, weight: 700, align: "center", lineHeight: BODY_LINE, shadow: 0 };
// Line height 1: the date's box is one line tall (dateBox), and a taller line would make the
// card shrink it to fit the box, smaller than backgroundCard.ts draws it
const DATE_STYLE: CardTextStyle = { font: ORG_CARD_FONT, weight: 700, align: "center", lineHeight: 1, shadow: 0 };
/** The fonts a fresh card on a desk template is measured and drawn with */
const ORG_FONTS = { head: ORG_CARD_FONT, body: ORG_CARD_FONT, date: ORG_CARD_FONT };

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

// A layer without its own font draws in the desk-template face (Mangal), so it is measured in it too; measuring
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

/** Largest story size between the template's min and max at which headline and story fill the box, both measured. */
/** Faces and weights the words are measured in: the ones they are drawn in (unset weights draw bold) */
export interface OrgFonts {
  head?: string;
  body?: string;
  date?: string;
  headWeight?: number;
  bodyWeight?: number;
}

function fitWords(words: Words, width: number, height: number, minPx: number, maxPx: number, fonts: OrgFonts): Fit {
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
  const total = (f: Fit) => f.headH + f.bodyH + (f.headH && f.bodyH ? GAP * f.size * BODY_LINE : 0);
  const lo0 = Math.max(6, Math.min(minPx, maxPx));
  const hi0 = Math.max(lo0, minPx, maxPx);
  const top = at(hi0);
  if (total(top) <= height) return top;
  let lo = lo0;
  let hi = hi0 - 1;
  let best: Fit | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const f = at(mid);
    if (total(f) <= height) {
      best = f;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  // Too long even at the smallest size: the story takes what is left and shrinks further on the card
  return best ?? at(lo0);
}

/** Where the headline, the story and the date go on a template, in the layout's own terms. */
export interface Placement {
  head: Pick<TemplateLayout, "textX" | "textY" | "textWidth" | "textHeight" | "fontScale">;
  body: Pick<CardTextLayer, "x" | "y" | "width" | "height" | "size">;
  date: Pick<CardTextLayer, "x" | "y" | "width" | "height" | "size"> | null;
}

const boxPx = (t: DrawableCardTemplate, f: Frame) => {
  const b = t.layout.box;
  const padX = b.w * f.W * PAD;
  const padY = b.h * f.H * PAD;
  return { x: b.x * f.W + padX, y: b.y * f.H + padY, w: b.w * f.W - padX * 2, h: b.h * f.H - padY * 2 };
};

/**
 * The date's size in card px, as backgroundCard.ts draws it on the X background: one line, starting at
 * 1.12 × the slot's height (a font's size is taller than its digits, so they still sit inside the tag) and
 * stepping down until it is no wider than 95% of the slot, which is what limits it on the desk's tags. The
 * line is centred on the slot both ways; its box is made tall enough for that size (orgPlacement), so the
 * card's fit-to-box pass never shrinks it below backgroundCard's size.
 */
/** Share of the date slot the date may fill: width, and height to start from */
const DATE_FILL_W = 0.95;
export const DATE_FILL_H = 1.12;

/**
 * The date box: centred on the slot, as wide as it, and at least one line of the date tall. A slot shorter
 * than the line (size above 1 × slot height) would otherwise make the card shrink the date to fit the box.
 */
function dateBox(d: { x: number; y: number; w: number; h: number }, f: Frame, sizePx: number): NonNullable<Placement["date"]> {
  const lineH = (sizePx * (DATE_STYLE.lineHeight ?? 1)) / f.H;
  return { x: d.x + d.w / 2, y: d.y + d.h / 2, width: d.w, height: Math.max(d.h, lineH * 1.01), size: sizePx / f.u };
}

function dateSizePx(text: string, slotW: number, slotH: number, font: string | undefined): number {
  let size = Math.floor(slotH * DATE_FILL_H);
  const ctx = measure();
  if (!ctx) return size;
  ctx.font = fontFor(font, DATE_STYLE.weight ?? 700, size);
  while (size > 8 && ctx.measureText(text).width > slotW * DATE_FILL_W) {
    size -= 1;
    ctx.font = fontFor(font, DATE_STYLE.weight ?? 700, size);
  }
  return size;
}

export function orgPlacement(t: DrawableCardTemplate, words: Words, fonts: OrgFonts = {}): Placement {
  const f = frameOf(t);
  const box = boxPx(t, f);
  const fit = fitWords(words, box.w, box.h, t.layout.fontMinPx, t.layout.fontMaxPx, fonts);
  // A hair of room, so the card's own measuring never finds the words a pixel too tall and shrinks them
  const headH = Math.min(box.h, fit.headH * 1.03) || fit.size * HEAD_RATIO * HEAD_LINE;
  const gap = GAP * fit.size * BODY_LINE;
  const bodyTop = box.y + headH + gap;
  const bodyH = Math.max(fit.size * BODY_LINE, Math.min(box.y + box.h - bodyTop, fit.bodyH * 1.03 || fit.size * BODY_LINE));
  const d = t.layout.date;
  return {
    head: { textX: (box.x + box.w / 2) / f.W, textY: (box.y + headH / 2) / f.H, textWidth: box.w / f.W, textHeight: headH / f.H, fontScale: (fit.size * HEAD_RATIO) / (ORG_BASE_SIZE * f.u) },
    body: { x: (box.x + box.w / 2) / f.W, y: (bodyTop + bodyH / 2) / f.H, width: box.w / f.W, height: bodyH / f.H, size: fit.size / f.u },
    date: d ? dateBox(d, f, dateSizePx(istDate(d.format), d.w * f.W, d.h * f.H, fonts.date)) : null,
  };
}

const dateLayer = (t: DrawableCardTemplate, p: NonNullable<Placement["date"]>, style?: CardTextStyle): CardTextLayer => ({
  id: ORG_DATE_ID,
  text: istDate(t.layout.date!.format),
  ...p,
  style: { ...DATE_STYLE, ...style, lineHeight: DATE_STYLE.lineHeight, color: t.layout.date!.color },
});

/** The story's text on the card: its own box when there is one, else the FTP story. */
export const orgBodyText = (layout: TemplateLayout, fallback: string) => layout.layers?.find((l) => l.id === ORG_BODY_ID)?.text ?? fallback;

/**
 * A fresh card on template `t`: the words placed in its box (headline at the top, the story under it,
 * sized to fill it), today's date in its date slot. `base` keeps everything a template does not set
 * (the photo choice, video settings, the operator's own text boxes).
 */
export function orgLayout(t: OrgCardTemplate, words: Words, base: TemplateLayout): TemplateLayout {
  const p = orgPlacement(t, words, ORG_FONTS);
  const own = (base.layers ?? []).filter((l) => l.id !== ORG_BODY_ID && l.id !== ORG_DATE_ID);
  const body: CardTextLayer = { id: ORG_BODY_ID, text: words.body, ...p.body, style: { ...BODY_STYLE, color: t.layout.body.color } };
  return {
    ...base,
    orgTemplate: t.slug,
    headline: words.headline,
    ...p.head,
    align: "center",
    color: t.layout.headline.color,
    headlineStyle: {},
    layers: [body, ...(p.date ? [dateLayer(t, p.date)] : []), ...own],
  };
}

const near = (a: number | undefined, b: number | undefined, tol = 0.004) => a !== undefined && b !== undefined && Math.abs(a - b) <= tol;

/**
 * True while the headline and the story still sit where the template put them (left edges, widths, the
 * headline's top, and the story right under it). Their heights follow the words, so they are not compared.
 */
function untouched(layout: TemplateLayout, t: DrawableCardTemplate): boolean {
  const body = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  if (!body || layout.textHeight === undefined || body.height === undefined) return false;
  const f = frameOf(t);
  const box = boxPx(t, f);
  const headTop = (layout.textY - layout.textHeight / 2) * f.H;
  const headBottom = (layout.textY + layout.textHeight / 2) * f.H;
  const bodyTop = (body.y - body.height / 2) * f.H;
  return (
    near(layout.textX, (box.x + box.w / 2) / f.W) &&
    near(layout.textWidth, box.w / f.W) &&
    near(body.x, (box.x + box.w / 2) / f.W) &&
    near(body.width, box.w / f.W) &&
    Math.abs(headTop - box.y) <= f.H * 0.004 &&
    bodyTop >= headBottom - f.H * 0.004 &&
    bodyTop - headBottom <= body.size * f.u * BODY_LINE * (GAP + 0.5)
  );
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Moves a card from template `from` to `to`, keeping the words and every style choice.
 * - Headline and story where the old template put them: placed afresh in the new box (best fit for its shape).
 * - Moved or resized by hand: the same spot inside the new box (scaled with it), so the arrangement survives.
 * Colours still at the old template's defaults take the new template's; the date follows the new date slot
 * (hidden, not deleted, when the new design has none). The operator's own text boxes and photo stay put.
 */
export function switchOrgTemplate(layout: TemplateLayout, from: OrgCardTemplate | null, to: OrgCardTemplate, fallbackBody: string): TemplateLayout {
  const bodyLayer = layout.layers?.find((l) => l.id === ORG_BODY_ID);
  const words = { headline: layout.headline, body: bodyLayer?.text ?? fallbackBody };
  // Not on a desk template yet (a photo card): start a fresh one, keeping the operator's own text boxes
  if (!layout.orgTemplate || !from || !bodyLayer) return orgLayout(to, words, { ...layout, photoBox: layout.photoBox });

  // An unset headline font is Mangal on a desk template (ORG_HEADLINE); unset text boxes draw in the old default
  const fonts: OrgFonts = { head: layout.headlineStyle?.font ?? ORG_CARD_FONT, body: bodyLayer.style.font, date: layout.layers?.find((l) => l.id === ORG_DATE_ID)?.style.font, headWeight: layout.headlineStyle?.weight, bodyWeight: bodyLayer.style.weight };
  const fresh = orgPlacement(to, words, fonts);
  const a = frameOf(from);
  const b = frameOf(to);
  let head: Placement["head"];
  let body: Placement["body"];
  if (untouched(layout, from)) {
    head = fresh.head;
    body = fresh.body;
  } else {
    const ob = boxPx(from, a);
    const nb = boxPx(to, b);
    // Old card px → share of the old box → new card px → share of the new card
    const mapX = (fx: number) => clamp01((nb.x + ((fx * a.W - ob.x) / ob.w) * nb.w) / b.W);
    const mapY = (fy: number) => clamp01((nb.y + ((fy * a.H - ob.y) / ob.h) * nb.h) / b.H);
    const mapW = (fw: number) => Math.min(1, (fw * a.W * (nb.w / ob.w)) / b.W);
    const mapH = (fh: number) => Math.min(1, (fh * a.H * (nb.h / ob.h)) / b.H);
    // Type grows or shrinks with the box, in card px
    const k = Math.min(nb.w / ob.w, nb.h / ob.h) * (a.u / b.u);
    head =
      layout.textHeight !== undefined
        ? { textX: mapX(layout.textX ?? 0.5), textY: mapY(layout.textY), textWidth: mapW(layout.textWidth ?? 1), textHeight: mapH(layout.textHeight), fontScale: layout.fontScale * k }
        : fresh.head;
    body = {
      x: mapX(bodyLayer.x),
      y: mapY(bodyLayer.y),
      width: mapW(bodyLayer.width),
      height: bodyLayer.height === undefined ? undefined : mapH(bodyLayer.height),
      size: bodyLayer.size * k,
    };
  }

  const keepOr = (current: string | undefined, oldDefault: string, newDefault: string) => (!current || current.toLowerCase() === oldDefault.toLowerCase() ? newDefault : current);
  const layers = (layout.layers ?? []).flatMap((l): CardTextLayer[] => {
    if (l.id === ORG_BODY_ID) return [{ ...l, ...body, style: { ...l.style, color: keepOr(l.style.color, from.layout.body.color, to.layout.body.color) } }];
    if (l.id === ORG_DATE_ID) {
      if (!fresh.date) return [{ ...l, hidden: true }];
      return [{ ...dateLayer(to, fresh.date, l.style), hidden: undefined }];
    }
    return [l];
  });
  // A design with a date slot and a card that never had one (it started on a design without)
  if (fresh.date && !layers.some((l) => l.id === ORG_DATE_ID)) layers.splice(1, 0, dateLayer(to, fresh.date));

  return {
    ...layout,
    ...head,
    orgTemplate: to.slug,
    color: keepOr(layout.color === "auto" ? undefined : layout.color, from.layout.headline.color, to.layout.headline.color),
    layers,
  };
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
