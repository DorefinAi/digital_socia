"use client";

// One resize-and-move gesture for boxes drawn over a picture: the card designer's text boxes and the
// date and text slots on an operator's X background. Eight handles (corners resize both sides, edges one;
// Shift on a corner keeps the shape), pointer events so mouse, pen and touch behave the same.

import React, { useCallback, useEffect, useRef } from "react";

/** A box in the frame's own units (canvas or image pixels) */
export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BoxHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type BoxGesture = BoxHandle | "move";

export interface BoxLimits {
  /** Frame size, in the same units as the box */
  W: number;
  H: number;
  minW: number;
  minH: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The box after dragging `gesture` by (dx, dy) frame units from `start`. It never leaves the frame
 * and never gets smaller than the minimum; `keepRatio` holds the starting shape on a corner.
 */
export function resizeBox(start: FrameBox, gesture: BoxGesture, dx: number, dy: number, limits: BoxLimits, keepRatio = false): FrameBox {
  const { W, H } = limits;
  // A box that was already smaller than the minimum (an old design) may stay that small, never smaller
  const minW = Math.min(limits.minW, start.w, W);
  const minH = Math.min(limits.minH, start.h, H);
  if (gesture === "move") {
    return { ...start, x: clamp(start.x + dx, 0, Math.max(0, W - start.w)), y: clamp(start.y + dy, 0, Math.max(0, H - start.h)) };
  }
  const west = gesture.includes("w");
  const east = gesture.includes("e");
  const north = gesture.includes("n");
  const south = gesture.includes("s");
  let left = start.x;
  let right = start.x + start.w;
  let top = start.y;
  let bottom = start.y + start.h;
  if (west) left = clamp(left + dx, 0, right - minW);
  if (east) right = clamp(right + dx, left + minW, W);
  if (north) top = clamp(top + dy, 0, bottom - minH);
  if (south) bottom = clamp(bottom + dy, top + minH, H);

  const corner = (west || east) && (north || south);
  if (keepRatio && corner && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    let w = right - left;
    let h = bottom - top;
    // Follow whichever side moved further, then fit the shape inside the frame from the fixed corner
    if (w / ratio >= h) h = w / ratio;
    else w = h * ratio;
    const roomW = west ? start.x + start.w : W - start.x;
    const roomH = north ? start.y + start.h : H - start.y;
    const shrink = Math.min(1, roomW / w, roomH / h);
    w *= shrink;
    h *= shrink;
    const grow = Math.max(1, minW / w, minH / h);
    w = Math.min(roomW, w * grow);
    h = Math.min(roomH, h * grow);
    if (west) left = start.x + start.w - w;
    else right = left + w;
    if (north) top = start.y + start.h - h;
    else bottom = top + h;
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

interface GestureOptions {
  /** The element the box is drawn over; its on-screen size converts pointer moves to frame units */
  frame: HTMLElement;
  gesture: BoxGesture;
  start: FrameBox;
  limits: BoxLimits;
  onChange: (box: FrameBox) => void;
  onEnd?: (moved: boolean) => void;
}

/**
 * Starts a drag from a pointerdown. Listens on the window until the pointer is released, so the
 * caller does not need its own move and up handlers; a drag still running on unmount is dropped.
 */
export function useBoxGesture() {
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  return useCallback((e: React.PointerEvent, { frame, gesture, start, limits, onChange, onEnd }: GestureOptions) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    stopRef.current?.();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; the window listeners below still follow the pointer
    }
    const bounds = frame.getBoundingClientRect();
    const perX = limits.W / Math.max(1, bounds.width);
    const perY = limits.H / Math.max(1, bounds.height);
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const dx = (ev.clientX - x0) * perX;
      const dy = (ev.clientY - y0) * perY;
      // A click that wobbles a pixel is not a drag
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 2) return;
      moved = true;
      onChange(resizeBox(start, gesture, dx, dy, limits, ev.shiftKey));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      stopRef.current = null;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      onEnd?.(moved);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    stopRef.current = stop;
  }, []);
}

