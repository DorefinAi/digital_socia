"use client";

import { useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { Box } from "@mui/material";
import { useStudio } from "../store";
import { HEADER_W, RULER_H, S, rulerLabel, rulerStep } from "./layout";

interface RulerProps {
  scrollerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
}

/** Time ruler. Drawn on a canvas pinned to the visible part of the timeline and redrawn on scroll/resize/zoom. */
export function Ruler({ scrollerRef, zoom, onPointerDown }: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const canvas = canvasRef.current;
    if (!scroller || !canvas) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const width = Math.max(1, scroller.clientWidth - HEADER_W);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
      if (canvas.height !== Math.round(RULER_H * dpr)) canvas.height = Math.round(RULER_H * dpr);
      canvas.style.width = `${width}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, RULER_H);
      const { major, minor } = rulerStep(zoom);
      const from = scroller.scrollLeft / zoom;
      const to = from + width / zoom;
      ctx.font = "500 10px system-ui, sans-serif";
      ctx.textBaseline = "top";
      const first = Math.floor(from / minor) * minor;
      for (let i = 0; ; i++) {
        const t = first + i * minor;
        if (t > to + minor) break;
        const x = Math.round((t - from) * zoom) + 0.5;
        const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
        ctx.fillStyle = isMajor ? S.muted : S.line;
        ctx.fillRect(x, isMajor ? RULER_H - 10 : RULER_H - 5, 1, isMajor ? 10 : 5);
        if (isMajor && t >= 0) {
          ctx.fillStyle = S.muted;
          ctx.fillText(rulerLabel(t, major), x + 4, 5);
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    draw();
    scroller.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollerRef, zoom]);

  return (
    <Box
      onPointerDown={onPointerDown}
      aria-hidden
      sx={{ position: "relative", flex: 1, height: RULER_H, cursor: "pointer", touchAction: "none" }}
    >
      <canvas ref={canvasRef} style={{ position: "sticky", left: HEADER_W, display: "block", height: RULER_H }} />
    </Box>
  );
}

/** Playhead line across all tracks, with a grab handle in the ruler. Keeps itself in view during playback. */
export function Playhead({ zoom, scrollerRef, following, onPointerDown }: { zoom: number; scrollerRef: RefObject<HTMLDivElement | null>; following: RefObject<boolean>; onPointerDown: (e: PointerEvent<HTMLElement>) => void }) {
  const playhead = useStudio((s) => s.playhead);
  const x = HEADER_W + playhead * zoom;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !following.current) return;
    const left = scroller.scrollLeft + HEADER_W;
    const right = scroller.scrollLeft + scroller.clientWidth - 24;
    if (x > right || x < left) scroller.scrollLeft = Math.max(0, x - HEADER_W - (scroller.clientWidth - HEADER_W) * 0.1);
  }, [x, scrollerRef, following]);

  // Hidden while scrolled behind the sticky track headers
  useEffect(() => {
    const scroller = scrollerRef.current;
    const el = ref.current;
    if (!scroller || !el) return;
    const update = () => {
      el.style.visibility = x < scroller.scrollLeft + HEADER_W - 1 ? "hidden" : "visible";
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [x, scrollerRef]);

  return (
    <Box ref={ref} aria-hidden style={{ transform: `translateX(${x}px)` }} sx={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 0, zIndex: 6, pointerEvents: "none" }}>
      <Box sx={{ position: "absolute", top: 0, bottom: 0, left: -1, width: 2, backgroundColor: S.accent }} />
      <Box
        onPointerDown={onPointerDown}
        sx={{
          position: "sticky", top: 0, ml: "-7px", width: 14, height: 18, pointerEvents: "auto", cursor: "ew-resize", touchAction: "none",
          backgroundColor: S.accent, clipPath: "polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)",
        }}
      />
    </Box>
  );
}
