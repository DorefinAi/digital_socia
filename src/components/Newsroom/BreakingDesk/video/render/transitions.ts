// Transition and fade maths, kept pure so preview, export and the checks in ./checks.ts agree.
// A transition lives on the incoming clip (transitionIn) and plays over its overlap with the clip
// before it on the same track. Without such an overlap it plays against whatever is underneath
// (a crossfade becomes a fade in, a dip to colour rises out of that colour).

import type { Clip, TransitionType } from "../model";

/** How one clip is drawn during a transition. Reused objects: callers must not keep a reference. */
export interface TransitionFx {
  /** Multiplies the clip's opacity */
  alpha: number;
  /** Horizontal shift, as a fraction of the frame width */
  dx: number;
  /** Colour laid over the clip's picture ("" = none) */
  tint: "" | "#000000" | "#FFFFFF";
  tintAlpha: number;
  /** Visible part of the frame, as fractions of the width: [clipLeft, clipRight]. 0..1 = everything */
  clipLeft: number;
  clipRight: number;
}

export function resetFx(fx: TransitionFx): TransitionFx {
  fx.alpha = 1;
  fx.dx = 0;
  fx.tint = "";
  fx.tintAlpha = 0;
  fx.clipLeft = 0;
  fx.clipRight = 1;
  return fx;
}

export function newFx(): TransitionFx {
  return resetFx({ alpha: 1, dx: 0, tint: "", tintAlpha: 0, clipLeft: 0, clipRight: 1 });
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smooth start and stop, for movement (slides, wipes) */
export function easeInOut(p: number): number {
  const x = clamp01(p);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Opacity from the clip's own fade in / fade out at timeline time t (1 outside the fades) */
export function fadeAlpha(clip: Pick<Clip, "start" | "duration" | "fadeIn" | "fadeOut">, t: number): number {
  let a = 1;
  if (clip.fadeIn > 0) a = Math.min(a, (t - clip.start) / clip.fadeIn);
  if (clip.fadeOut > 0) a = Math.min(a, (clip.start + clip.duration - t) / clip.fadeOut);
  return clamp01(a);
}

/**
 * The time window a transition plays in: from the incoming clip's start for `duration` seconds,
 * but never past the end of the overlap with the previous clip (when there is one).
 * Returns the window length (0 = no transition).
 */
export function transitionSpan(incoming: Pick<Clip, "start" | "transitionIn">, previousEnd: number | null): number {
  const tr = incoming.transitionIn;
  if (!tr || !(tr.duration > 0)) return 0;
  if (previousEnd === null || previousEnd <= incoming.start) return tr.duration;
  return Math.min(tr.duration, previousEnd - incoming.start);
}

/** Progress 0..1 through the window, or -1 when t is outside it */
export function transitionProgress(incomingStart: number, span: number, t: number): number {
  if (!(span > 0) || t < incomingStart || t >= incomingStart + span) return -1;
  return (t - incomingStart) / span;
}

/**
 * Fill `fx` for one side of a transition at progress p.
 * role "in" = the incoming clip (drawn on top), "out" = the clip being left (drawn underneath).
 */
export function transitionFx(type: TransitionType, p: number, role: "in" | "out", fx: TransitionFx): TransitionFx {
  resetFx(fx);
  const x = clamp01(p);
  switch (type) {
    case "crossfade":
      // The incoming picture rises over the outgoing one, which stays opaque underneath: a full-frame
      // pair never lets the background show through (no dip in brightness mid-way)
      if (role === "in") fx.alpha = x;
      break;
    case "fade-black":
    case "fade-white": {
      // First half: the outgoing clip goes to the colour. Second half: the incoming clip comes out of it.
      fx.tint = type === "fade-black" ? "#000000" : "#FFFFFF";
      if (role === "out") {
        fx.alpha = x < 0.5 ? 1 : 0;
        fx.tintAlpha = clamp01(2 * x);
      } else {
        fx.alpha = x < 0.5 ? 0 : 1;
        fx.tintAlpha = clamp01(2 * (1 - x));
      }
      break;
    }
    case "slide-left": {
      // The new picture pushes in from the right, the old one leaves to the left
      const e = easeInOut(x);
      fx.dx = role === "in" ? 1 - e : -e;
      break;
    }
    case "slide-right": {
      const e = easeInOut(x);
      fx.dx = role === "in" ? -(1 - e) : e;
      break;
    }
    case "wipe": {
      // A vertical edge sweeps left to right, uncovering the new picture behind it
      const e = easeInOut(x);
      if (role === "in") {
        fx.clipLeft = 0;
        fx.clipRight = e;
      }
      break;
    }
  }
  return fx;
}

/**
 * Transition with no clip before it (first clip on a track, or a gap): only the incoming side plays.
 * A slide or wipe still moves the picture in; colour dips rise out of the colour.
 */
export function soloTransitionFx(type: TransitionType, p: number, fx: TransitionFx): TransitionFx {
  if (type === "fade-black" || type === "fade-white") {
    resetFx(fx);
    fx.tint = type === "fade-black" ? "#000000" : "#FFFFFF";
    // The clip's area starts as the colour and clears to the picture
    fx.tintAlpha = 1 - clamp01(p);
    return fx;
  }
  return transitionFx(type, p, "in", fx);
}