/** Touch targets, px. They sit mostly outside the box (only INNER px reach in), so a drag inside a small box still moves it. */
const CORNER = 22;
const EDGE = 22;
const INNER = 6;
const out = (size: number) => -(size - INNER);

const HANDLES: { id: BoxHandle; cursor: string; label: string; place: React.CSSProperties }[] = [
  // Edges first, so a corner wins where a small box makes them meet; each edge fills the room between its corners
  { id: "n", cursor: "ns-resize", label: "top edge", place: { top: out(EDGE), height: EDGE, left: INNER, right: INNER } },
  { id: "e", cursor: "ew-resize", label: "right edge", place: { right: out(EDGE), width: EDGE, top: INNER, bottom: INNER } },
  { id: "s", cursor: "ns-resize", label: "bottom edge", place: { bottom: out(EDGE), height: EDGE, left: INNER, right: INNER } },
  { id: "w", cursor: "ew-resize", label: "left edge", place: { left: out(EDGE), width: EDGE, top: INNER, bottom: INNER } },
  { id: "nw", cursor: "nwse-resize", label: "top-left corner", place: { left: out(CORNER), top: out(CORNER), width: CORNER, height: CORNER } },
  { id: "ne", cursor: "nesw-resize", label: "top-right corner", place: { right: out(CORNER), top: out(CORNER), width: CORNER, height: CORNER } },
  { id: "se", cursor: "nwse-resize", label: "bottom-right corner", place: { right: out(CORNER), bottom: out(CORNER), width: CORNER, height: CORNER } },
  { id: "sw", cursor: "nesw-resize", label: "bottom-left corner", place: { left: out(CORNER), bottom: out(CORNER), width: CORNER, height: CORNER } },
];

/** Where the visible mark's centre sits in its target: on the box's edge line or corner */
const NEAR = `${INNER}px`;
const FAR = `calc(100% - ${INNER}px)`;
const MARK_AT: Record<BoxHandle, { left: string; top: string }> = {
  n: { left: "50%", top: FAR },
  s: { left: "50%", top: NEAR },
  e: { left: NEAR, top: "50%" },
  w: { left: FAR, top: "50%" },
  nw: { left: FAR, top: FAR },
  ne: { left: NEAR, top: FAR },
  se: { left: NEAR, top: NEAR },
  sw: { left: FAR, top: NEAR },
};

interface ResizeFrameProps {
  /** Position and size as percentages of the frame */
  box: FrameBox;
  color: string;
  /** A handle was pressed; start the gesture from here */
  onHandleDown: (handle: BoxHandle, e: React.PointerEvent<HTMLSpanElement>) => void;
  children?: React.ReactNode;
}

/**
 * Selection outline with eight handles. The outline lets pointers through (so a drag inside the box
 * reaches whatever moves it); only the handles catch them. Targets are 22 px, reaching just 6 px into
 * the box; each edge handle covers its whole edge between the corners.
 */
export function ResizeFrame({ box, color, onHandleDown, children }: ResizeFrameProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        outline: `2px solid ${color}`,
        pointerEvents: "none",
        lineHeight: 1,
      }}
    >
      {children}
      {HANDLES.map((h) => {
        const side = h.id.length === 1;
        const horizontal = h.id === "n" || h.id === "s";
        return (
          <span
            key={h.id}
            aria-hidden
            data-handle={h.id}
            title={`Drag the ${h.label} to resize${side ? "" : " (Shift keeps the shape)"}`}
            onPointerDown={(e) => onHandleDown(h.id, e)}
            style={{
              position: "absolute",
              ...h.place,
              cursor: h.cursor,
              pointerEvents: "auto",
              touchAction: "none",
            }}
          >
            <span
              style={{
                position: "absolute",
                ...MARK_AT[h.id],
                transform: "translate(-50%, -50%)",
                width: side ? (horizontal ? 22 : 8) : 11,
                height: side ? (horizontal ? 8 : 22) : 11,
                borderRadius: side ? 4 : 2,
                background: "#fff",
                border: `2px solid ${color}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                boxSizing: "border-box",
              }}
            />
          </span>
        );
      })}
    </div>
  );
}
