"use client";

import { memo, useEffect, useRef } from "react";
import type { Asset } from "../model";
import { usePeaks } from "../audio/hooks";

/** Longest canvas we draw; wider clips stretch it (the waveform stays readable, just softer) */
const MAX_PX = 4096;

interface WaveformProps {
  asset: Asset;
  /** Source seconds shown */
  from: number;
  to: number;
  /** Clip width in CSS px */
  width: number;
  height: number;
  color?: string;
  /** Clip volume 0..2: scales the drawing so loud/quiet clips look it */
  gain?: number;
}

/** Min/max waveform of the part of `asset` a clip plays, from Agent C's cached peaks */
function WaveformImpl({ asset, from, to, width, height, color = "rgba(255,255,255,0.72)", gain = 1 }: WaveformProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = Math.max(1, Math.min(MAX_PX, Math.round(width)));
  const buckets = Math.max(1, Math.round(px / 2));
  const peaks = usePeaks(asset, buckets, from, to);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, px, height);
    if (!peaks) return;
    const mid = height / 2;
    const step = px / peaks.buckets;
    const g = Math.min(2, Math.max(0, gain));
    ctx.fillStyle = color;
    for (let i = 0; i < peaks.buckets; i++) {
      const hi = Math.min(1, peaks.max[i] * g);
      const lo = Math.max(-1, peaks.min[i] * g);
      const top = mid - hi * mid;
      const h = Math.max(1, (hi - lo) * mid);
      ctx.fillRect(i * step, top, Math.max(1, step - 0.5), h);
    }
  }, [peaks, px, height, color, gain]);

  return <canvas ref={ref} aria-hidden style={{ display: "block", width: "100%", height, pointerEvents: "none" }} />;
}

export const Waveform = memo(WaveformImpl);
