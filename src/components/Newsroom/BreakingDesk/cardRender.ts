import { BreakingTag, CardLayout, CardTextLayer, CardTextStyle, MediaAdjust, TextAlign, TextAnimation, TextMotion } from "@/types/newsroom";
import { CHANNEL } from "@/constants";
import { fontById, nearestWeight } from "./templateFonts";

export type TemplateFormat = "x" | "ig_post" | "ig_reel";

export const TEMPLATE_FORMATS: Record<TemplateFormat, { w: number; h: number; label: string }> = {
  x: { w: 1600, h: 900, label: "16:9" },
  ig_post: { w: 1080, h: 1350, label: "Post 4:5" },
  ig_reel: { w: 1080, h: 1920, label: "Reel 9:16" },
};

export const BREAKING_RED = "#D7141A";
export const BIG_BREAKING_YELLOW = "#FFD400";
export const DEFAULT_TEXT_Y: Record<TemplateFormat, number> = { x: 0.68, ig_post: 0.72, ig_reel: 0.7 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResolvedStyle = Required<CardTextStyle>;

export const TEXT_DEFAULTS: ResolvedStyle = {
  font: "noto",
  weight: 700,
  italic: false,
  underline: false,
  uppercase: false,
  color: "#FFFFFF",
  highlight: BIG_BREAKING_YELLOW,
  align: "left",
  letterSpacing: 0,
  lineHeight: 1.32,
  opacity: 1,
  strokeWidth: 0,
  strokeColor: "#000000",
  shadow: 0,
  shadowColor: "#000000",
  box: false,
  boxColor: "#08080A",
  boxOpacity: 0.72,
  boxRadius: 0,
  rotation: 0,
};

/** Drops unset keys so they do not hide the defaults underneath when spread. */
export function defined<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const tagAccent = (tag: BreakingTag) => (tag === "big_breaking" ? BIG_BREAKING_YELLOW : BREAKING_RED);
export const tagLabel = (tag: BreakingTag) => (tag === "big_breaking" ? "BIG BREAKING" : "BREAKING NEWS");

function hexChannels(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgba(color: string, alpha: number) {
  const c = hexChannels(color);
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})` : color;
}

/** Dark or light text, whichever reads on `color`. */
export function inkOn(color: string) {
  const c = hexChannels(color);
  if (!c) return "#FFFFFF";
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#FFFFFF";
}

const fontString = (s: Pick<ResolvedStyle, "font" | "weight" | "italic">, size: number) => {
  const font = fontById(s.font);
  return `${s.italic ? "italic " : ""}${nearestWeight(font, s.weight)} ${size}px ${font.family}, "Nirmala UI", sans-serif`;
};

/** Latin type for the template furniture: tag slabs, channel name, footer */
const chrome = (weight: number, size: number) => fontString({ font: "poppins", weight, italic: false }, size);

// ─── Text engine ─────────────────────────────────────────────────────────────

interface Run {
  text: string;
  hi: boolean;
  w: number;
}
type Word = Run[];
interface Line {
  words: Word[];
  w: number;
}

/** Splits text into paragraphs of words; **double asterisks** toggle the highlight colour. */
function parseRich(text: string): Word[][] {
  const paragraphs: Word[][] = [[]];
  let word: Word = [];
  const flush = () => {
    if (word.length) paragraphs[paragraphs.length - 1].push(word);
    word = [];
  };
  text.split("**").forEach((segment, i) => {
    const hi = i % 2 === 1;
    let buffer = "";
    const push = () => {
      if (buffer) word.push({ text: buffer, hi, w: 0 });
      buffer = "";
    };
    for (const ch of segment) {
      if (ch === "\n") {
        push();
        flush();
        paragraphs.push([]);
      } else if (/\s/.test(ch)) {
        push();
        flush();
      } else buffer += ch;
    }
    push();
  });
  flush();
  return paragraphs;
}

function layoutLines(ctx: CanvasRenderingContext2D, paragraphs: Word[][], maxWidth: number, space: number): Line[] {
  const lines: Line[] = [];
  for (const paragraph of paragraphs) {
    let line: Line = { words: [], w: 0 };
    for (const word of paragraph) {
      word.forEach((run) => (run.w = ctx.measureText(run.text).width));
      const width = word.reduce((sum, run) => sum + run.w, 0);
      const next = line.w + (line.words.length ? space : 0) + width;
      if (line.words.length && next > maxWidth) {
        lines.push(line);
        line = { words: [word], w: width };
      } else {
        line.words.push(word);
        line.w = next;
      }
    }
    lines.push(line);
  }
  // Trailing blank lines add nothing but height
  while (lines.length > 1 && !lines[lines.length - 1].words.length) lines.pop();
  return lines;
}

interface Inset {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface TextBlockSpec {
  text: string;
  style: ResolvedStyle;
  /** Starting font size in canvas px */
  size: number;
  /** When set, the size steps down until the block fits between minY and maxY */
  minSize?: number;
  /** Column the block wraps in */
  x: number;
  width: number;
  centerY: number;
  minY: number;
  maxY: number;
  inset: Inset;
  /** The box shrinks to the longest line instead of filling the column */
  hug?: boolean;
  /**
   * The block is exactly `width` × (maxY − minY), as resized by hand: the size steps down (to `minSize`)
   * until the words fit both ways, and they sit centred in it top to bottom. `hug` and `centerY` are ignored.
   */
  fixed?: boolean;
  u: number;
  /** Template extras drawn over the box and under the words */
  decorate?: (ctx: CanvasRenderingContext2D, rect: Rect) => void;
  /** Mid-animation state on a video frame; absent draws the text at rest */
  motion?: MotionState;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function roundedRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === "function") ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(radius, r.h / 2, r.w / 2));
  else ctx.rect(r.x, r.y, r.w, r.h);
}

/** Wraps, fits and paints a block of styled text. Returns the block's frame, unrotated. */
export function drawTextBlock(ctx: CanvasRenderingContext2D, spec: TextBlockSpec): Rect | null {
  const { style: s, u, inset } = spec;
  const paragraphs = parseRich(s.uppercase ? spec.text.toUpperCase() : spec.text);
  if (!paragraphs.some((p) => p.length)) return null;

  const innerW = Math.max(10 * u, spec.width - inset.l - inset.r);
  let size = spec.size;
  let lines: Line[] = [];
  let lineH = 0;
  let blockH = 0;
  let space = 0;
  let longest = 0;
  for (let step = 0; step < 60; step++) {
    ctx.font = fontString(s, size);
    setLetterSpacing(ctx, s.letterSpacing * size);
    space = ctx.measureText(" ").width;
    lines = layoutLines(ctx, paragraphs, innerW, space);
    longest = Math.max(...lines.map((l) => l.w));
    lineH = size * s.lineHeight;
    blockH = lines.length * lineH + inset.t + inset.b;
    // A fixed box also has to hold its longest word across
    const fits = blockH <= spec.maxY - spec.minY && (!spec.fixed || longest <= innerW + 0.5);
    if (spec.minSize === undefined || fits || size <= spec.minSize) break;
    size *= 0.95;
  }

  // The words' own height; a fixed box can be taller, with the words centred in it
  const textH = blockH;
  if (spec.fixed) blockH = spec.maxY - spec.minY;
  const hug = spec.hug && !spec.fixed;
  const blockW = hug ? Math.min(spec.width, longest + inset.l + inset.r) : spec.width;
  const blockX = !hug || s.align === "left" ? spec.x : s.align === "right" ? spec.x + spec.width - blockW : spec.x + (spec.width - blockW) / 2;
  const blockY = spec.fixed ? spec.minY : Math.max(spec.minY, Math.min(spec.maxY - blockH, spec.centerY - blockH / 2));
  const textTop = blockY + (blockH - textH) / 2;
  const rect = { x: blockX, y: blockY, w: blockW, h: blockH };

  const motion = spec.motion;
  ctx.save();
  const cx = blockX + blockW / 2;
  const cy = blockY + blockH / 2;
  if (motion?.dy) ctx.translate(0, motion.dy * u);
  if (s.rotation || (motion && motion.scale !== 1)) {
    ctx.translate(cx, cy);
    ctx.rotate((s.rotation * Math.PI) / 180);
    if (motion) ctx.scale(motion.scale, motion.scale);
    ctx.translate(-cx, -cy);
  }
  if (motion && motion.wipe < 1) {
    ctx.beginPath();
    ctx.rect(blockX - 4 * u, blockY - blockH, (blockW + 8 * u) * motion.wipe, blockH * 3);
    ctx.clip();
  }
  ctx.globalAlpha = s.opacity * (motion?.alpha ?? 1);
  // Typewriter: letters out so far. Lines are wrapped on the full text, so they never jump.
  let typed = motion?.chars ?? Infinity;
  if (s.box) {
    ctx.fillStyle = rgba(s.boxColor, s.boxOpacity);
    roundedRect(ctx, rect, s.boxRadius * u);
    ctx.fill();
  }
  spec.decorate?.(ctx, rect);

  ctx.font = fontString(s, size);
  setLetterSpacing(ctx, s.letterSpacing * size);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const innerBlockW = blockW - inset.l - inset.r;
  const shadow = () => {
    ctx.shadowColor = rgba(s.shadowColor, 0.35 + 0.5 * s.shadow);
    ctx.shadowBlur = s.shadow * 28 * u;
    ctx.shadowOffsetY = s.shadow * 6 * u;
  };
  const noShadow = () => {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };

  lines.forEach((line, i) => {
    const y = textTop + inset.t + lineH * (i + 0.5);
    const startX = blockX + inset.l + (s.align === "center" ? (innerBlockW - line.w) / 2 : s.align === "right" ? innerBlockW - line.w : 0);
    let x = startX;
    line.words.forEach((word, wi) => {
      if (wi) x += space;
      for (const full of word) {
        if (typed <= 0) break;
        const run = typed >= full.text.length ? full : { ...full, text: sliceGraphemes(full.text, typed) };
        typed -= full.text.length;
        if (s.strokeWidth > 0) {
          if (s.shadow > 0) shadow();
          ctx.lineJoin = "round";
          ctx.lineWidth = s.strokeWidth * u * 2;
          ctx.strokeStyle = s.strokeColor;
          ctx.strokeText(run.text, x, y);
          noShadow();
        } else if (s.shadow > 0) shadow();
        ctx.fillStyle = run.hi ? s.highlight : s.color;
        ctx.fillText(run.text, x, y);
        noShadow();
        x += full.w;
      }
    });
    if (s.underline && line.w > 0 && typed > 0) {
      ctx.fillStyle = s.color;
      ctx.fillRect(startX, y + size * 0.56, line.w, Math.max(2 * u, size * 0.06));
    }
  });
  ctx.restore();
  return rect;
}

// ─── Motion on video ─────────────────────────────────────────────────────────

/** The playhead on a video card, in seconds of the source, and the kept part of the video. */
export interface FrameTime {
  time: number;
  from: number;
  to: number;
}

export interface MotionState {
  alpha: number;
  /** Vertical offset in px on a 1080 frame */
  dy: number;
  scale: number;
  /** Share of the block revealed, left to right */
  wipe: number;
  /** Letters typed so far */
  chars: number;
}

export const TEXT_ANIMATIONS: { id: TextAnimation; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
  { id: "wipe", label: "Wipe" },
  { id: "typewriter", label: "Typewriter" },
];

/** Seconds an entrance takes */
export const ENTER_SECONDS = 0.6;
const EXIT_SECONDS = 0.3;
const FADE_SECONDS = 0.5;
const TYPE_RATE = 32;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The seconds of the source a text is on screen; unset edges follow the kept video. */
export function textSpan(motion: TextMotion | undefined, from: number, to: number) {
  return { start: Math.max(from, motion?.start ?? from), end: Math.min(to, motion?.end ?? to) };
}

/** How a text looks on this frame: null when it is off screen, undefined on a still card. */
export function motionAt(motion: TextMotion | undefined, frame: FrameTime | undefined): MotionState | null | undefined {
  if (!frame) return undefined;
  const { start, end } = textSpan(motion, frame.from, frame.to);
  const t = frame.time;
  if (t < start - 0.02 || t > end + 0.02) return null;
  const p = clamp01((t - start) / ENTER_SECONDS);
  const ease = 1 - (1 - p) ** 3;
  // Leaving before the video ends fades the text out
  const out = end < frame.to - 0.05 ? clamp01((end - t) / EXIT_SECONDS) : 1;
  const state: MotionState = { alpha: out, dy: 0, scale: 1, wipe: 1, chars: Infinity };
  switch (motion?.animation ?? "none") {
    case "fade":
      state.alpha *= ease;
      break;
    case "rise":
      state.alpha *= ease;
      state.dy = (1 - ease) * 70;
      break;
    case "pop": {
      // Overshoots a little before settling
      const back = 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2;
      state.alpha *= clamp01(p * 2.5);
      state.scale = 0.6 + 0.4 * back;
      break;
    }
    case "wipe":
      state.wipe = ease;
      break;
    case "typewriter":
      state.chars = Math.floor((t - start) * TYPE_RATE);
      break;
  }
  return state;
}

/** Black over the whole card while the video fades in or out. */
function fadeAlpha(layout: CardLayout, frame: FrameTime | undefined) {
  if (!frame) return 0;
  const fadeIn = layout.fadeIn ? 1 - clamp01((frame.time - frame.from) / FADE_SECONDS) : 0;
  const fadeOut = layout.fadeOut ? 1 - clamp01((frame.to - frame.time) / FADE_SECONDS) : 0;
  return Math.max(fadeIn, fadeOut);
}

const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** The first `count` characters, never splitting a Devanagari cluster. */
function sliceGraphemes(text: string, count: number) {
  if (!graphemes) return text.slice(0, count);
  let out = "";
  for (const { segment } of graphemes.segment(text)) {
    if (out.length + segment.length > count) break;
    out += segment;
  }
  return out;
}

// ─── Picture adjustments ─────────────────────────────────────────────────────

/** A look is a CSS filter plus a warm or cool wash; the sliders add on top. */
export const MEDIA_LOOKS: { id: string; label: string; css: string; warmth?: number }[] = [
  { id: "none", label: "Original", css: "" },
  { id: "vivid", label: "Vivid", css: "saturate(1.4) contrast(1.08)" },
  { id: "warm", label: "Warm", css: "saturate(1.1)", warmth: 0.55 },
  { id: "cool", label: "Cool", css: "saturate(0.95)", warmth: -0.55 },
  { id: "drama", label: "Drama", css: "contrast(1.3) saturate(1.15) brightness(0.92)" },
  { id: "faded", label: "Faded", css: "contrast(0.82) brightness(1.08) saturate(0.7)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.08)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.45) brightness(0.88)" },
];

/** CSS filter for the media; `blurPx` is the full-strength blur at the size being drawn. */
export function mediaFilter(adjust: MediaAdjust | undefined, blurPx: number) {
  if (!adjust) return "none";
  const look = MEDIA_LOOKS.find((l) => l.id === adjust.filter);
  const parts = [look?.css ?? ""];
  if (adjust.brightness) parts.push(`brightness(${1 + adjust.brightness * 0.5})`);
  if (adjust.contrast) parts.push(`contrast(${1 + adjust.contrast * 0.6})`);
  if (adjust.saturation) parts.push(`saturate(${1 + adjust.saturation})`);
  if (adjust.blur) parts.push(`blur(${(adjust.blur * blurPx).toFixed(1)}px)`);
  return parts.join(" ").trim() || "none";
}

/** Strength of the warm (orange) or cool (blue) wash, -1 – 1 */
export function mediaWarmth(adjust: MediaAdjust | undefined) {
  const look = MEDIA_LOOKS.find((l) => l.id === adjust?.filter);
  return Math.max(-1, Math.min(1, (look?.warmth ?? 0) + (adjust?.warmth ?? 0)));
}

export const warmthColor = (warmth: number) => (warmth > 0 ? `rgba(255, 138, 20, ${warmth * 0.4})` : `rgba(30, 120, 255, ${-warmth * 0.4})`);

// ─── Templates ───────────────────────────────────────────────────────────────

export interface TemplateEnv {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  u: number;
  pad: number;
  format: TemplateFormat;
  tag: BreakingTag;
  accent: string;
  /** Text colour that reads on the accent */
  ink: string;
  handle: string;
  stamp: string;
  headline: ResolvedStyle;
}

/** Where a template wants the headline, and how big it starts. */
export interface HeadlineArea {
  x: number;
  width: number;
  minY: number;
  maxY: number;
  baseSize: number;
  inset: Inset;
  decorate?: (ctx: CanvasRenderingContext2D, rect: Rect) => void;
}

export interface CardTemplate {
  id: string;
  label: string;
  blurb: string;
  align?: TextAlign;
  textY?: (format: TemplateFormat) => number;
  /** The template's own headline look; the operator's choices sit on top */
  headline: (accent: string, ink: string) => Partial<CardTextStyle>;
  /** Part of the frame the photo or video fills; the whole frame when absent */
  mediaRect?: (W: number, H: number, format: TemplateFormat) => Rect;
  /** Paints the furniture under the text and says where the headline goes */
  draw: (env: TemplateEnv) => HeadlineArea;
}

function scrim(ctx: CanvasRenderingContext2D, W: number, from: number, to: number, alphaFrom: number, alphaTo: number) {
  const g = ctx.createLinearGradient(0, from, 0, to);
  g.addColorStop(0, `rgba(0,0,0,${alphaFrom})`);
  g.addColorStop(1, `rgba(0,0,0,${alphaTo})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.min(from, to), W, Math.abs(to - from));
}

