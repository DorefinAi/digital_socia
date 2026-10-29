"use client";

// Connects the preview (video/preview, Agent B) to the studio store and the audio engine: the playhead in and
// out, selection, on-canvas box gestures as one undoable edit each, plus the level meter.

import React, { useCallback, useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { Preview } from "../preview/Preview";
import LevelMeter from "../audio/LevelMeter";
import type { AudioEngine } from "../audio/engine";
import { useEnginePlaying } from "../audio/hooks";
import type { MediaPool } from "../render/mediaPool";
import type { Box as FrameBox, Clip, Project } from "../model";
import { useStudio, useStudioStore } from "../store";
import { S } from "./studioTheme";

const selectProject = (s: { project: Project }) => s.project;
const selectPlayhead = (s: { playhead: number }) => s.playhead;
const selectFirst = (s: { selection: string[] }) => s.selection[0] ?? null;

export default function StudioPreview({ pool, engine, onTogglePlay }: { pool: MediaPool; engine: AudioEngine; onTogglePlay: () => void }) {
  const store = useStudioStore();
  const project = useStudio(selectProject);
  const playhead = useStudio(selectPlayhead);
  const selected = useStudio(selectFirst);
  const playing = useEnginePlaying(engine);

  // Moving the playhead while paused moves the engine's start point too
  useEffect(() => {
    if (!engine.playing) engine.seek(playhead);
  }, [engine, playhead]);

  // The preview reports every frame; the store (and the timeline drawn from it) needs ~20 updates a second
  const lastSent = useRef(0);
  const onTimeUpdate = useCallback(
    (t: number) => {
      const now = performance.now();
      if (now - lastSent.current < 50) return;
      lastSent.current = now;
      store.dispatch({ type: "seek", time: t });
    },
    [store],
  );
  // Land exactly on the end when playback stops there
  const onEnded = useCallback(() => store.dispatch({ type: "seek", time: engine.clock() }), [store, engine]);
  const onSelect = useCallback((id: string | null) => store.dispatch({ type: "select", clipIds: id ? [id] : [] }), [store]);
  const onBoxChange = useCallback(
    (clipId: string, box: FrameBox, phase: "live" | "commit") => {
      // The preview shows the drag itself; the store takes the result as one undo step
      if (phase === "commit") store.dispatch({ type: "clip/update", clipId, patch: { box } as Partial<Clip> });
    },
    [store],
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Preview
          project={project}
          pool={pool}
          time={playhead}
          playing={playing}
          engine={engine}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          selectedClipId={selected}
          onSelect={onSelect}
          onBoxChange={onBoxChange}
          onTogglePlay={onTogglePlay}
        />
      </Box>
      <Box aria-label="Sound level" role="img" sx={{ width: 30, flexShrink: 0, py: 2, px: 0.5, bgcolor: S.stage, borderLeft: `1px solid ${S.line}` }}>
        <LevelMeter read={() => engine.levels()} orientation="vertical" scale={false} />
      </Box>
    </Box>
  );
}
