"use client";

import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { BreakingTag, CardLayout, ClipSegment, FtpMedia } from "@/types/newsroom";
import { CHANNEL } from "@/constants";
import { CardBackdrop, CardRects, FrameTime, MIN_BOX, Rect, TemplateFormat, TextGeometry, cardSize, drawCard, fittedSize, fontsFor, mediaRectFor, resolveHeadlineStyle, resolveLayerStyle } from "./cardRender";
import { BoxHandle, FrameBox, ResizeFrame, resizeBox, useBoxGesture } from "./ResizeFrame";
import { NUDGE, eventKey, isMac } from "./editorKeys";
import { fontById, nearestWeight } from "./templateFonts";
import { flatCopy, isTainted, rgbPng } from "./live/rgbPng";
import { cardJpeg, fitCard } from "./live/cardImage";

/** How long the card must stand still before its image is encoded ahead of time */
const PREPARE_IDLE_MS = 600;
import { joinBlockText, splitBlockText } from "./blockText";

export { BIG_BREAKING_YELLOW, BREAKING_RED, DEFAULT_TEXT_Y, TEMPLATE_FORMATS } from "./cardRender";
export type { TemplateFormat } from "./cardRender";

export const HEADLINE_COLORS = ["#FFFFFF", "#FFD400"] as const;

/** The parts of the template an editor can change. */
export type TemplateLayout = CardLayout;

export function defaultLayout(headline: string, format: TemplateFormat): TemplateLayout {
  return { headline, fontScale: 1, textY: DEFAULT_Y[format], align: "left", color: "auto", fit: "cover", backdrop: "blur", bgZoom: 1, bgX: 0, bgY: 0, template: "classic" };
}
const DEFAULT_Y: Record<TemplateFormat, number> = { x: 0.68, ig_post: 0.72, ig_reel: 0.7 };

/** What is selected on the canvas: the headline, the media, or a text box by id */
export type CanvasSelection = "headline" | "background" | `layer:${string}` | null;

/** A text on the card that can be typed in */
type TextTarget = "headline" | `layer:${string}`;

type Source = HTMLImageElement | HTMLVideoElement;

export type TrimRange = ClipSegment;

/** How saving the card as an image went */
export type CardExport = "saved" | "blocked" | "failed";

export interface TemplateCanvasHandle {
  /** Small JPEG of the current frame, or null when the media host blocks pixel access */
  snapshot: (maxWidth: number) => string | null;
  /**
   * Saves the full-size frame as an RGB PNG (no alpha channel): "saved", "blocked" when the media host blocks
   * pixel access, "failed" when the browser could not make the image (out of memory)
   */
  download: (fileName: string) => Promise<CardExport>;
  /**
   * The current frame as the card image (JPEG; cardImage.ts) no bigger than `maxBytes`, scaled down if needed;
   * null when the media host blocks pixel access. Reuses the image `prepare` made if nothing repainted since.
   */
  cardImage: (maxBytes: number) => Promise<Blob | null>;
  /**
   * With a byte limit: keep the card image encoded ahead of time, a moment after the card stops repainting, so
   * `cardImage` answers at once. Null stops that and drops the kept image.
   */
  prepare: (maxBytes: number | null) => void;
  /** Moves a video background to `time` seconds */
  seek: (time: number) => void;
  /** Renders the kept clips back to back with the template burnt in; null when the browser or media host does not allow it */
  record: (segments: TrimRange[], onProgress: (fraction: number) => void) => Promise<Blob | null>;
  /** Types in `target` right on the card: every word selected, or the caret at the end */
  editText: (target: TextTarget, caret?: "all" | "end") => void;
}

interface TemplateCanvasProps {
  media: FtpMedia;
  format: TemplateFormat;
  /** Account name printed in the footer band, e.g. "@1stIndiaNews" */
  handle?: string;
  tag: BreakingTag;
  layout: TemplateLayout;
  /** Passing this makes the canvas editable: click to select, drag to move */
  onLayoutChange?: (layout: TemplateLayout) => void;
  selection?: CanvasSelection;
  onSelect?: (selection: CanvasSelection) => void;
  /** Longest text the headline and a text box take while typed in on the card */
  textLimits?: { headline: number; layer: number; /** Longer limits for some boxes by id (a desk template's story) */ byLayer?: Record<string, number> };
  /** Right-click: what is under the pointer (the editor opens its menu from the stage around the card) */
  onContextTarget?: (target: Exclude<CanvasSelection, null>) => void;
  /** Draws at a fraction of full size; for thumbnails */
  renderScale?: number;
  paused?: boolean;
  /** Video only: the parts of the source that are kept, in order; playback skips everything else */
  segments?: TrimRange[];
  onDuration?: (seconds: number) => void;
  onTime?: (seconds: number) => void;
  /** Video only: plays the sound in the editor. Saved clips carry the sound either way. */
  sound?: boolean;
  /**
   * A desk template's picture: the card takes its size and is drawn on it. The story's photo then shows
   * only in `layout.photoBox`, as a still, and the picture outside the photo can't be selected.
   * Pass the same object while nothing changes, or every render repaints the card.
   */
  backdrop?: CardBackdrop | null;
  /**
   * A desk template's one text box: the headline and the text box `layer` (the story) are picked, moved and
   * resized together as one box, as the desk's posts set them. `rect` gives the box in canvas px; `place`
   * returns the layout with the box at `rect` and the words placed in it. Typing still goes to the part clicked.
   */
  textBlock?: { layer: string; rect: (layout: TemplateLayout) => Rect | null; place: (layout: TemplateLayout, rect: Rect) => TemplateLayout };
  ref?: React.Ref<TemplateCanvasHandle>;
  style?: React.CSSProperties;
}

const SELECT_BLUE = "#2F7BFF";

/** `pan`: the press drags the picture inside the photo frame (always off a desk template, Alt on one) */
type Drag = { target: Exclude<CanvasSelection, null>; x: number; y: number; layout: TemplateLayout; dx: number; dy: number; box: Rect | null; clientX: number; clientY: number; moved: boolean; typeOnClick: boolean; pan: boolean };

/** Where the caret goes when typing starts: under the pointer, on every word, or at the end */
type Caret = { x: number; y: number } | "all" | "end";

