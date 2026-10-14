"use client";

import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BreakingTag, CardLayout, ClipSegment, FtpMedia } from "@/types/newsroom";
import { CHANNEL } from "@/constants";

export type TemplateFormat = "x" | "ig_post" | "ig_reel";

export const TEMPLATE_FORMATS: Record<TemplateFormat, { w: number; h: number; label: string }> = {
  x: { w: 1600, h: 900, label: "16:9" },
  ig_post: { w: 1080, h: 1350, label: "Post 4:5" },
  ig_reel: { w: 1080, h: 1920, label: "Reel 9:16" },
};

export const BREAKING_RED = "#D7141A";
export const BIG_BREAKING_YELLOW = "#FFD400";

export const HEADLINE_COLORS = ["#FFFFFF", BIG_BREAKING_YELLOW] as const;

/** The parts of the fixed template an editor can change. */
export type TemplateLayout = CardLayout;

export const DEFAULT_TEXT_Y: Record<TemplateFormat, number> = { x: 0.68, ig_post: 0.72, ig_reel: 0.7 };

export function defaultLayout(headline: string, format: TemplateFormat): TemplateLayout {
  return { headline, fontScale: 1, textY: DEFAULT_TEXT_Y[format], align: "left", color: HEADLINE_COLORS[0], fit: "cover", backdrop: "blur", bgZoom: 1, bgX: 0, bgY: 0 };
}

export type CanvasSelection = "headline" | "background" | null;

// The app's webfonts are exposed as CSS variables; canvas needs the resolved family names
function cssFont(variable: string) {
  const family = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return family ? `${family}, ` : "";
}
const latinFontStack = () => `${cssFont("--font-sans")}"Segoe UI", sans-serif`;
const headlineFontStack = () => `${cssFont("--font-deva")}${cssFont("--font-sans")}"Nirmala UI", "Mangal", sans-serif`;

type Source = HTMLImageElement | HTMLVideoElement;
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function sourceSize(source: Source) {
  return source instanceof HTMLVideoElement
    ? { w: source.videoWidth, h: source.videoHeight }
    : { w: source.naturalWidth, h: source.naturalHeight };
}

/** Size of the media once fitted to the frame and zoomed. */
function fittedSize(source: Source, W: number, H: number, zoom: number, fit: TemplateLayout["fit"] = "cover") {
  const { w, h } = sourceSize(source);
  if (!w || !h) return null;
  const scale = (fit === "contain" ? Math.min(W / w, H / h) : Math.max(W / w, H / h)) * zoom;
  return { dw: w * scale, dh: h * scale };
}