/** A solid label with centred text; returns its width. */
function slab(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, text: string, bg: string, fg: string, fontSize: number, padX: number, anchor: "left" | "center" | "right" = "left") {
  ctx.font = chrome(700, fontSize);
  setLetterSpacing(ctx, fontSize * 0.04);
  const w = ctx.measureText(text).width + padX * 2;
  const left = anchor === "left" ? x : anchor === "right" ? x - w : x - w / 2;
  ctx.fillStyle = bg;
  ctx.fillRect(left, y, w, h);
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, left + padX, y + h / 2 + fontSize * 0.04);
  setLetterSpacing(ctx, 0);
  return w;
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, weight: number, size: number, align: CanvasTextAlign = "left") {
  ctx.font = chrome(weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

/** Bar beside (or under) the headline box in the template's accent */
const accentBar = (accent: string, align: TextAlign, barW: number) => (ctx: CanvasRenderingContext2D, r: Rect) => {
  ctx.fillStyle = accent;
  if (align === "center") ctx.fillRect(r.x, r.y + r.h - barW * 0.6, r.w, barW * 0.6);
  else if (align === "right") ctx.fillRect(r.x + r.w - barW, r.y, barW, r.h);
  else ctx.fillRect(r.x, r.y, barW, r.h);
};

const barInset = (align: TextAlign, barW: number, padX: number, padY: number): Inset =>
  align === "left" ? { l: barW + padX, r: padX, t: padY, b: padY } : align === "right" ? { l: padX, r: barW + padX, t: padY, b: padY } : { l: padX, r: padX, t: padY, b: padY };

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "classic",
    label: "Classic",
    blurb: "Tag slab, dark headline box, red footer",
    headline: () => ({ box: true, boxColor: "#08080A", boxOpacity: 0.72, color: "#FFFFFF", highlight: BIG_BREAKING_YELLOW }),
    draw: ({ ctx, W, H, u, pad, format, tag, accent, ink, handle, stamp, headline }) => {
      scrim(ctx, W, 0, H * 0.28, 0.62, 0);
      scrim(ctx, W, H * 0.4, H, 0, 0.82);
      const tagH = 72 * u;
      slab(ctx, pad, pad, tagH, tagLabel(tag), accent, ink, 40 * u, 22 * u);
      const markW = label(ctx, CHANNEL.name, W - pad, pad + tagH / 2 + 2 * u, "#FFFFFF", 700, 30 * u, "right");
      ctx.fillStyle = accent;
      ctx.fillRect(W - pad - markW, pad + tagH / 2 + 26 * u, markW, 5 * u);
      const bandH = 76 * u;
      ctx.fillStyle = accent;
      ctx.fillRect(0, H - bandH, W, bandH);
      label(ctx, handle, pad, H - bandH / 2 + 2 * u, ink, 700, 28 * u);
      label(ctx, stamp, W - pad, H - bandH / 2 + 2 * u, ink, 600, 26 * u, "right");
      const barW = 12 * u;
      return {
        x: pad,
        width: W - pad * 2,
        minY: pad + tagH + 24 * u,
        maxY: H - bandH - 24 * u,
        baseSize: (format === "x" ? 70 : 76) * u,
        inset: barInset(headline.align, barW, 30 * u, 21 * u),
        decorate: accentBar(accent, headline.align, barW),
      };
    },
  },
  {
    id: "band",
    label: "Bold band",
    blurb: "Headline on a solid band in the tag colour",
    textY: () => 0.7,
    headline: (accent, ink) => ({ font: "khand", weight: 700, box: true, boxColor: accent, boxOpacity: 1, color: ink, highlight: ink === "#111111" ? BREAKING_RED : BIG_BREAKING_YELLOW, lineHeight: 1.2 }),
    draw: ({ ctx, W, H, u, pad, format, tag, handle, stamp }) => {
      scrim(ctx, W, 0, H * 0.22, 0.55, 0);
      scrim(ctx, W, H * 0.45, H, 0, 0.6);
      ctx.fillStyle = BREAKING_RED;
      ctx.fillRect(pad, pad + 6 * u, 20 * u, 20 * u);
      label(ctx, CHANNEL.name, pad + 34 * u, pad + 17 * u, "#FFFFFF", 800, 30 * u);
      const stripH = 64 * u;
      ctx.fillStyle = "#0B0B0D";
      ctx.fillRect(0, H - stripH, W, stripH);
      label(ctx, handle, pad, H - stripH / 2, "#FFFFFF", 700, 26 * u);
      label(ctx, stamp, W - pad, H - stripH / 2, "rgba(255,255,255,0.75)", 600, 24 * u, "right");
      const tabH = 52 * u;
      return {
        x: pad,
        width: W - pad * 2,
        minY: pad + 60 * u + tabH,
        maxY: H - stripH - 32 * u,
        baseSize: (format === "x" ? 70 : 78) * u,
        inset: { l: 32 * u, r: 32 * u, t: 22 * u, b: 22 * u },
        decorate: (c, r) => slab(c, r.x, r.y - tabH, tabH, tagLabel(tag), "#0B0B0D", "#FFFFFF", 28 * u, 18 * u),
      };
    },
  },
  {
    id: "clean",
    label: "Clean",
    blurb: "No box: big type over a deep shadow",
    textY: () => 0.74,
    headline: (accent) => ({ font: "anek", weight: 800, box: false, color: "#FFFFFF", shadow: 0.5, lineHeight: 1.22, highlight: accent }),
    draw: ({ ctx, W, H, u, pad, format, tag, accent, handle, stamp }) => {
      scrim(ctx, W, 0, H * 0.2, 0.45, 0);
      scrim(ctx, W, H * 0.3, H, 0, 0.92);
      label(ctx, CHANNEL.name, pad, pad + 16 * u, "#FFFFFF", 800, 28 * u);
      label(ctx, handle, pad, H - pad + 6 * u, "rgba(255,255,255,0.8)", 600, 26 * u);
      label(ctx, stamp, W - pad, H - pad + 6 * u, "rgba(255,255,255,0.6)", 500, 24 * u, "right");
      return {
        x: pad,
        width: W - pad * 2,
        minY: pad + 120 * u,
        maxY: H - pad - 60 * u,
        baseSize: (format === "x" ? 72 : 84) * u,
        inset: { l: 0, r: 0, t: 0, b: 0 },
        decorate: (c, r) => {
          c.fillStyle = accent;
          c.fillRect(r.x, r.y - 46 * u, 14 * u, 14 * u);
          label(c, tagLabel(tag), r.x + 26 * u, r.y - 38 * u, accent, 800, 28 * u);
        },
      };
    },
  },
  {
    id: "tv",
    label: "TV lower third",
    blurb: "White strap over a ticker, like on air",
    textY: () => 0.8,
    headline: () => ({ font: "mukta", weight: 800, box: true, boxColor: "#FFFFFF", boxOpacity: 1, color: "#111111", highlight: BREAKING_RED, lineHeight: 1.22 }),
    draw: ({ ctx, W, H, u, pad, format, tag, accent, ink, handle, stamp }) => {
      scrim(ctx, W, H * 0.5, H, 0, 0.5);
      slab(ctx, W - pad, pad, 60 * u, CHANNEL.name, accent, ink, 26 * u, 20 * u, "right");
      const stripH = 62 * u;
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, H - stripH, W, stripH);
      slab(ctx, 0, H - stripH, stripH, handle, accent, ink, 24 * u, pad);
      label(ctx, stamp, W - pad, H - stripH / 2, "rgba(255,255,255,0.8)", 600, 24 * u, "right");
      const tabH = 50 * u;
      return {
        x: pad,
        width: W - pad * 2,
        minY: H * 0.3,
        maxY: H - stripH - 28 * u,
        baseSize: (format === "x" ? 56 : 62) * u,
        inset: { l: 28 * u, r: 28 * u, t: 18 * u, b: 18 * u },
        decorate: (c, r) => slab(c, r.x, r.y - tabH, tabH, tagLabel(tag), accent, ink, 26 * u, 18 * u),
      };
    },
  },
  {
    id: "split",
    label: "Split",
    blurb: "Picture above, story on a dark panel",
    textY: (format) => (format === "x" ? 0.55 : 0.8),
    headline: (accent) => ({ font: "martel", weight: 800, box: false, color: "#FFFFFF", lineHeight: 1.45, highlight: accent }),
    mediaRect: (W, H, format) => (format === "x" ? { x: 0, y: 0, w: W * 0.56, h: H } : { x: 0, y: 0, w: W, h: H * 0.56 }),
    draw: ({ ctx, W, H, u, pad, format, tag, accent, ink, handle, stamp }) => {
      const side = format === "x";
      const panel = side ? { x: W * 0.56, y: 0, w: W * 0.44, h: H } : { x: 0, y: H * 0.56, w: W, h: H * 0.44 };
      scrim(ctx, side ? W * 0.56 : W, 0, H * 0.18, 0.5, 0);
      ctx.fillStyle = "#0B0B0D";
      ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
      ctx.fillStyle = accent;
      if (side) ctx.fillRect(panel.x - 5 * u, 0, 10 * u, H);
      else ctx.fillRect(0, panel.y - 5 * u, W, 10 * u);
      label(ctx, CHANNEL.name, pad, pad + 16 * u, "#FFFFFF", 800, 28 * u);
      const px = panel.x + pad;
      const tagTop = panel.y + pad * 0.8;
      const tagH = 58 * u;
      slab(ctx, px, tagTop, tagH, tagLabel(tag), accent, ink, 30 * u, 18 * u);
      label(ctx, handle, px, panel.y + panel.h - pad * 0.7, "rgba(255,255,255,0.75)", 600, 24 * u);
      label(ctx, stamp, panel.x + panel.w - pad, panel.y + panel.h - pad * 0.7, "rgba(255,255,255,0.55)", 500, 22 * u, "right");
      return {
        x: px,
        width: panel.w - pad * 2,
        minY: tagTop + tagH + 26 * u,
        maxY: panel.y + panel.h - pad - 36 * u,
        baseSize: (side ? 48 : 60) * u,
        inset: { l: 0, r: 0, t: 0, b: 0 },
      };
    },
  },
  {
    id: "frame",
    label: "Frame",
    blurb: "Coloured border, centred rounded caption",
    align: "center",
    textY: () => 0.72,
    headline: () => ({ weight: 800, box: true, boxColor: "#000000", boxOpacity: 0.62, boxRadius: 22, color: "#FFFFFF", highlight: BIG_BREAKING_YELLOW }),
    draw: ({ ctx, W, H, u, pad, format, tag, accent, ink, handle }) => {
      const border = 24 * u;
      scrim(ctx, W, H * 0.45, H, 0, 0.6);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, W, border);
      ctx.fillRect(0, H - border, W, border);
      ctx.fillRect(0, 0, border, H);
      ctx.fillRect(W - border, 0, border, H);
      const tagH = 64 * u;
      slab(ctx, W / 2, border, tagH, tagLabel(tag), accent, ink, 32 * u, 24 * u, "center");
      const stripH = 62 * u;
      ctx.fillStyle = "#0B0B0D";
      ctx.fillRect(border, H - border - stripH, W - border * 2, stripH);
      label(ctx, handle, border + pad * 0.6, H - border - stripH / 2, "#FFFFFF", 700, 24 * u);
      label(ctx, CHANNEL.name, W - border - pad * 0.6, H - border - stripH / 2, accent, 800, 24 * u, "right");
      const inner = border + pad * 0.7;
      return {
        x: inner,
        width: W - inner * 2,
        minY: border + tagH + 40 * u,
        maxY: H - border - stripH - 28 * u,
        baseSize: (format === "x" ? 64 : 70) * u,
        inset: { l: 36 * u, r: 36 * u, t: 26 * u, b: 26 * u },
      };
    },
  },
];