/** How far, in screen px, a press on text may wander and still count as a click that starts typing */
const CLICK_SLOP = 4;
/** Screen px outside a text box's frame line where a click picks the box to move instead of typing */
const BORDER_PX = 10;
/** Screen px inside the frame line that still count as its edge: narrow, so a click on the words types in them */
const BORDER_IN_PX = 4;
/** Shift, Alt, Ctrl or Meta: a press with one held never types, so the cursor shows "move" */
const anyModifier = (e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) => e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;
/** The frame turns this red when the selected text runs off the card (a size set by hand grew it past an edge) */
const OFF_CARD_RED = "#E53935";
const offCard = (b: { x: number; y: number; w: number; h: number }) => b.x < -0.5 || b.y < -0.5 || b.x + b.w > 100.5 || b.y + b.h > 100.5;
const isTextTarget = (t: CanvasSelection | undefined): t is "headline" | `layer:${string}` => !!t && t !== "background";

/** The caret position in `area` nearest a screen point, measured on a copy of the box laid out the same way. */
function offsetAtPoint(area: HTMLTextAreaElement, x: number, y: number): number {
  const value = area.value;
  if (!value) return 0;
  const css = getComputedStyle(area);
  const box = area.getBoundingClientRect();
  const mirror = document.createElement("div");
  for (const prop of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textTransform", "textAlign", "wordSpacing", "overflowWrap", "wordBreak", "tabSize"] as const) mirror.style[prop] = css[prop];
  Object.assign(mirror.style, { position: "fixed", left: `${box.left}px`, top: `${box.top - area.scrollTop}px`, width: `${area.clientWidth}px`, padding: "0", border: "0", margin: "0", whiteSpace: "pre-wrap", visibility: "hidden", pointerEvents: "none" });
  // One span per letter as the reader sees it, so the caret never lands inside a Devanagari cluster
  const pieces = typeof Intl !== "undefined" && "Segmenter" in Intl ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), (g) => g.segment) : Array.from(value);
  const spans = pieces.map((piece) => {
    const span = document.createElement("span");
    span.textContent = piece;
    mirror.appendChild(span);
    return span;
  });
  document.body.appendChild(mirror);
  let best = value.length;
  let bestScore = Infinity;
  let offset = 0;
  spans.forEach((span, i) => {
    for (const r of Array.from(span.getClientRects())) {
      // Lines first (a click between lines takes the nearer one), then across
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const after = x > r.left + r.width / 2;
      const dx = Math.abs(x - (after ? r.right : r.left));
      const score = dy * 10000 + dx;
      if (score < bestScore) {
        bestScore = score;
        best = offset + (after ? pieces[i].length : 0);
      }
    }
    offset += pieces[i].length;
  });
  mirror.remove();
  return best;
}

/** How close, in canvas px at 1080, a dragged box's centre snaps to the frame's centre lines */
const SNAP = 14;

