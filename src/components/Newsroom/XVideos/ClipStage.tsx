"use client";

// The centre of the editor: the clip playing where the X desk shows the card, with the browser's own controls on the
// video (play, seek bar, time, volume, full screen) and YouTube-style back 10 s / play / forward 10 s over it.

import React from "react";
import { Box, Button, IconButton } from "@mui/material";
import { Clapperboard, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import type { XvClip } from "@/data/xVideosData";
import type { ClipPlayer } from "./useClipPlayer";
import { LiveBug, MissingNote, backdropFor, isVertical } from "./ClipFrame";

/** Seconds the back / forward buttons jump */
const SKIP = 10;

interface StageProps {
  clip: XvClip;
  player: ClipPlayer;
  onOpenStudio: () => void;
}

const roundBtnSx = { width: 44, height: 44, backgroundColor: "rgba(0,0,0,0.55)", color: "#fff", "&:hover": { backgroundColor: "rgba(0,0,0,0.75)" }, "&:focus-visible": { outline: "2px solid #fff", outlineOffset: 2 } } as const;

export default function ClipStage({ clip, player, onOpenStudio }: StageProps) {
  const { playing, missing, attach, toggle, skip, videoProps } = player;
  const vertical = isVertical(clip);

  return (
    <Box sx={{ width: "100%", maxWidth: 820, display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        sx={{
          position: "relative",
          // A vertical short keeps its own shape, as tall as the window allows, instead of a thin strip in a 16:9 box
          ...(vertical ? { alignSelf: "center", height: "min(68dvh, 640px)", maxWidth: "100%", aspectRatio: `${clip.width} / ${clip.height}` } : { width: "100%", aspectRatio: "16 / 9" }),
          borderRadius: "6px",
          overflow: "hidden",
          background: backdropFor(clip.id),
          boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
          // The skip buttons show while paused, and on mouse hover while playing. Hidden ones take no tap and no focus,
          // so a tap on a playing video on a phone reaches the video's own controls.
          "& .xv-skip": { opacity: playing ? 0 : 1, visibility: playing ? "hidden" : "visible", transition: "opacity 150ms, visibility 150ms" },
          "@media (hover: hover)": { "&:hover .xv-skip": { opacity: 1, visibility: "visible" } },
        }}
      >
        {!missing && (
          <Box
            component="video"
            key={clip.src}
            ref={attach}
            src={clip.src}
            poster={clip.poster}
            preload="metadata"
            playsInline
            controls
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            {...videoProps}
            aria-label={`Clip ${clip.fileName}`}
            sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" }}
          />
        )}
        {missing && (
          <>
            {clip.kind === "live" && <LiveBug size="0.9375rem" />}
            <MissingNote fileName={clip.fileName} big />
          </>
        )}
        {/* Above the browser's control bar, so it never covers the seek bar */}
        <Box className="xv-skip" sx={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: { xs: 3, sm: 5 }, pointerEvents: "none", "& > *": { pointerEvents: "auto" } }}>
          <IconButton onClick={() => skip(-SKIP)} aria-label={`Back ${SKIP} seconds`} sx={roundBtnSx}>
            <RotateCcw size={20} />
          </IconButton>
          <IconButton onClick={toggle} aria-label={playing ? "Pause" : "Play"} aria-keyshortcuts="Space" sx={{ ...roundBtnSx, width: 60, height: 60 }}>
            {playing ? <Pause size={26} fill="#fff" /> : <Play size={26} fill="#fff" />}
          </IconButton>
          <IconButton onClick={() => skip(SKIP)} aria-label={`Forward ${SKIP} seconds`} sx={roundBtnSx}>
            <RotateCw size={20} />
          </IconButton>
        </Box>
      </Box>
      <Button size="small" variant="outlined" onClick={onOpenStudio} startIcon={<Clapperboard size={14} />} sx={{ alignSelf: "flex-end", minHeight: 30, borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", fontWeight: 600, color: "text.primary", borderColor: "divider" }}>
        Open in Video Studio
      </Button>
    </Box>
  );
}
