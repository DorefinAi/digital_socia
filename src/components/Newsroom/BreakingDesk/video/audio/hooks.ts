"use client";

// React glue for the audio module: one engine per studio, its play state, and waveform peaks for a clip.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Asset, Project } from "../model";
import { AudioEngine } from "./engine";
import { getPeaks, peaksIfReady, type Peaks } from "./peaks";

/** One AudioEngine for the component's lifetime, fed the latest project after every edit. */
export function useAudioEngine(project: Project | null): AudioEngine {
  const [engine] = useState(() => new AudioEngine());
  useEffect(() => {
    if (project) engine.setProject(project);
  }, [engine, project]);
  useEffect(() => () => engine.dispose(), [engine]);
  return engine;
}

/** Re-renders when the engine starts or stops playing. */
export function useEnginePlaying(engine: AudioEngine): boolean {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.playing,
    () => false,
  );
}

/**
 * Waveform peaks for an asset (or the source range a clip shows). Null while decoding or when there is no sound;
 * re-derives cheaply when `buckets` changes with zoom.
 */
export function usePeaks(asset: Asset | null | undefined, buckets: number, from?: number, to?: number): Peaks | null {
  const range = from !== undefined && to !== undefined ? { from, to } : undefined;
  const ready = asset ? peaksIfReady(asset, buckets, range) : null;
  const [, setVersion] = useState(0);
  const pendingKey = asset && ready === undefined ? `${asset.id}|${asset.url}` : null;
  useEffect(() => {
    if (!pendingKey || !asset) return;
    let cancelled = false;
    void getPeaks(asset, 1).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
    // asset identity changes on every project edit; pendingKey captures what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);
  return ready ?? null;
}