export const templateById = (id: string | undefined) => CARD_TEMPLATES.find((t) => t.id === id) ?? CARD_TEMPLATES[0];

export const accentFor = (layout: CardLayout, tag: BreakingTag) => layout.accent ?? tagAccent(tag);

/** The headline's look after template defaults, then the operator's choices. */
export function resolveHeadlineStyle(layout: CardLayout, tag: BreakingTag): ResolvedStyle {
  const accent = accentFor(layout, tag);
  const style: ResolvedStyle = { ...TEXT_DEFAULTS, ...templateById(layout.template).headline(accent, inkOn(accent)), ...defined(layout.headlineStyle) };
  style.align = layout.align;
  if (layout.color && layout.color !== "auto") style.color = layout.color;
  return style;
}

export const resolveLayerStyle = (layer: CardTextLayer): ResolvedStyle => ({ ...TEXT_DEFAULTS, shadow: 0.35, ...defined(layer.style) });

/** Layout changes that switch template; the words, crop and text boxes stay. */
export function templatePatch(template: CardTemplate, format: TemplateFormat): Partial<CardLayout> {
  return { template: template.id, color: "auto", align: template.align ?? "left", textY: template.textY?.(format) ?? DEFAULT_TEXT_Y[format], headlineStyle: {}, textX: undefined, textWidth: undefined, textHeight: undefined };
}

