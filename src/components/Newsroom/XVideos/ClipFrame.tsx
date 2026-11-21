"use client";

// A frame of a clip: the real video (a thumbnail, a frame grab at a time, or the player's stage) over a dark
// placeholder. When the file is not in public/xvideos-demo/ yet, the placeholder stays, with the file name, so the
// desk still reads. The overlays (LIVE bug, the text read from the frame, the cyan box) are drawn by the caller.

import React, { useState } from "react";
import { Box } from "@mui/material";

// Dark broadcast-like backdrops, one per clip (the mockups' s1-s6)
const BACKDROPS = [
  "radial-gradient(circle at 30% 40%, #8c6b4f 0, #3b2c22 45%, #15100c 100%)",
  "linear-gradient(160deg, #2c4a6e 0, #182a40 55%, #0b1320 100%)",
  "radial-gradient(circle at 70% 30%, #a3896a 0, #5a4a3a 40%, #1d1813 100%)",
  "linear-gradient(200deg, #4f6b3a 0, #2a3a20 60%, #11180c 100%)",
  "radial-gradient(circle at 50% 35%, #6e5a8c 0, #33284a 50%, #120e1c 100%)",
  "linear-gradient(180deg, #7d8792 0, #3f464e 60%, #16191c 100%)",
];

export function backdropFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BACKDROPS[h % BACKDROPS.length];
}

export const XV_COLORS = {
  live: "#D90429",
  clip: "#6D28D9",
  ocr: "#22D3EE",
  said: "#1A5FB4",
  trim: "#FFD400",
  bar: "#0E0E10",
  tile: "#FFF6CC",
  orange: "#E8710A",
} as const;

interface ClipFrameProps {
  id: string;
  src: string;
  fileName: string;
  /** Show the frame at this second (thumbnails and grabs) */
  at?: number;
  /** Shows the file name on the placeholder when the file is missing */
  showMissing?: boolean;
  children?: React.ReactNode;
  sx?: object;
}

/** A still frame: the video's frame at `at` when the file is there, the backdrop otherwise */
export function ClipFrame({ id, src, fileName, at = 1, showMissing = false, children, sx }: ClipFrameProps) {
  const [missing, setMissing] = useState(false);
  return (
    <Box sx={{ position: "relative", overflow: "hidden", background: backdropFor(id), aspectRatio: "16 / 9", ...sx }}>
      {!missing && (
        <Box
          component="video"
          src={`${src}#t=${at}`}
          preload="metadata"
          muted
          playsInline
          aria-hidden
          tabIndex={-1}
          onError={() => setMissing(true)}
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
      {missing && showMissing && <MissingNote fileName={fileName} />}
      {children}
    </Box>
  );
}

/** "LIVE_JPR_FIRE_1358.mp4 is not in the demo folder yet" on a missing clip's frame */
export function MissingNote({ fileName, big = false }: { fileName: string; big?: boolean }) {
  return (
    <Box sx={{ position: "absolute", left: 0, right: 0, top: big ? "38%" : "30%", textAlign: "center", color: "rgba(255,255,255,0.78)", px: 1, pointerEvents: "none" }}>
      <Box sx={{ fontWeight: 700, fontSize: big ? "0.9375rem" : "0.625rem", overflowWrap: "anywhere" }}>{fileName}</Box>
      {big && <Box sx={{ fontSize: "0.75rem", mt: 0.5, color: "rgba(255,255,255,0.6)" }}>No video file yet. Put it in public/xvideos-demo/ to play it here.</Box>}
    </Box>
  );
}

/** The red LIVE bug in a frame's top-left corner */
export function LiveBug({ size = "0.6875rem" }: { size?: string }) {
  return (
    <Box component="span" aria-hidden sx={{ position: "absolute", top: "6%", left: "3%", px: "0.5em", py: "0.1em", borderRadius: "3px", backgroundColor: XV_COLORS.live, color: "#fff", fontWeight: 800, fontSize: size, lineHeight: 1.4 }}>
      LIVE
    </Box>
  );
}

/** The kind badge: LIVE (red) or CLIP (purple) */
export function KindBadge({ kind }: { kind: "live" | "clip" }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", px: 0.75, borderRadius: "4px", fontSize: "0.6875rem", fontWeight: 800, lineHeight: "18px", color: "#fff", backgroundColor: kind === "live" ? XV_COLORS.live : XV_COLORS.clip, flexShrink: 0 }}>
      {kind === "live" ? "LIVE" : "CLIP"}
    </Box>
  );
}

/** Text read from the frame, drawn where it sits (on the placeholder only: a real video already shows it) */
export function ScreenTextOverlay({ text, box, kind, showText, boxed }: { text: string; box: { x: number; y: number; w: number; h: number }; kind: "super" | "ticker" | "strap"; showText: boolean; boxed: boolean }) {
  return (
    <Box aria-hidden sx={{ position: "absolute", left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, containerType: "size" }}>
      {showText && (
        <Box
          lang="hi"
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            px: "1.2%",
            overflow: "hidden",
            whiteSpace: "nowrap",
            fontWeight: 700,
            fontSize: "55cqh",
            ...(kind === "ticker" ? { backgroundColor: "#FFD60A", color: "#111" } : { backgroundColor: "#C1121F", color: "#fff", borderLeft: "0.4em solid #FFD60A" }),
          }}
        >
          {text}
        </Box>
      )}
      {boxed && <Box sx={{ position: "absolute", inset: -3, border: `2px solid ${XV_COLORS.ocr}`, borderRadius: "3px" }} />}
    </Box>
  );
}
