"use client";

import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BreakingTag, CardLayout, ClipSegment, FtpMedia } from "@/types/newsroom";
import { CHANNEL } from "@/constants";
import { CardRects, FrameTime, MIN_BOX, Rect, TEMPLATE_FORMATS, TemplateFormat, drawCard, fittedSize, fontsFor, mediaRectFor } from "./cardRender";
import { BoxHandle, FrameBox, ResizeFrame, resizeBox, useBoxGesture } from "./ResizeFrame";

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

type Source = HTMLImageElement | HTMLVideoElement;

export type TrimRange = ClipSegment;

export interface TemplateCanvasHandle {
  /** Small JPEG of the current frame, or null when the media host blocks pixel access */
  snapshot: (maxWidth: number) => string | null;
  /** Saves the full-size frame as PNG; false when the media host blocks pixel access */
  download: (fileName: string) => boolean;
  /** The current frame as a PNG no bigger than `maxBytes`, scaled down if needed; null when the media host blocks pixel access */
  png: (maxBytes: number) => Promise<Blob | null>;
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
  /** Double-click on the headline or a text box */
  onEditText?: (selection: CanvasSelection) => void;
  /** Draws at a fraction of full size; for thumbnails */
  renderScale?: number;
  paused?: boolean;
  /** Video only: the parts of the source that are kept, in order; playback skips everything else */
  segments?: TrimRange[];
  onDuration?: (seconds: number) => void;
  onTime?: (seconds: number) => void;
  /** Video only: plays the sound in the editor. Saved clips carry the sound either way. */
  sound?: boolean;
  ref?: React.Ref<TemplateCanvasHandle>;
  style?: React.CSSProperties;
}

const SELECT_BLUE = "#2F7BFF";

type Drag = { target: Exclude<CanvasSelection, null>; x: number; y: number; layout: TemplateLayout; dx: number; dy: number; box: Rect | null };

/** How close, in canvas px at 1080, a dragged box's centre snaps to the frame's centre lines */
const SNAP = 14;