export default function TemplateCanvas({ media, format, handle = `@${CHANNEL.xHandle}`, tag, layout, onLayoutChange, selection, onSelect, textLimits, onContextTarget, renderScale = 1, paused, segments, onDuration, onTime, sound = false, backdrop = null, textBlock, ref, style }: TemplateCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const startGesture = useBoxGesture();
  const sourceRef = useRef<Source | null>(null);
  const rectsRef = useRef<CardRects>({ headline: null, headlineArea: null, layers: {} });
  const dragRef = useRef<Drag | null>(null);
  const stateRef = useRef({ format, tag, layout, handle, renderScale, backdrop });
  // On a desk template the photo is a still in its own frame, and only loaded once it has one
  const still = !!backdrop;
  const wantMedia = !backdrop || !!layout.photoBox;
  const playbackRef = useRef({ segments, onDuration, onTime, recording: false, lastReport: 0 });
  // Sound for saved clips goes through Web Audio, built the first time a clip is saved
  const audioRef = useRef<{ ctx: AudioContext; el: HTMLVideoElement; source: MediaElementAudioSourceNode; gain: GainNode; monitor: GainNode; out: MediaStreamAudioDestinationNode } | null>(null);
  const soundRef = useRef({ sound, volume: layout.volume ?? 1 });
  // Where the headline and text boxes landed, as percentages of the frame, for the selection outlines
  const [boxes, setBoxes] = useState<Record<string, Rect>>({});
  // Centre guides shown while a snapped box is dragged
  const [guides, setGuides] = useState({ v: false, h: false });
  /** What the pointer is over, for the cursor: a text box's edge (move) or its words (type) */
  const [hover, setHover] = useState<"edge" | "text" | null>(null);
  /** Shift, Alt, Ctrl or Meta held: a press would not type, so the cursor is never "text" meanwhile */
  const [modifierHeld, setModifierHeld] = useState(false);
  const editable = !!onLayoutChange;
  // The keys are followed on the whole window, as the card need not have the focus while the pointer is over it
  useEffect(() => {
    if (!editable) return;
    const sync = (e: KeyboardEvent) => setModifierHeld(anyModifier(e));
    const release = () => setModifierHeld(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", release);
    };
  }, [editable]);
  // Typing right on the card: which text, and where its words were laid out (the canvas leaves them out meanwhile)
  const [typing, setTyping] = useState<TextTarget | null>(null);
  const [typeArea, setTypeArea] = useState<TextGeometry | null>(null);
  const typeRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<Caret | null>(null);
  // Typing ends when the editor selects something else (a text box picked in the panel, deleted, hidden)
  if (typing && selection !== typing) setTyping(null);
  const typingIn = editable && typing && selection === typing ? typing : null;
  // Each on-screen paint counts up: an image encoded at one count shows the card as long as the count holds
  const paintGen = useRef(0);
  const prepared = useRef<{ gen: number; maxBytes: number; blob: Blob } | null>(null);
  const prepareFor = useRef<number | null>(null);
  const prepareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encodeRef = useRef<(maxBytes: number) => Promise<Blob | null>>(async () => null);
  /** Encodes the card image once the card has stood still a moment (only while `prepare` asked for it) */
  const schedulePrepare = useCallback(() => {
    if (prepareFor.current === null) return;
    if (prepareTimer.current) clearTimeout(prepareTimer.current);
    prepareTimer.current = setTimeout(() => {
      prepareTimer.current = null;
      const max = prepareFor.current;
      if (max === null || (prepared.current?.gen === paintGen.current && prepared.current.maxBytes === max)) return;
      void encodeRef.current(max).catch(() => undefined);
    }, PREPARE_IDLE_MS);
  }, []);
  useEffect(
    () => () => {
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
    },
    [],
  );
  // On a desk template the heading and the story are typed in one box, as one text (blockText.ts): the heading,
  // a blank line, the story. Not while the story is hidden: then only the heading is typed in.
  const blockStory = textBlock ? layout.layers?.find((l) => l.id === textBlock.layer && !l.hidden) : undefined;
  const typedBlock = blockStory && (typingIn === "headline" || typingIn === `layer:${blockStory.id}`) ? blockStory : null;
  /** The one text as typed (kept as it is, so the caret never jumps); null until typing in the one box starts */
  const [blockDraft, setBlockDraft] = useState<string | null>(null);
  const editingKey = typedBlock ? `headline|layer:${typedBlock.id}` : typingIn;
  // What drawCard leaves out while it is typed in: one block, or the heading and the story together
  const typingRef = useRef<string | string[] | null>(null);

  // `exporting` paints every word, even the ones being typed (the textarea covers them on screen), and leaves the boxes alone
  const paint = useCallback((exporting = false) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { format: f, tag: t, layout: l, handle: h, renderScale: scale, backdrop: bd } = stateRef.current;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Video frames carry the playhead, so text timing, animations and fades play
    const source = sourceRef.current;
    let frame: FrameTime | undefined;
    if (source instanceof HTMLVideoElement && Number.isFinite(source.duration)) {
      const ranges = playbackRef.current.segments;
      frame = { time: source.currentTime, from: ranges?.[0]?.start ?? 0, to: ranges?.[ranges.length - 1]?.end ?? source.duration };
    }
    const rects = drawCard(ctx, f, source, l, t, h, frame, exporting ? null : typingRef.current, bd);
    if (exporting) return;
    paintGen.current++;
    schedulePrepare();
    rectsRef.current = rects;
    const { w: W, h: H } = cardSize(f, bd);
    const pct = (r: Rect) => ({ x: (r.x / W) * 100, y: (r.y / H) * 100, w: (r.w / W) * 100, h: (r.h / H) * 100 });
    const next: Record<string, Rect> = {};
    if (rects.headline) next.headline = pct(rects.headline);
    for (const [id, r] of Object.entries(rects.layers)) next[`layer:${id}`] = pct(r);
    // Videos repaint every frame, so only store boxes that actually moved. While a clip records, nobody
    // can click a box, and re-rendering for animated text would take time the recording needs for drawing
    if (playbackRef.current.recording) return;
    setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    const area = rects.editing ?? null;
    setTypeArea((prev) => (JSON.stringify(prev) === JSON.stringify(area) ? prev : area));
  }, [schedulePrepare]);

  useEffect(() => {
    stateRef.current = { format, tag, layout, handle, renderScale, backdrop };
    typingRef.current = editingKey?.includes("|") ? editingKey.split("|") : editingKey;
    paint();
  }, [format, tag, layout, handle, renderScale, backdrop, editingKey, paint]);

  // Once the words' place is known, the box over them takes focus with the caret where it was asked for
  useLayoutEffect(() => {
    const area = typeRef.current;
    const caret = caretRef.current;
    if (!area || !caret || !typeArea) return;
    caretRef.current = null;
    area.focus({ preventScroll: true });
    if (caret === "all") area.select();
    else {
      const at = caret === "end" ? area.value.length : offsetAtPoint(area, caret.x, caret.y);
      area.setSelectionRange(at, at);
    }
  }, [typeArea, typingIn]);

  const startTyping = (target: TextTarget, caret: Caret) => {
    caretRef.current = caret;
    // The one box starts from the heading and the story as they are now
    setBlockDraft(null);
    onSelect?.(target);
    setTyping(target);
  };

  // Card fonts download on first use; paint again once they are in
  const fontKey = fontsFor(layout, tag).join("|");
  useEffect(() => {
    if (!document.fonts) return;
    let cancelled = false;
    // The sample text pulls in both the Devanagari and the Latin files
    Promise.all(fontKey.split("|").map((f) => document.fonts.load(f, "क A").catch(() => []))).then(() => !cancelled && paint());
    return () => {
      cancelled = true;
    };
  }, [fontKey, paint]);

  useEffect(() => {
    Object.assign(playbackRef.current, { segments, onDuration, onTime });
  }, [segments, onDuration, onTime]);

  /** Routes the video's sound: through Web Audio once a clip has been saved, straight out before that. */
  const applySound = useCallback(() => {
    const video = sourceRef.current;
    if (!(video instanceof HTMLVideoElement)) return;
    const { sound: on, volume } = soundRef.current;
    const graph = audioRef.current;
    if (graph?.el === video) {
      video.muted = false;
      graph.gain.gain.value = volume;
      graph.monitor.gain.value = on ? 1 : 0;
    } else {
      video.muted = !on;
      video.volume = Math.max(0, Math.min(1, volume));
    }
  }, []);

  useEffect(() => {
    soundRef.current = { sound, volume: layout.volume ?? 1 };
    applySound();
  }, [sound, layout.volume, applySound]);

  // Load the background: images draw once, videos repaint every frame
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let cancelVideoFrame = () => {};
    let video: HTMLVideoElement | null = null;

    const loadImage = (url: string) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (cancelled || sourceRef.current instanceof HTMLVideoElement) return;
        sourceRef.current = image;
        paint();
      };
      image.src = url;
    };

    sourceRef.current = null;
    paint();

    if (!wantMedia) {
      // A desk template without a photo frame: nothing to load (a video would repaint the card every frame)
    } else if (still && media.kind === "video" && media.posterUrl) {
      loadImage(media.posterUrl);
    } else if (still && media.kind === "video") {
      // No poster: the first frame, held still
      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      const el = video;
      el.onloadeddata = () => {
        if (cancelled) return;
        sourceRef.current = el;
        paint();
      };
      el.addEventListener("seeked", () => !cancelled && paint());
      el.src = media.url;
    } else if (media.kind === "video") {
      if (media.posterUrl) loadImage(media.posterUrl);
      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      const el = video;
      // Repaint once per video frame, not once per screen refresh: a 25fps clip on a 60Hz screen would
      // otherwise draw the full-size card more than twice per frame, and on every refresh while paused.
      // Browsers without frame callbacks repaint whenever the playhead moves.
      const perFrame = typeof el.requestVideoFrameCallback === "function";
      let videoFrame = 0;
      let paintedAt = -1;
      let reportedAt = -1;
      const onVideoFrame = () => {
        if (cancelled) return;
        paint();
        videoFrame = el.requestVideoFrameCallback(onVideoFrame);
      };
      // A listener, since saving a clip sets and clears onseeked for its own use
      el.addEventListener("seeked", () => !cancelled && paint());
      cancelVideoFrame = () => perFrame && el.cancelVideoFrameCallback(videoFrame);
      const tick = () => {
        if (cancelled) return;
        const playback = playbackRef.current;
        const ranges = playback.segments;
        // Skip the parts that were cut out (the recorder drives the video itself)
        if (ranges?.length && !playback.recording) {
          const t = el.currentTime;
          if (!ranges.some((r) => t >= r.start - 0.05 && t < r.end)) {
            el.currentTime = (ranges.find((r) => r.start > t) ?? ranges[0]).start;
          }
          // Each kept part plays at its own speed
          const rate = ranges.find((r) => el.currentTime >= r.start - 0.05 && el.currentTime < r.end)?.speed ?? 1;
          if (el.playbackRate !== rate) el.playbackRate = rate;
        }
        // The playhead report re-renders the editor, so it is skipped while the video stands still
        const now = performance.now();
        if (!playback.recording && now - playback.lastReport > 80 && el.currentTime !== reportedAt) {
          playback.lastReport = now;
          reportedAt = el.currentTime;
          playback.onTime?.(el.currentTime);
        }
        if (!perFrame && el.currentTime !== paintedAt) {
          paintedAt = el.currentTime;
          paint();
        }
        frame = requestAnimationFrame(tick);
      };
      el.onloadeddata = () => {
        if (cancelled) return;
        sourceRef.current = el;
        applySound();
        if (Number.isFinite(el.duration)) playbackRef.current.onDuration?.(el.duration);
        if (!paused) el.play().catch(() => undefined);
        paint();
        if (perFrame) videoFrame = el.requestVideoFrameCallback(onVideoFrame);
        tick();
      };
      el.src = media.url;
    } else {
      loadImage(media.url);
    }

    document.fonts?.ready.then(() => !cancelled && paint());

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      cancelVideoFrame();
      if (video) {
        const graph = audioRef.current;
        if (graph?.el === video) {
          graph.source.disconnect();
          audioRef.current = null;
          graph.ctx.close().catch(() => undefined);
        }
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
    // `paused` is handled by the effect below so toggling it does not reload the media
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.url, media.kind, media.posterUrl, paint, applySound, still, wantMedia]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!(source instanceof HTMLVideoElement) || still) return;
    if (paused) source.pause();
    else source.play().catch(() => undefined);
  }, [paused, still]);

  // Exports run on a frame with all the text in it; typing hides its words on screen, so paint once without
  // that, read the canvas, then paint the typing view back
  const withAllText = <T,>(read: () => T): T => {
    if (!typingRef.current) return read();
    paint(true);
    try {
      return read();
    } finally {
      paint();
    }
  };

  /** The card image of the frame on screen (cardImage on the handle); the one encoded ahead when nothing repainted since */
  const encodeCard = async (maxBytes: number): Promise<Blob | null> => {
    const live = canvasRef.current;
    if (!live) return null;
    const kept = prepared.current;
    if (kept && kept.gen === paintGen.current && kept.maxBytes === maxBytes) return kept.blob;
    // Encoding is async and the card can repaint meanwhile, so copy the full-text frame first, opaque
    let canvas: HTMLCanvasElement;
    try {
      canvas = withAllText(() => flatCopy(live));
    } catch {
      return null;
    }
    // What the copy shows: the count after any repaint the copy itself made
    const gen = paintGen.current;
    // Full size first; a busy photo can pass the limit, so step the frame down until it fits. A tainted canvas
    // (media host without CORS) refuses to export.
    const out = await fitCard((scale) => cardJpeg(canvas, scale), maxBytes, isTainted);
    if (!("blob" in out)) return null;
    prepared.current = { gen, maxBytes, blob: out.blob };
    return out.blob;
  };
  useLayoutEffect(() => {
    encodeRef.current = encodeCard;
  });

  useImperativeHandle(ref, () => ({
    snapshot: (maxWidth) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      try {
        const scale = Math.min(1, maxWidth / canvas.width);
        const small = document.createElement("canvas");
        small.width = Math.round(canvas.width * scale);
        small.height = Math.round(canvas.height * scale);
        withAllText(() => small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height));
        return small.toDataURL("image/jpeg", 0.72);
      } catch {
        return null;
      }
    },
    download: async (fileName) => {
      const live = canvasRef.current;
      if (!live) return "failed";
      try {
        // The full-text frame on an opaque canvas first (the card can repaint while it encodes), then RGB PNG
        const blob = await rgbPng(withAllText(() => flatCopy(live)));
        if (!blob) return "failed";
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(href), 4000);
        return "saved";
      } catch (err) {
        // A tainted canvas (media host without CORS) refuses to export
        return isTainted(err) ? "blocked" : "failed";
      }
    },
    cardImage: (maxBytes) => encodeCard(maxBytes),
    prepare: (maxBytes) => {
      prepareFor.current = maxBytes;
      if (maxBytes === null) {
        prepared.current = null;
        if (prepareTimer.current) clearTimeout(prepareTimer.current);
        prepareTimer.current = null;
      } else schedulePrepare();
    },
    seek: (time) => {
      const video = sourceRef.current;
      if (video instanceof HTMLVideoElement) video.currentTime = time;
    },
    record: (ranges, onProgress) =>
      new Promise((resolve) => {
        const canvas = canvasRef.current;
        const video = sourceRef.current;
        if (!canvas || !(video instanceof HTMLVideoElement) || !ranges.length || typeof MediaRecorder === "undefined") return resolve(null);
        const stream = canvas.captureStream(30);
        // Sound: the video plays through Web Audio so the clip can carry it at the chosen volume
        let audioTrack: MediaStreamTrack | undefined;
        try {
          let graph = audioRef.current;
          if (!graph || graph.el !== video) {
            const ctx = new AudioContext();
            const source = ctx.createMediaElementSource(video);
            const gain = ctx.createGain();
            const monitor = ctx.createGain();
            const out = ctx.createMediaStreamDestination();
            source.connect(gain);
            gain.connect(out);
            gain.connect(monitor);
            monitor.connect(ctx.destination);
            graph = { ctx, el: video, source, gain, monitor, out };
            audioRef.current = graph;
          }
          graph.ctx.resume().catch(() => undefined);
          applySound();
          audioTrack = graph.out.stream.getAudioTracks()[0];
        } catch {
          audioTrack = undefined;
        }
        const withSound = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"];
        const silent = ["video/mp4;codecs=avc1.42E01E", "video/webm;codecs=vp9", "video/webm"];
        let mimeType = audioTrack ? withSound.find((type) => MediaRecorder.isTypeSupported(type)) : undefined;
        if (audioTrack && mimeType) stream.addTrack(audioTrack);
        else mimeType = silent.find((type) => MediaRecorder.isTypeSupported(type));
        let recorder: MediaRecorder;
        try {
          if (!mimeType) throw new Error("No supported recording format");
          recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
        } catch {
          return resolve(null);
        }
        const playback = playbackRef.current;
        const chunks: Blob[] = [];
        // Progress runs on output time, so a sped-up part counts for less
        const total = ranges.reduce((sum, r) => sum + (r.end - r.start) / (r.speed ?? 1), 0);
        let done = 0;
        let index = 0;
        // Progress re-renders the editor, so it is reported at most four times a second rather than every
        // frame; reporting every frame left too little time to draw the frames being recorded
        let reportedAt = 0;
        const finish = (blob: Blob | null) => {
          playback.recording = false;
          video.playbackRate = 1;
          applySound();
          video.loop = true;
          video.play().catch(() => undefined);
          resolve(blob);
        };
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = () => finish(new Blob(chunks, { type: mimeType!.split(";")[0] }));
        recorder.onerror = () => finish(null);

        // Play each kept clip in turn; the recorder is paused while the video seeks to the next one
        const playNext = () => {
          const range = ranges[index];
          video.onseeked = () => {
            video.onseeked = null;
            if (recorder.state === "inactive") recorder.start();
            else recorder.resume();
            video.playbackRate = range.speed ?? 1;
            // A browser that blocks playing with sound still gets a clip, without the sound
            video.play().catch(() => {
              video.muted = true;
              video.play().catch(() => recorder.stop());
            });
            const watch = () => {
              if (recorder.state !== "recording") return;
              const fraction = Math.min(1, (done + (video.currentTime - range.start) / (range.speed ?? 1)) / Math.max(0.1, total));
              if (performance.now() - reportedAt > 250) {
                reportedAt = performance.now();
                onProgress(fraction);
              }
              if (video.currentTime < range.end && !video.ended) {
                requestAnimationFrame(watch);
                return;
              }
              done += (range.end - range.start) / (range.speed ?? 1);
              index += 1;
              if (index >= ranges.length) {
                recorder.stop();
                return;
              }
              recorder.pause();
              video.pause();
              playNext();
            };
            watch();
          };
          video.currentTime = range.start;
        };

        playback.recording = true;
        video.loop = false;
        video.pause();
        playNext();
      }),
    editText: (target, caret = "all") => startTyping(target, caret),
  }));

  const size = cardSize(format, backdrop);
  const u = Math.min(size.w, size.h) / 1080;
  /** The photo's frame on a desk template, in canvas px; null when it has none */
  const photoRect = backdrop ? mediaRectFor(layout, format, backdrop) : null;

  const toCanvas = (e: React.PointerEvent | React.MouseEvent) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - bounds.left) / bounds.width) * size.w, y: ((e.clientY - bounds.top) / bounds.height) * size.h, perPx: size.w / bounds.width };
  };

  /** The headline or the story on a desk template: one box with the other (textBlock) */
  const inBlock = (target: CanvasSelection | undefined): boolean => !!textBlock && (target === "headline" || target === `layer:${textBlock.layer}`);

  const rectOf = (target: CanvasSelection): Rect | null => {
    if (target === "background") return photoRect;
    if (textBlock && inBlock(target)) return textBlock.rect(layout);
    if (target === "headline") return rectsRef.current.headline;
    if (target?.startsWith("layer:")) return rectsRef.current.layers[target.slice(6)] ?? null;
    return null;
  };

  const inside = (p: { x: number; y: number }, r: Rect | null) => !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  /** A pointer position on the card, from any event (the typing box's too) */
  const pointAt = (clientX: number, clientY: number) => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width) return null;
    return { x: ((clientX - bounds.left) / bounds.width) * size.w, y: ((clientY - bounds.top) / bounds.height) * size.h, perPx: size.w / bounds.width };
  };

  /**
   * On a box's edge: within BORDER_IN_PX screen px inside its frame line or BORDER_PX outside it (`perPx` turns
   * screen px into card px). Anywhere further in is the words, where a click types.
   */
  const onEdge = (p: { x: number; y: number; perPx: number }, r: Rect | null) => {
    if (!r) return false;
    const out = BORDER_PX * p.perPx;
    if (p.x < r.x - out || p.x > r.x + r.w + out || p.y < r.y - out || p.y > r.y + r.h + out) return false;
    if (!inside(p, r)) return true;
    return Math.min(p.x - r.x, r.x + r.w - p.x, p.y - r.y, r.y + r.h - p.y) <= BORDER_IN_PX * p.perPx;
  };

  /**
   * What a press picks, and whether it landed on the edge of a text box. The edge of the selected box counts
   * just outside its frame line too, where the line is drawn.
   */
  const pickAt = (p: { x: number; y: number; perPx: number }): { target: CanvasSelection; edge: boolean } => {
    const hit = hitTest(p);
    if (isTextTarget(selection) && !isTextTarget(hit) && onEdge(p, rectOf(selection))) return { target: selection, edge: true };
    return { target: hit, edge: isTextTarget(hit) && onEdge(p, rectOf(hit)) };
  };

  /** Topmost thing under the pointer: text boxes, then the headline, then the media (on a desk template, only inside the photo frame) */
  const hitTest = (p: { x: number; y: number }): CanvasSelection => {
    const ids = (layout.layers ?? []).map((l) => l.id).reverse();
    const layerId = ids.find((id) => inside(p, rectsRef.current.layers[id]));
    // Anywhere in the one text box picks it; the part under the pointer is the one typed in
    if (textBlock && (!layerId || layerId === textBlock.layer) && inside(p, textBlock.rect(layout))) return layerId ? `layer:${layerId}` : "headline";
    if (layerId) return `layer:${layerId}`;
    if (inside(p, rectsRef.current.headline)) return "headline";
    if (backdrop) return inside(p, photoRect) ? "background" : null;
    return "background";
  };

  const patchLayer = (base: TemplateLayout, id: string, changes: Partial<NonNullable<TemplateLayout["layers"]>[number]>) => ({
    ...base,
    layers: (base.layers ?? []).map((l) => (l.id === id ? { ...l, ...changes } : l)),
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const p = toCanvas(e);
    const { target, edge } = pickAt(p);
    onSelect?.(target);
    // The template's own picture: nothing to pick or drag
    if (!target) return;
    const r = rectOf(target);
    // Right and middle buttons select what is under the pointer but never drag it
    // (Ctrl+click on a Mac is a right-click too)
    if (e.pointerType === "mouse" && (e.button !== 0 || (e.ctrlKey && isMac()))) return;
    // A plain click on text (no drag) types in it right there, caret under the pointer. A click on the box's
    // edge only selects it, so the arrow keys move it; the card keeps the focus for them.
    if (edge) frameRef.current?.focus({ preventScroll: true });
    const typeOnClick = target !== "background" && !edge && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    const pan = target === "background" && (!backdrop || e.altKey);
    dragRef.current = { target, x: p.x, y: p.y, layout, dx: r ? p.x - (r.x + r.w / 2) : 0, dy: r ? p.y - (r.y + r.h / 2) : 0, box: r ? { ...r } : null, clientX: e.clientX, clientY: e.clientY, moved: false, typeOnClick, pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  /** Writes a hand-sized box back: from now on it keeps this size and its text shrinks to fit. */
  const applyBox = (base: TemplateLayout, target: Exclude<CanvasSelection, null>, box: FrameBox): TemplateLayout => {
    // The photo's frame on a desk template
    if (target === "background") return { ...base, photoBox: { x: box.x / size.w, y: box.y / size.h, w: box.w / size.w, h: box.h / size.h } };
    if (textBlock && inBlock(target)) return textBlock.place(base, box);
    const centre = { x: (box.x + box.w / 2) / size.w, y: (box.y + box.h / 2) / size.h };
    if (target === "headline") {
      const areaW = rectsRef.current.headlineArea?.width || size.w;
      return { ...base, textX: centre.x, textY: centre.y, textWidth: box.w / areaW, textHeight: box.h / size.h };
    }
    return patchLayer(base, target.slice(6), { x: centre.x, y: centre.y, width: box.w / size.w, height: box.h / size.h });
  };

  /** One of the eight handles on the selected box: top and bottom change the height, the sides the width, corners both. */
  const onHandleDown = (handle: BoxHandle, e: React.PointerEvent<HTMLSpanElement>) => {
    const frame = frameRef.current;
    if (!editable || !onLayoutChange || !frame || !selection || (selection === "background" && !photoRect)) return;
    const target = selection;
    // The box as drawn now; an older design without a height starts from the height its text takes
    const start = rectOf(target);
    if (!start) return;
    const base = layout;
    startGesture(e, {
      frame,
      gesture: handle,
      start: { ...start },
      limits: { W: size.w, H: size.h, minW: MIN_BOX.w * u, minH: MIN_BOX.h * u },
      onChange: (box) => onLayoutChange(applyBox(base, target, box)),
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag && editable && e.pointerType === "mouse") {
      const { target, edge } = pickAt(toCanvas(e));
      setHover(edge ? "edge" : isTextTarget(target) ? "text" : null);
      setModifierHeld(anyModifier(e));
    }
    if (!drag || !onLayoutChange) return;
    // A press that wobbles a few px is still a click; the drag starts once it really moves
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.clientX, e.clientY - drag.clientY) < CLICK_SLOP) return;
      drag.moved = true;
    }
    const p = toCanvas(e);
    const base = drag.layout;

    // The photo's frame on a desk template moves like a text box
    if (drag.target === "background" && !drag.pan) {
      if (!drag.box) return;
      onLayoutChange(applyBox(base, "background", resizeBox(drag.box, "move", p.x - drag.x, p.y - drag.y, { W: size.w, H: size.h, minW: 0, minH: 0 })));
      return;
    }

    if (drag.target !== "background") {
      // Move by the box centre, snapping to the frame's centre lines
      let cx = p.x - drag.dx;
      let cy = p.y - drag.dy;
      const snapV = Math.abs(cx - size.w / 2) < SNAP * u;
      const snapH = Math.abs(cy - size.h / 2) < SNAP * u;
      if (snapV) cx = size.w / 2;
      if (snapH) cy = size.h / 2;
      setGuides((g) => (g.v === snapV && g.h === snapH ? g : { v: snapV, h: snapH }));
      const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
      // The box stays on the card
      const keepIn = (c: number, extent: number, total: number) => (extent >= total ? total / 2 : Math.max(extent / 2, Math.min(total - extent / 2, c)));
      if (drag.box) {
        cx = keepIn(cx, drag.box.w, size.w);
        cy = keepIn(cy, drag.box.h, size.h);
      }
      if (textBlock && drag.box && inBlock(drag.target)) {
        onLayoutChange(textBlock.place(base, { ...drag.box, x: cx - drag.box.w / 2, y: cy - drag.box.h / 2 }));
      } else if (drag.target === "headline") {
        if (base.textHeight !== undefined) onLayoutChange({ ...base, textX: clamp01(cx / size.w), textY: clamp01(cy / size.h) });
        else onLayoutChange({ ...base, textY: Math.max(0.05, Math.min(0.95, cy / size.h)), ...((base.textWidth ?? 1) < 1 ? { textX: clamp01(cx / size.w) } : {}) });
      } else {
        onLayoutChange(patchLayer(base, drag.target.slice(6), { x: clamp01(cx / size.w), y: clamp01(cy / size.h) }));
      }
      return;
    }

    const m = mediaRectFor(base, format, backdrop);
    const fitted = m && sourceRef.current && fittedSize(sourceRef.current, m.w, m.h, base.bgZoom, base.fit);
    if (!fitted) return;
    const slackX = Math.abs(fitted.dw - m.w);
    const slackY = Math.abs(fitted.dh - m.h);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    onLayoutChange({
      ...layout,
      bgX: slackX > 1 ? clamp(base.bgX + ((p.x - drag.x) * 2) / slackX) : 0,
      bgY: slackY > 1 ? clamp(base.bgY + ((p.y - drag.y) * 2) / slackY) : 0,
    });
  };

  /**
   * Keyboard resize for the selected text: Alt+arrows move the bottom-right corner (Shift for bigger steps).
   * Plain arrows are left to the editor, which moves the selection.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editable || !onLayoutChange || !e.altKey || !e.key.startsWith("Arrow")) return;
    if (!selection || (selection === "background" && !photoRect)) return;
    const start = rectOf(selection);
    if (!start) return;
    e.preventDefault();
    // Keeps the editor's own arrow handling (which moves the box) out of it
    e.stopPropagation();
    const step = (e.shiftKey ? NUDGE.big : NUDGE.small) * Math.min(size.w, size.h);
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    const box = resizeBox({ ...start }, "se", dx, dy, { W: size.w, H: size.h, minW: MIN_BOX.w * u, minH: MIN_BOX.h * u });
    onLayoutChange(applyBox(layout, selection, box));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides({ v: false, h: false });
    if (e.type === "pointerup" && drag && !drag.moved && drag.typeOnClick && drag.target !== "background") startTyping(drag.target, { x: e.clientX, y: e.clientY });
  };

  /** The text being typed in, as stored, and how to write it back */
  const typedLayer = typedBlock ? typedBlock : typingIn?.startsWith("layer:") ? layout.layers?.find((l) => l.id === typingIn.slice(6)) : undefined;
  const limitOf = (target: TextTarget) => (target === "headline" ? (textLimits?.headline ?? 500) : (textLimits?.byLayer?.[target.slice(6)] ?? textLimits?.layer ?? 300));
  const typedValue = typedBlock ? (blockDraft ?? joinBlockText(layout.headline, typedBlock.text)) : typingIn === "headline" ? layout.headline : (typedLayer?.text ?? "");
  // Never shorter than the words already there, so typing never cuts a longer text short
  const typedLimit = !typingIn ? 0 : Math.max(typedValue.length, typedBlock ? limitOf("headline") + 2 + limitOf(`layer:${typedBlock.id}`) : limitOf(typingIn));
  const writeTyped = (value: string) => {
    if (!onLayoutChange || !typingIn) return;
    if (typedBlock) {
      // Heading and story as typed in the one box, each kept to its own limit (but never cut shorter than it was)
      setBlockDraft(value);
      const { headline, body } = splitBlockText(value);
      const cut = (text: string, was: string, limit: number) => text.slice(0, Math.max(limit, was.length));
      onLayoutChange(patchLayer({ ...layout, headline: cut(headline, layout.headline, limitOf("headline")) }, typedBlock.id, { text: cut(body, typedBlock.text, limitOf(`layer:${typedBlock.id}`)) }));
      return;
    }
    const text = value.slice(0, typedLimit);
    onLayoutChange(typingIn === "headline" ? { ...layout, headline: text } : patchLayer(layout, typingIn.slice(6), { text }));
  };
  const stopTyping = (refocus: boolean) => {
    setTyping(null);
    setBlockDraft(null);
    // Back on the card, so the arrows, Delete and Ctrl+Z act on the selected box again
    if (refocus) frameRef.current?.focus({ preventScroll: true });
  };
  const onTypeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // The editor's shortcuts (Ctrl+Enter posts, Delete removes the box, arrows move it) stay out while typing;
    // only Ctrl+S (save) goes through
    const key = eventKey(e);
    if (key === "mod+s") return;
    e.stopPropagation();
    if (e.nativeEvent.isComposing || e.key === "Process") return;
    if (key === "escape" || key === "mod+enter") {
      e.preventDefault();
      stopTyping(true);
    }
  };

  /** How the words being typed look: as close to the card's own drawing as a text box can get */
  const typeStyle = (): React.CSSProperties | null => {
    if (!typingIn || !typeArea) return null;
    // The one box takes the story's look; the heading's own colour shows through the mirror under it (typeMirror)
    const s = typedBlock ? resolveLayerStyle(typedBlock) : typingIn === "headline" ? resolveHeadlineStyle(layout, tag) : typedLayer ? resolveLayerStyle(typedLayer) : null;
    if (!s) return null;
    const font = fontById(s.font);
    const cq = (px: number) => `${(px / size.w) * 100}cqw`;
    // An empty heading takes no room on the card, but the one text still starts with its blank line
    const lift = typedBlock && !layout.headline.trim() ? 2 * typeArea.lineHeight : 0;
    return {
      position: "absolute",
      left: `${(typeArea.x / size.w) * 100}%`,
      top: `${((typeArea.top - lift) / size.h) * 100}%`,
      width: `${(typeArea.width / size.w) * 100}%`,
      height: `${((typeArea.height + lift) / size.h) * 100}%`,
      margin: 0,
      padding: 0,
      border: 0,
      // A single box shows where its words end; the one box already has the selection frame round it
      outline: typedBlock ? "none" : `1px dashed ${SELECT_BLUE}`,
      outlineOffset: 2,
      overflowWrap: "break-word",
      background: "transparent",
      resize: "none",
      overflow: "hidden",
      whiteSpace: "pre-wrap",
      fontFamily: `${font.family}, "Nirmala UI", sans-serif`,
      fontWeight: nearestWeight(font, s.weight),
      fontStyle: s.italic ? "italic" : "normal",
      fontSize: cq(typeArea.size),
      lineHeight: typeArea.lineHeight / typeArea.size,
      letterSpacing: cq(s.letterSpacing * typeArea.size),
      textAlign: s.align,
      textTransform: s.uppercase ? "uppercase" : "none",
      textDecoration: s.underline ? "underline" : "none",
      textShadow: s.shadow > 0 ? `0 ${cq(s.shadow * 6)} ${cq(s.shadow * 28)} ${s.shadowColor}` : "none",
      WebkitTextStroke: s.strokeWidth > 0 ? `${cq(s.strokeWidth * 2)} ${s.strokeColor}` : undefined,
      color: s.color,
      caretColor: s.color,
      opacity: s.opacity,
      transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined,
      transformOrigin: `${cq(typeArea.cx - typeArea.x)} ${cq(typeArea.cy - typeArea.top + lift)}`,
      cursor: "text",
      userSelect: "text",
      touchAction: "auto",
      zIndex: 1,
    };
  };
  const typeCss = typeStyle();
  /**
   * The one box shows the heading in its own colour: the words are drawn by a copy laid out exactly as the
   * textarea (same box, face and wrapping) right under it, and the textarea's own letters are clear, so only its
   * caret and selection show. The copy's heading is everything before the first blank line, as it will be split.
   */
  const mirrorRef = useRef<HTMLDivElement>(null);
  const typeMirror = typedBlock && typeCss ? { css: { ...typeCss, pointerEvents: "none", userSelect: "none", zIndex: 1 } as React.CSSProperties, headLength: splitBlockText(typedValue).headline.length, headColor: resolveHeadlineStyle(layout, tag).color } : null;
  const areaCss: React.CSSProperties | null = typeMirror && typeCss ? { ...typeCss, color: "transparent", WebkitTextFillColor: "transparent", textShadow: "none", WebkitTextStroke: undefined, textDecoration: "none", zIndex: 2 } : typeCss;

  const photoPct = photoRect ? { x: (photoRect.x / size.w) * 100, y: (photoRect.y / size.h) * 100, w: (photoRect.w / size.w) * 100, h: (photoRect.h / size.h) * 100 } : undefined;
  const blockRect = textBlock && inBlock(selection) ? textBlock.rect(layout) : null;
  const blockPct = blockRect ? { x: (blockRect.x / size.w) * 100, y: (blockRect.y / size.h) * 100, w: (blockRect.w / size.w) * 100, h: (blockRect.h / size.h) * 100 } : undefined;
  const selectedBox = selection === "background" ? photoPct : blockPct ?? (selection ? boxes[selection] : undefined);

  return (
    <div
      ref={frameRef}
      tabIndex={editable ? 0 : undefined}
      role={editable ? "group" : undefined}
      aria-label={editable ? "Card designer. Click a text to type in it, or click its edge to select it. Arrow keys move the selected text; Escape stops typing; Alt and arrow keys resize it. Right-click for options." : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={endDrag}
      onContextMenu={(e) => {
        if (!editable || !onContextTarget) return;
        // Tell the editor what is under the pointer; its menu opens from the stage around the card
        const target = hitTest(toCanvas(e));
        onSelect?.(target);
        // The template's own picture: the stage's menu
        if (target) onContextTarget(target);
      }}
      onDoubleClick={(e) => {
        // The first click of the two has already started typing; this only catches a click that did not
        if (!editable || typingIn) return;
        const target = hitTest(toCanvas(e));
        if (target && target !== "background") startTyping(target, { x: e.clientX, y: e.clientY });
      }}
      style={{
        position: "relative",
        lineHeight: 0,
        maxWidth: "100%",
        maxHeight: "100%",
        aspectRatio: `${size.w} / ${size.h}`,
        cursor: editable ? (hover === "text" && !modifierHeld ? "text" : "move") : "default",
        touchAction: editable ? "none" : "auto",
        userSelect: "none",
        // Lets the typing box size its words to the card as drawn on screen
        ...(typingIn ? { containerType: "inline-size" as const } : {}),
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={Math.round(size.w * renderScale)}
        height={Math.round(size.h * renderScale)}
        role="img"
        aria-label={`Template: ${layout.headline}`}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {editable && selection === "background" && !backdrop && (
        <div style={{ position: "absolute", inset: 0, outline: `2px solid ${SELECT_BLUE}`, outlineOffset: -2, pointerEvents: "none" }} />
      )}
      {typeMirror && (
        <div ref={mirrorRef} aria-hidden style={typeMirror.css}>
          <span style={{ color: typeMirror.headColor }}>{typedValue.slice(0, typeMirror.headLength)}</span>
          {typedValue.slice(typeMirror.headLength)}
          {/* A last empty line still takes its room, as in the textarea */}
          {"​"}
        </div>
      )}
      {typingIn && areaCss && (
        <textarea
          ref={typeRef}
          value={typedValue}
          maxLength={typedLimit}
          aria-label={typedBlock ? "Card heading, a blank line, then the story" : typingIn === "headline" ? "Card text" : "Text box words"}
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          spellCheck={false}
          onChange={(e) => writeTyped(e.target.value)}
          onKeyDown={onTypeKeyDown}
          // Ends typing when focus leaves for something else on the page, not when the window loses it
          onBlur={() => document.hasFocus() && stopTyping(false)}
          // Clicks, selection drags and the right-click menu inside belong to the text, not the card. A click on
          // the box's edge stops typing and goes on to the card, which selects the box to move.
          onPointerDown={(e) => {
            const p = pointAt(e.clientX, e.clientY);
            if (p && typingIn && onEdge(p, rectOf(typingIn))) {
              e.preventDefault();
              stopTyping(false);
              return;
            }
            e.stopPropagation();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          style={areaCss}
        />
      )}
      {editable && selectedBox && <ResizeFrame box={selectedBox} color={offCard(selectedBox) ? OFF_CARD_RED : SELECT_BLUE} onHandleDown={onHandleDown} />}
      {guides.v && <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#FF3EA5", pointerEvents: "none" }} />}
      {guides.h && <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#FF3EA5", pointerEvents: "none" }} />}
    </div>
  );
}