export const mediaRectFor = (layout: CardLayout, format: TemplateFormat): Rect => {
  const { w: W, h: H } = TEMPLATE_FORMATS[format];
  return templateById(layout.template).mediaRect?.(W, H, format) ?? { x: 0, y: 0, w: W, h: H };
};

/** Every font the card needs, as CSS font strings, so they can be loaded before painting. */
export function fontsFor(layout: CardLayout, tag: BreakingTag): string[] {
  const styles = [resolveHeadlineStyle(layout, tag), ...(layout.layers ?? []).map(resolveLayerStyle)];
  return Array.from(new Set([...styles.map((s) => fontString(s, 40)), chrome(500, 40), chrome(600, 40), chrome(700, 40), chrome(800, 40)]));
}

// ─── Card ────────────────────────────────────────────────────────────────────

type Source = HTMLImageElement | HTMLVideoElement;

function sourceSize(source: Source) {
  return source instanceof HTMLVideoElement ? { w: source.videoWidth, h: source.videoHeight } : { w: source.naturalWidth, h: source.naturalHeight };
}

/** Size of the media once fitted to a box and zoomed. */
export function fittedSize(source: Source, W: number, H: number, zoom: number, fit: CardLayout["fit"] = "cover") {
  const { w, h } = sourceSize(source);
  if (!w || !h) return null;
  const scale = (fit === "contain" ? Math.min(W / w, H / h) : Math.max(W / w, H / h)) * zoom;
  return { dw: w * scale, dh: h * scale };
}