export default function TemplateCanvas({ media, format, handle = `@${CHANNEL.xHandle}`, tag, layout, onLayoutChange, selection, onSelect, onEditText, renderScale = 1, paused, segments, onDuration, onTime, sound = false, ref, style }: TemplateCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const startGesture = useBoxGesture();
  const sourceRef = useRef<Source | null>(null);
  const rectsRef = useRef<CardRects>({ headline: null, headlineArea: null, layers: {} });
  const dragRef = useRef<Drag | null>(null);
  const stateRef = useRef({ format, tag, layout, handle, renderScale });
  const playbackRef = useRef({ segments, onDuration, onTime, recording: false, lastReport: 0 });
  // Sound for saved clips goes through Web Audio, built the first time a clip is saved
  const audioRef = useRef<{ ctx: AudioContext; el: HTMLVideoElement; source: MediaElementAudioSourceNode; gain: GainNode; monitor: GainNode; out: MediaStreamAudioDestinationNode } | null>(null);
  const soundRef = useRef({ sound, volume: layout.volume ?? 1 });
  // Where the headline and text boxes landed, as percentages of the frame, for the selection outlines
  const [boxes, setBoxes] = useState<Record<string, Rect>>({});
  // Centre guides shown while a snapped box is dragged
  const [guides, setGuides] = useState({ v: false, h: false });
  const editable = !!onLayoutChange;

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { format: f, tag: t, layout: l, handle: h, renderScale: scale } = stateRef.current;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // Video frames carry the playhead, so text timing, animations and fades play
    const source = sourceRef.current;
    let frame: FrameTime | undefined;
    if (source instanceof HTMLVideoElement && Number.isFinite(source.duration)) {
      const ranges = playbackRef.current.segments;
      frame = { time: source.currentTime, from: ranges?.[0]?.start ?? 0, to: ranges?.[ranges.length - 1]?.end ?? source.duration };
    }
    const rects = drawCard(ctx, f, source, l, t, h, frame);
    rectsRef.current = rects;
    const { w: W, h: H } = TEMPLATE_FORMATS[f];
    const pct = (r: Rect) => ({ x: (r.x / W) * 100, y: (r.y / H) * 100, w: (r.w / W) * 100, h: (r.h / H) * 100 });
    const next: Record<string, Rect> = {};
    if (rects.headline) next.headline = pct(rects.headline);
    for (const [id, r] of Object.entries(rects.layers)) next[`layer:${id}`] = pct(r);
    // Videos repaint every frame, so only store boxes that actually moved. While a clip records, nobody
    // can click a box, and re-rendering for animated text would take time the recording needs for drawing
    if (playbackRef.current.recording) return;
    setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    stateRef.current = { format, tag, layout, handle, renderScale };
    paint();
  }, [format, tag, layout, handle, renderScale, paint]);

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

    if (media.kind === "video") {
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
  }, [media.url, media.kind, media.posterUrl, paint, applySound]);

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
    png: async (maxBytes) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const encode = (source: HTMLCanvasElement) =>
        new Promise<Blob | null>((resolve) => {
          try {
            source.toBlob(resolve, "image/png");
          } catch {
            // A tainted canvas (media host without CORS) refuses to export
            resolve(null);
          }
        });
      // Full size first; a busy photo can pass the limit, so step the frame down until it fits
      for (const scale of [1, 0.8, 0.65, 0.5]) {
        let source = canvas;
        if (scale < 1) {
          source = document.createElement("canvas");
          source.width = Math.round(canvas.width * scale);
          source.height = Math.round(canvas.height * scale);
          source.getContext("2d")?.drawImage(canvas, 0, 0, source.width, source.height);
        }
        const blob = await encode(source);
        if (!blob) return null;
        if (blob.size <= maxBytes) return blob;
      }
      return null;
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
  }));

  const size = TEMPLATE_FORMATS[format];
  const u = Math.min(size.w, size.h) / 1080;

  const toCanvas = (e: React.PointerEvent | React.MouseEvent) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - bounds.left) / bounds.width) * size.w, y: ((e.clientY - bounds.top) / bounds.height) * size.h, perPx: size.w / bounds.width };
  };

  const rectOf = (target: CanvasSelection): Rect | null => {
    if (target === "headline") return rectsRef.current.headline;
    if (target?.startsWith("layer:")) return rectsRef.current.layers[target.slice(6)] ?? null;
    return null;
  };

  const inside = (p: { x: number; y: number }, r: Rect | null) => !!r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  /** Topmost thing under the pointer: text boxes, then the headline, then the media */
  const hitTest = (p: { x: number; y: number }): Exclude<CanvasSelection, null> => {
    const ids = (layout.layers ?? []).map((l) => l.id).reverse();
    const layerId = ids.find((id) => inside(p, rectsRef.current.layers[id]));
    if (layerId) return `layer:${layerId}`;
    return inside(p, rectsRef.current.headline) ? "headline" : "background";
  };

  const patchLayer = (base: TemplateLayout, id: string, changes: Partial<NonNullable<TemplateLayout["layers"]>[number]>) => ({
    ...base,
    layers: (base.layers ?? []).map((l) => (l.id === id ? { ...l, ...changes } : l)),
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    const p = toCanvas(e);
    const target = hitTest(p);
    const r = rectOf(target);
    onSelect?.(target);
    dragRef.current = { target, x: p.x, y: p.y, layout, dx: r ? p.x - (r.x + r.w / 2) : 0, dy: r ? p.y - (r.y + r.h / 2) : 0, box: r ? { ...r } : null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  /** Writes a hand-sized box back: from now on it keeps this size and its text shrinks to fit. */
  const applyBox = (base: TemplateLayout, target: Exclude<CanvasSelection, "background" | null>, box: FrameBox): TemplateLayout => {
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
    if (!editable || !onLayoutChange || !frame || !selection || selection === "background") return;
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
    if (!drag || !onLayoutChange) return;
    const p = toCanvas(e);
    const base = drag.layout;

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
      if (drag.target === "headline") {
        if (base.textHeight !== undefined) onLayoutChange({ ...base, textX: clamp01(cx / size.w), textY: clamp01(cy / size.h) });
        else onLayoutChange({ ...base, textY: Math.max(0.05, Math.min(0.95, cy / size.h)), ...((base.textWidth ?? 1) < 1 ? { textX: clamp01(cx / size.w) } : {}) });
      } else {
        onLayoutChange(patchLayer(base, drag.target.slice(6), { x: clamp01(cx / size.w), y: clamp01(cy / size.h) }));
      }
      return;
    }

    const m = mediaRectFor(base, format);
    const fitted = sourceRef.current && fittedSize(sourceRef.current, m.w, m.h, base.bgZoom, base.fit);
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
    if (!selection || selection === "background") return;
    const start = rectOf(selection);
    if (!start) return;
    e.preventDefault();
    // Keeps the editor's own arrow handling (which moves the box) out of it
    e.stopPropagation();
    const step = (e.shiftKey ? 0.02 : 0.005) * Math.min(size.w, size.h);
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    const box = resizeBox({ ...start }, "se", dx, dy, { W: size.w, H: size.h, minW: MIN_BOX.w * u, minH: MIN_BOX.h * u });
    onLayoutChange(applyBox(layout, selection, box));
  };

  const endDrag = () => {
    dragRef.current = null;
    setGuides({ v: false, h: false });
  };

  const selectedBox = selection && selection !== "background" ? boxes[selection] : undefined;

  return (
    <div
      ref={frameRef}
      tabIndex={editable ? 0 : undefined}
      role={editable ? "group" : undefined}
      aria-label={editable ? "Card designer. Click a text to select it. Arrow keys move the selected text; Alt and arrow keys resize it." : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => {
        if (!editable) return;
        const target = hitTest(toCanvas(e));
        if (target !== "background") onEditText?.(target);
      }}
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
        width={Math.round(size.w * renderScale)}
        height={Math.round(size.h * renderScale)}
        role="img"
        aria-label={`Template: ${layout.headline}`}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {editable && selection === "background" && (
        <div style={{ position: "absolute", inset: 0, outline: `2px solid ${SELECT_BLUE}`, outlineOffset: -2, pointerEvents: "none" }} />
      )}
      {editable && selectedBox && <ResizeFrame box={selectedBox} color={SELECT_BLUE} onHandleDown={onHandleDown} />}
      {guides.v && <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#FF3EA5", pointerEvents: "none" }} />}
      {guides.h && <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#FF3EA5", pointerEvents: "none" }} />}
    </div>
  );
}
