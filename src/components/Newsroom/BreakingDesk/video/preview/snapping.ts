// Snapping for boxes dragged over the preview: a box's edges or centre catch on the frame's edges
// and centre, the safe-area lines and the other boxes on screen. Pure; units are frame fractions.

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SnapAxis {
  /** Add this to the box position on the axis */
  offset: number;
  /** Where to draw the guide (fraction), or null when nothing caught */
  guide: number | null;
}

/**
 * The smallest move (within `threshold`) that puts one of the box's lines (start, centre, end) on a target.
 * Ties go to the earlier target, so list the frame centre first.
 */
export function snapAxis(start: number, end: number, targets: readonly number[], threshold: number): SnapAxis {
  const lines = [start, (start + end) / 2, end];
  let best = threshold;
  let offset = 0;
  let guide: number | null = null;
  for (const target of targets) {
    for (const line of lines) {
      const d = target - line;
      if (Math.abs(d) < best) {
        best = Math.abs(d);
        offset = d;
        guide = target;
      }
    }
  }
  return { offset, guide };
}

/** Snap a single edge (for resizing): the target within threshold nearest to `value` */
export function snapValue(value: number, targets: readonly number[], threshold: number): SnapAxis {
  let best = threshold;
  let guide: number | null = null;
  for (const target of targets) {
    const d = Math.abs(target - value);
    if (d < best) {
      best = d;
      guide = target;
    }
  }
  return { offset: guide === null ? 0 : guide - value, guide };
}

/** Frame lines boxes catch on: centre first, then the edges, then (when shown) the title-safe lines */
export function frameTargets(safeArea: boolean): number[] {
  return safeArea ? [0.5, 0, 1, SAFE_TITLE, 1 - SAFE_TITLE] : [0.5, 0, 1];
}

/** Broadcast title-safe inset (90% area) and action-safe inset (93% area), as fractions per side */
export const SAFE_TITLE = 0.05;
export const SAFE_ACTION = 0.035;

/** Snap angles: Shift steps by 15 degrees; otherwise the square angles catch within 4 degrees */
export function snapAngle(deg: number, step: boolean): number {
  let a = ((deg % 360) + 540) % 360 - 180;
  if (step) a = Math.round(a / 15) * 15;
  else {
    const square = Math.round(a / 90) * 90;
    if (Math.abs(a - square) < 4) a = square;
  }
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return Math.round(a * 10) / 10;
}
