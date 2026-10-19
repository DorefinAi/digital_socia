"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * The video playhead, kept outside React state. It moves about 12 times a second during playback,
 * and as state it re-rendered the whole post editor each time; as a store, only the parts that
 * show the time (usePlayheadTime) re-render.
 */
export interface Playhead {
  get: () => number;
  set: (seconds: number) => void;
  subscribe: (listener: () => void) => () => void;
}

export function usePlayhead(): Playhead {
  const [playhead] = useState<Playhead>(() => {
    let time = 0;
    const listeners = new Set<() => void>();
    return {
      get: () => time,
      set: (seconds) => {
        if (seconds === time) return;
        time = seconds;
        listeners.forEach((l) => l());
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  });
  return playhead;
}

export function usePlayheadTime(playhead: Playhead): number {
  return useSyncExternalStore(playhead.subscribe, playhead.get, playhead.get);
}