/** Smallest text box a hand resize leaves, in px on a 1080 frame */
export const MIN_BOX = { w: 80, h: 36 };

export interface CardRects {
  headline: Rect | null;
  /** The headline's column, for resizing */
  headlineArea: { x: number; width: number } | null;
  layers: Record<string, Rect>;
}

/** Paints the whole card: media, template furniture, headline, then the extra text boxes. */
export function drawCard(ctx: CanvasRenderingContext2D, format: TemplateFormat, source: Source | null, layout: CardLayout, tag: BreakingTag, handle: string, frame?: FrameTime): CardRects {
  const { w: W, h: H } = TEMPLATE_FORMATS[format];
  const u = Math.min(W, H) / 1080;
  const pad = 56 * u;
  const template = templateById(layout.template);
  const m = mediaRectFor(layout, format);

  ctx.fillStyle = "#0B0B0D";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(m.x, m.y, m.w, m.h);
  ctx.clip();
  // Backdrop, visible wherever the media does not reach
  const fill = source && fittedSize(source, m.w, m.h, 1.15);
  if (layout.fit === "contain" && layout.backdrop !== "blur") {
    ctx.fillStyle = layout.backdrop;
    ctx.fillRect(m.x, m.y, m.w, m.h);
  } else if (layout.fit === "contain" && source && fill) {
    ctx.filter = `blur(${36 * u}px)`;
    ctx.drawImage(source, m.x + (m.w - fill.dw) / 2, m.y + (m.h - fill.dh) / 2, fill.dw, fill.dh);
    ctx.filter = "none";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(m.x, m.y, m.w, m.h);
  }
  const fitted = source && fittedSize(source, m.w, m.h, layout.bgZoom, layout.fit);
  if (source && fitted) {
    const x = m.x + (m.w - fitted.dw) / 2 + (layout.bgX * Math.abs(fitted.dw - m.w)) / 2;
    const y = m.y + (m.h - fitted.dh) / 2 + (layout.bgY * Math.abs(fitted.dh - m.h)) / 2;
    ctx.save();
    if (layout.flipX) {
      // Mirror around the media box's centre so the crop stays put
      ctx.translate(m.x * 2 + m.w, 0);
      ctx.scale(-1, 1);
    }
    ctx.filter = mediaFilter(layout.adjust, 24 * u);
    ctx.drawImage(source, x, y, fitted.dw, fitted.dh);
    ctx.restore();
  }
  const warmth = mediaWarmth(layout.adjust);
  if (warmth) {
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = warmthColor(warmth);
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.globalCompositeOperation = "source-over";
  }
  if (layout.adjust?.vignette) {
    const r = Math.hypot(m.w, m.h) / 2;
    const shade = ctx.createRadialGradient(m.x + m.w / 2, m.y + m.h / 2, r * 0.35, m.x + m.w / 2, m.y + m.h / 2, r);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, `rgba(0,0,0,${0.85 * layout.adjust.vignette})`);
    ctx.fillStyle = shade;
    ctx.fillRect(m.x, m.y, m.w, m.h);
  }
  ctx.restore();

  const accent = accentFor(layout, tag);
  const headline = resolveHeadlineStyle(layout, tag);
  const stamp = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const area = template.draw({ ctx, W, H, u, pad, format, tag, accent, ink: inkOn(accent), handle, stamp, headline });

  // The headline column can be narrowed and moved; the template's column is the default. Once resized by
  // hand the box has its own height and may go anywhere on the card; the text then shrinks to fit it.
  const fixed = layout.textHeight !== undefined;
  const width = fixed
    ? Math.min(W, Math.max(MIN_BOX.w * u, area.width * (layout.textWidth ?? 1)))
    : area.width * Math.max(0.3, Math.min(1, layout.textWidth ?? 1));
  const margin = fixed ? 0 : pad / 2;
  const centreX = layout.textX !== undefined ? layout.textX * W : area.x + area.width / 2;
  const x = Math.max(margin, Math.min(W - margin - width, centreX - width / 2));
  const boxH = fixed ? Math.min(H, Math.max(MIN_BOX.h * u, (layout.textHeight ?? 0) * H)) : 0;
  const boxTop = fixed ? Math.max(0, Math.min(H - boxH, layout.textY * H - boxH / 2)) : 0;
  const headlineMotion = motionAt(layout.headlineMotion, frame);
  const headlineRect = headlineMotion === null ? null : drawTextBlock(ctx, {
    motion: headlineMotion,
    text: layout.headline,
    style: headline,
    size: area.baseSize * layout.fontScale,
    minSize: (fixed ? 8 : 16) * u,
    x,
    width,
    centerY: H * layout.textY,
    minY: fixed ? boxTop : area.minY,
    maxY: fixed ? boxTop + boxH : area.maxY,
    fixed,
    inset: area.inset,
    u,
    decorate: area.decorate,
  });

  const layers: Record<string, Rect> = {};
  for (const layer of layout.layers ?? []) {
    const motion = motionAt(layer.motion, frame);
    if (motion === null) continue;
    const style = resolveLayerStyle(layer);
    const size = layer.size * u;
    const w = layer.width * W;
    const padX = style.box ? size * 0.4 : 0;
    const padY = style.box ? size * 0.22 : 0;
    // A box resized by hand keeps its height and shrinks the words to fit; otherwise it follows the words
    const h = layer.height !== undefined ? Math.max(MIN_BOX.h * u, layer.height * H) : 0;
    const rect = drawTextBlock(ctx, {
      text: layer.text,
      style,
      size,
      x: layer.x * W - w / 2,
      width: w,
      centerY: layer.y * H,
      minY: h ? layer.y * H - h / 2 : -H,
      maxY: h ? layer.y * H + h / 2 : H * 2,
      inset: { l: padX, r: padX, t: padY, b: padY },
      hug: true,
      ...(h ? { fixed: true, minSize: Math.min(size, 8 * u) } : {}),
      u,
      motion,
    });
    if (rect) layers[layer.id] = rect;
  }

  const black = fadeAlpha(layout, frame);
  if (black > 0) {
    ctx.fillStyle = `rgba(0,0,0,${black})`;
    ctx.fillRect(0, 0, W, H);
  }

  return { headline: headlineRect, headlineArea: { x, width: area.width }, layers };
}
