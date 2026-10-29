// Snapping: pull a dragged time onto the playhead, timeline start or any clip edge when it comes within a few pixels.
// Pure; the timeline UI converts its pixel threshold to seconds with the zoom (px per second).

import type { Project } from "../model";
import { editPoints } from "./ops";

/** Pixels within which a drag snaps */
export const SNAP_PX = 8;

export interface SnapResult {
  time: number;
  /** The point snapped to, or null when free */
  target: number | null;
}

/** Candidate snap points: 0, the playhead, every clip edge except the dragged clips' own */
export function snapPoints(project: Project, playhead: number, exclude: ReadonlySet<string> = new Set()): number[] {
  const points = editPoints(project, exclude);
  if (!points.includes(playhead)) points.push(playhead);
  return points.sort((a, b) => a - b);
}

/** Snap a single time (an edge being trimmed, the playhead being dragged) */
export function snapTime(time: number, points: readonly number[], threshold: number): SnapResult {
  let best: number | null = null;
  let dist = threshold;
  for (const p of points) {
    const d = Math.abs(p - time);
    if (d <= dist) {
      dist = d;
      best = p;
    }
  }
  return best === null ? { time, target: null } : { time: best, target: best };
}

/** Snap a moving span: whichever of its start or end lands closer to a point wins. Returns the new start. */
export function snapSpan(start: number, duration: number, points: readonly number[], threshold: number): SnapResult {
  const a = snapTime(start, points, threshold);
  const b = snapTime(start + duration, points, threshold);
  const da = a.target === null ? Infinity : Math.abs(a.target - start);
  const db = b.target === null ? Infinity : Math.abs(b.target - (start + duration));
  if (da === Infinity && db === Infinity) return { time: start, target: null };
  return da <= db ? { time: a.time, target: a.target } : { time: b.time - duration, target: b.target };
}
