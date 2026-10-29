"use client";

// Stereo output level meter for the studio shell: two bars (L/R) on a -60..0 dBFS scale, green up to -18,
// amber to -6, red above; a peak-hold mark per channel; a clip light that latches until clicked.
// Reads levels through a callback each animation frame, so it works with AudioEngine.levels() or anything else.

import React, { useEffect, useRef, useState } from "react";
import { Box, ButtonBase, Tooltip, useTheme } from "@mui/material";
import { fallTowards, gainToDb } from "./gain";
import type { StereoLevels } from "./engine";

const FLOOR_DB = -60;
const MARKS = [0, -6, -18, -36];
const HOLD_SECONDS = 1.5;
const CLIP_LEVEL = 0.999;

export interface LevelMeterProps {
  /** Called every frame; return null when there is no audio yet */
  read: () => StereoLevels | null;
  orientation?: "vertical" | "horizontal";
  /** Length of the bars in px (height when vertical). Defaults to filling the parent. */
  length?: number;
  /** Show dB numbers beside the bars */
  scale?: boolean;
}

function fraction(db: number): number {
  if (!(db > FLOOR_DB)) return 0;
  return Math.min(1, (db - FLOOR_DB) / -FLOOR_DB);
}

export default function LevelMeter({ read, orientation = "vertical", length, scale = true }: LevelMeterProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readRef = useRef(read);
  const [clipped, setClipped] = useState(false);
  const clippedRef = useRef(false);
  const vertical = orientation === "vertical";

  useEffect(() => {
    readRef.current = read;
  }, [read]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const colors = {
      trough: theme.palette.action.hover,
      low: theme.palette.success.main,
      mid: theme.palette.warning.main,
      high: theme.palette.error.main,
      hold: theme.palette.text.primary,
      text: theme.palette.text.secondary,
    };
    let w = 0;
    let h = 0;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const shown = [-Infinity, -Infinity];
    const hold = [-Infinity, -Infinity];
    const holdAge = [0, 0];
    let last = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const lv = readRef.current();
      const peaks = lv ? [lv.peakL, lv.peakR] : [0, 0];
      if (!clippedRef.current && (peaks[0] >= CLIP_LEVEL || peaks[1] >= CLIP_LEVEL)) {
        clippedRef.current = true;
        setClipped(true);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const labelBand = scale ? (vertical ? 22 : 13) : 0;
      const across = (vertical ? w : h) - labelBand;
      const along = vertical ? h : w;
      const gap = 2;
      const bar = Math.max(2, (across - gap) / 2);

      for (let ch = 0; ch < 2; ch++) {
        const db = gainToDb(peaks[ch]);
        shown[ch] = fallTowards(shown[ch], db, dt);
        if (db >= hold[ch]) {
          hold[ch] = db;
          holdAge[ch] = 0;
        } else if ((holdAge[ch] += dt) > HOLD_SECONDS) {
          hold[ch] = fallTowards(hold[ch], db, dt, 12);
        }
        const offset = ch * (bar + gap);
        const rect = (from: number, to: number, color: string | CanvasGradient) => {
          if (to <= from) return;
          ctx.fillStyle = color;
          if (vertical) ctx.fillRect(offset, along * (1 - to), bar, along * (to - from));
          else ctx.fillRect(along * from, offset, along * (to - from), bar);
        };
        rect(0, 1, colors.trough);
        const level = fraction(shown[ch]);
        const z1 = fraction(-18);
        const z2 = fraction(-6);
        rect(0, Math.min(level, z1), colors.low);
        rect(z1, Math.min(level, z2), colors.mid);
        rect(z2, level, colors.high);
        const hf = fraction(hold[ch]);
        if (hf > 0) {
          const pos = Math.min(along - 1, along * hf);
          ctx.fillStyle = colors.hold;
          if (vertical) ctx.fillRect(offset, along - pos - 1, bar, 1.5);
          else ctx.fillRect(pos, offset, 1.5, bar);
        }
      }

      if (scale) {
        ctx.fillStyle = colors.text;
        ctx.font = `10px ${theme.typography.fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = vertical ? "left" : "center";
        // Skip a mark that would collide with the one drawn before it on a short meter.
        let prev = -Infinity;
        for (const m of MARKS) {
          const p = fraction(m) * along;
          const pos = vertical ? Math.min(h - 6, Math.max(6, along - p)) : Math.min(w - 8, Math.max(8, p));
          if (Math.abs(pos - prev) < (vertical ? 12 : 22)) continue;
          prev = pos;
          if (vertical) ctx.fillText(String(m), across + 4, pos);
          else ctx.fillText(String(m), pos, across + 7);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [theme, vertical, scale]);

  const resetClip = () => {
    clippedRef.current = false;
    setClipped(false);
  };

  return (
    <Box
      role="group"
      aria-label="Output level"
      sx={{
        display: "flex",
        flexDirection: vertical ? "column" : "row-reverse",
        alignItems: "stretch",
        gap: 0.5,
        ...(vertical ? { height: length ?? "100%", width: scale ? 34 : 12 } : { width: length ?? "100%", height: scale ? 27 : 12 }),
      }}
    >
      <Tooltip title={clipped ? "Too loud: sound was clipped. Click to reset" : "No clipping"}>
        <ButtonBase
          onClick={resetClip}
          aria-label={clipped ? "Clipping detected. Reset clip light" : "Clip light, no clipping"}
          sx={{
            flex: "none",
            width: vertical ? 12 : 6,
            height: vertical ? 6 : 14,
            alignSelf: "flex-start",
            borderRadius: "2px",
            bgcolor: clipped ? "error.main" : "action.selected",
            "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
          }}
        />
      </Tooltip>
      <Box component="canvas" ref={canvasRef} aria-hidden sx={{ flex: 1, minHeight: 0, minWidth: 0, display: "block", width: "100%", height: "100%" }} />
    </Box>
  );
}