export type TrimRange = ClipSegment;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Paints the fixed breaking-news template and returns where the headline block landed. */
function drawTemplate(ctx: CanvasRenderingContext2D, format: TemplateFormat, source: Source | null, layout: TemplateLayout, tag: BreakingTag, handle: string): Rect | null {
  const { w: W, h: H } = TEMPLATE_FORMATS[format];
  const u = Math.min(W, H) / 1080;
  const pad = 56 * u;

  ctx.fillStyle = "#0B0B0D";
  ctx.fillRect(0, 0, W, H);

  // Backdrop, visible wherever the media does not reach
  const fill = source && fittedSize(source, W, H, 1.15);
  if (layout.fit === "contain" && layout.backdrop !== "blur") {
    ctx.fillStyle = layout.backdrop;
    ctx.fillRect(0, 0, W, H);
  } else if (layout.fit === "contain" && source && fill) {
    ctx.filter = `blur(${36 * u}px)`;
    ctx.drawImage(source, (W - fill.dw) / 2, (H - fill.dh) / 2, fill.dw, fill.dh);
    ctx.filter = "none";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);
  }

  // Media
  const fitted = source && fittedSize(source, W, H, layout.bgZoom, layout.fit);
  if (source && fitted) {
    const x = (W - fitted.dw) / 2 + (layout.bgX * Math.abs(fitted.dw - W)) / 2;
    const y = (H - fitted.dh) / 2 + (layout.bgY * Math.abs(fitted.dh - H)) / 2;
    ctx.drawImage(source, x, y, fitted.dw, fitted.dh);
  }

  // Legibility scrims
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.28);
  top.addColorStop(0, "rgba(0,0,0,0.62)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.28);
  const bottom = ctx.createLinearGradient(0, H * 0.4, 0, H);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H * 0.4, W, H * 0.6);

  // Tag slab
  const isBig = tag === "big_breaking";
  const tagLabel = isBig ? "BIG BREAKING" : "BREAKING NEWS";
  ctx.font = `700 ${40 * u}px ${latinFontStack()}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const tagW = ctx.measureText(tagLabel).width + 44 * u;
  const tagH = 72 * u;
  ctx.fillStyle = isBig ? BIG_BREAKING_YELLOW : BREAKING_RED;
  ctx.fillRect(pad, pad, tagW, tagH);
  ctx.fillStyle = isBig ? "#111111" : "#FFFFFF";
  ctx.fillText(tagLabel, pad + 22 * u, pad + tagH / 2 + 2 * u);

  // Channel mark
  ctx.font = `700 ${30 * u}px ${latinFontStack()}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(CHANNEL.name, W - pad, pad + tagH / 2 + 2 * u);
  ctx.fillStyle = BREAKING_RED;
  const markW = ctx.measureText(CHANNEL.name).width;
  ctx.fillRect(W - pad - markW, pad + tagH / 2 + 26 * u, markW, 5 * u);

  // Footer band
  const bandH = 76 * u;
  ctx.fillStyle = BREAKING_RED;
  ctx.fillRect(0, H - bandH, W, bandH);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${28 * u}px ${latinFontStack()}`;
  ctx.textAlign = "left";
  ctx.fillText(handle, pad, H - bandH / 2 + 2 * u);
  ctx.textAlign = "right";
  ctx.font = `600 ${26 * u}px ${latinFontStack()}`;
  const stamp = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  ctx.fillText(stamp, W - pad, H - bandH / 2 + 2 * u);

  // Headline block
  const fontSize = (format === "x" ? 70 : 76) * u * layout.fontScale;
  const lineHeight = fontSize * 1.32;
  const barW = 12 * u;
  const innerPad = 30 * u;
  const centered = layout.align === "center";
  ctx.font = `700 ${fontSize}px ${headlineFontStack()}`;
  const textW = W - pad * 2 - barW - innerPad * 2;
  const lines = wrapLines(ctx, layout.headline, textW);
  if (lines.length === 0) return null;

  const blockH = lines.length * lineHeight + innerPad * 1.4;
  const minY = pad + tagH + 24 * u;
  const maxY = H - bandH - 24 * u - blockH;
  const y = Math.max(minY, Math.min(maxY, H * layout.textY - blockH / 2));

  ctx.fillStyle = "rgba(8,8,10,0.72)";
  ctx.fillRect(pad, y, W - pad * 2, blockH);
  ctx.fillStyle = isBig ? BIG_BREAKING_YELLOW : BREAKING_RED;
  if (centered) ctx.fillRect(pad, y + blockH - barW * 0.6, W - pad * 2, barW * 0.6);
  else ctx.fillRect(pad, y, barW, blockH);
  ctx.fillStyle = layout.color;
  ctx.textAlign = centered ? "center" : "left";
  const textX = centered ? W / 2 : pad + barW + innerPad;
  lines.forEach((line, i) => ctx.fillText(line, textX, y + innerPad * 0.7 + lineHeight * (i + 0.5)));

  return { x: pad, y, w: W - pad * 2, h: blockH };
}

export interface TemplateCanvasHandle {
  /** Small JPEG of the current frame, or null when the media host blocks pixel access */
  snapshot: (maxWidth: number) => string | null;
  /** Saves the full-size frame as PNG; false when the media host blocks pixel access */
  download: (fileName: string) => boolean;
  /** Moves a video background to `time` seconds */
  seek: (time: number) => void;
  /** Renders the kept clips back to back with the template burnt in; null when the browser or media host does not allow it */
  record: (segments: TrimRange[], onProgress: (fraction: number) => void) => Promise<Blob | null>;
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
  onEditHeadline?: () => void;
  paused?: boolean;
  /** Video only: the parts of the source that are kept, in order; playback skips everything else */
  segments?: TrimRange[];
  onDuration?: (seconds: number) => void;
  onTime?: (seconds: number) => void;
  ref?: React.Ref<TemplateCanvasHandle>;
  style?: React.CSSProperties;
}

const SELECT_BLUE = "#2F7BFF";

export default function TemplateCanvas({ media, format, handle = `@${CHANNEL.xHandle}`, tag, layout, onLayoutChange, selection, onSelect, onEditHeadline, paused, segments, onDuration, onTime, ref, style }: TemplateCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<Source | null>(null);
  const rectRef = useRef<Rect | null>(null);
  const dragRef = useRef<{ target: "headline" | "background"; x: number; y: number; layout: TemplateLayout; grabOffset: number } | null>(null);
  const stateRef = useRef({ format, tag, layout, handle });
  const playbackRef = useRef({ segments, onDuration, onTime, recording: false, lastReport: 0 });
  // Headline box as percentages of the frame, for the selection outline
  const [box, setBox] = useState<Rect | null>(null);
  const editable = !!onLayoutChange;

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { format: f, tag: t, layout: l, handle: h } = stateRef.current;
    const rect = drawTemplate(ctx, f, sourceRef.current, l, t, h);
    rectRef.current = rect;
    const { w: W, h: H } = TEMPLATE_FORMATS[f];
    const next = rect && { x: (rect.x / W) * 100, y: (rect.y / H) * 100, w: (rect.w / W) * 100, h: (rect.h / H) * 100 };
    setBox((prev) => (prev && next && Math.abs(prev.y - next.y) < 0.05 && Math.abs(prev.h - next.h) < 0.05 ? prev : next));
  }, []);

  useEffect(() => {
    stateRef.current = { format, tag, layout, handle };
    paint();
  }, [format, tag, layout, handle, paint]);

  useEffect(() => {
    Object.assign(playbackRef.current, { segments, onDuration, onTime });
  }, [segments, onDuration, onTime]);

  // Load the background: images draw once, videos repaint every frame
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
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

    if (media.kind === "video") {
      if (media.posterUrl) loadImage(media.posterUrl);
      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      const el = video;
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
        }
        const now = performance.now();
        if (now - playback.lastReport > 80) {
          playback.lastReport = now;
          playback.onTime?.(el.currentTime);
        }
        paint();
        frame = requestAnimationFrame(tick);
      };
      el.onloadeddata = () => {
        if (cancelled) return;
        sourceRef.current = el;
        if (Number.isFinite(el.duration)) playbackRef.current.onDuration?.(el.duration);
        if (!paused) el.play().catch(() => undefined);
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
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
    // `paused` is handled by the effect below so toggling it does not reload the media
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.url, media.kind, media.posterUrl, paint]);

  useEffect(() => {
    const source = sourceRef.current;
    if (!(source instanceof HTMLVideoElement)) return;
    if (paused) source.pause();
    else source.play().catch(() => undefined);
  }, [paused]);

  useImperativeHandle(ref, () => ({
    snapshot: (maxWidth) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      try {
        const scale = Math.min(1, maxWidth / canvas.width);
        const small = document.createElement("canvas");
        small.width = Math.round(canvas.width * scale);
        small.height = Math.round(canvas.height * scale);
        small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
        return small.toDataURL("image/jpeg", 0.72);
      } catch {
        return null;
      }
    },
    download: (fileName) => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      try {
        const link = document.createElement("a");
        link.href = canvas.toDataURL("image/png");
        link.download = fileName;
        link.click();
        return true;
      } catch {
        return false;
      }
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
        const mimeType = ["video/mp4;codecs=avc1.42E01E", "video/webm;codecs=vp9", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
        let recorder: MediaRecorder;
        try {
          if (!mimeType) throw new Error("No supported recording format");
          recorder = new MediaRecorder(canvas.captureStream(30), { mimeType, videoBitsPerSecond: 6_000_000 });
        } catch {
          return resolve(null);
        }
        const playback = playbackRef.current;
        const chunks: Blob[] = [];
        const total = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
        let done = 0;
        let index = 0;
        const finish = (blob: Blob | null) => {
          playback.recording = false;
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
            video.play().catch(() => recorder.stop());
            const watch = () => {
              if (recorder.state !== "recording") return;
              onProgress(Math.min(1, (done + video.currentTime - range.start) / Math.max(0.1, total)));
              if (video.currentTime < range.end && !video.ended) {
                requestAnimationFrame(watch);
                return;
              }
              done += range.end - range.start;
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
  }));

  const size = TEMPLATE_FORMATS[format];

  const toCanvas = (e: React.PointerEvent | React.MouseEvent) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - bounds.left) / bounds.width) * size.w, y: ((e.clientY - bounds.top) / bounds.height) * size.h };
  };

  const hitsHeadline = (p: { x: number; y: number }) => {
    const r = rectRef.current;
    return !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const p = toCanvas(e);
    const target = hitsHeadline(p) ? "headline" : "background";
    const r = rectRef.current;
    onSelect?.(target);
    dragRef.current = { target, x: p.x, y: p.y, layout, grabOffset: r ? p.y - (r.y + r.h / 2) : 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !onLayoutChange) return;
    const p = toCanvas(e);
    if (drag.target === "headline") {
      onLayoutChange({ ...layout, textY: Math.max(0.08, Math.min(0.94, (p.y - drag.grabOffset) / size.h)) });
      return;
    }
    const fitted = sourceRef.current && fittedSize(sourceRef.current, size.w, size.h, layout.bgZoom, layout.fit);
    if (!fitted) return;
    const slackX = Math.abs(fitted.dw - size.w);
    const slackY = Math.abs(fitted.dh - size.h);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    onLayoutChange({
      ...layout,
      bgX: slackX > 1 ? clamp(drag.layout.bgX + ((p.x - drag.x) * 2) / slackX) : 0,
      bgY: slackY > 1 ? clamp(drag.layout.bgY + ((p.y - drag.y) * 2) / slackY) : 0,
    });
  };

  const endDrag = () => (dragRef.current = null);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => editable && hitsHeadline(toCanvas(e)) && onEditHeadline?.()}
      style={{
        position: "relative",
        lineHeight: 0,
        maxWidth: "100%",
        maxHeight: "100%",
        aspectRatio: `${size.w} / ${size.h}`,
        cursor: editable ? "move" : "default",
        touchAction: editable ? "none" : "auto",
        userSelect: "none",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        width={size.w}
        height={size.h}
        role="img"
        aria-label={`Template: ${layout.headline}`}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {editable && selection === "background" && (
        <div style={{ position: "absolute", inset: 0, outline: `2px solid ${SELECT_BLUE}`, outlineOffset: -2, pointerEvents: "none" }} />
      )}
      {editable && selection === "headline" && box && (
        <div style={{ position: "absolute", left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, outline: `2px solid ${SELECT_BLUE}`, pointerEvents: "none" }}>
          {[
            { left: -5, top: -5 },
            { right: -5, top: -5 },
            { left: -5, bottom: -5 },
            { right: -5, bottom: -5 },
          ].map((pos, i) => (
            <span key={i} style={{ position: "absolute", width: 10, height: 10, borderRadius: "50%", background: "#fff", border: `2px solid ${SELECT_BLUE}`, ...pos }} />
          ))}
        </div>
      )}
    </div>
  );
}
