"use client";

// The selected clip's box over the preview: move (drag inside), resize (the shared ResizeFrame
// handles, Shift keeps the shape), rotate (the round handle above), nudge with the arrow keys.
// Boxes may be rotated, so resizing works in the box's own axes and reuses resizeBox() there.
// Positions snap to the frame, the safe-area lines and other boxes; hold Alt to place freely.

import React, { useCallback, useEffect, useRef } from "react";
import { Box as MuiBox } from "@mui/material";
import type { Box } from "../model";
import { ResizeFrame, resizeBox, type BoxHandle } from "../../ResizeFrame";
import { boxBounds } from "../render/geometry";
import { snapAngle, snapAxis, snapValue } from "./snapping";

export const SELECT_BLUE = "#2F7BFF";
export const GUIDE_PINK = "#FF3EA5";

export interface Guides {
  x: number | null;
  y: number | null;
}

export interface SnapTargets {
  x: readonly number[];
  y: readonly number[];
}

/** Screen px within which a line catches */
const SNAP_PX = 7;
/** Smallest box side, project px */
const MIN_SIDE = 24;
/** resizeBox clamps to a frame; give it one so large that a box can go anywhere, even off screen */
const ROOM = 1e6;

type DragMove = (ev: PointerEvent, dx: number, dy: number) => void;

/** Follow one pointer on the window until it lifts; dx/dy are screen px from the press */
function useDrag() {
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  return useCallback((e: React.PointerEvent, onMove: DragMove, onEnd: (moved: boolean) => void) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    stop.current?.();
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 2) return;
      moved = true;
      onMove(ev, ev.clientX - x0, ev.clientY - y0);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      stop.current = null;
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      end();
      onEnd(moved);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    stop.current = end;
  }, []);
}

interface BoxEditorProps {
  box: Box;
  /** Project size in px */
  W: number;
  H: number;
  /** The stage element the frame is drawn in (its on-screen size converts pointer moves) */
  stage: HTMLElement | null;
  targets: SnapTargets;
  /** What the box holds, for the keyboard label */
  label: string;
  onDraft: (box: Box) => void;
  onCommit: (box: Box) => void;
  onGuides: (g: Guides) => void;
}

/** Start a move of `box` from a press anywhere (the stage uses this to select-and-drag in one go) */
export interface MoveStarter {
  (e: React.PointerEvent, box: Box): void;
}

/** Move logic shared by the editor's own surface and the stage's press-to-select */
export function useBoxMove(W: number, H: number, stage: HTMLElement | null, targets: SnapTargets, onDraft: (b: Box) => void, onCommit: (b: Box) => void, onGuides: (g: Guides) => void): MoveStarter {
  const drag = useDrag();
  return useCallback((e: React.PointerEvent, start: Box) => {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const tx = SNAP_PX / Math.max(1, rect.width);
    const ty = SNAP_PX / Math.max(1, rect.height);
    let last = start;
    drag(e, (ev, dx, dy) => {
      let x = start.x + dx / rect.width;
      let y = start.y + dy / rect.height;
      let guides: Guides = { x: null, y: null };
      if (!ev.altKey) {
        const b = boxBounds({ ...start, x, y }, W, H);
        const sx = snapAxis(b.left, b.right, targets.x, tx);
        const sy = snapAxis(b.top, b.bottom, targets.y, ty);
        x += sx.offset;
        y += sy.offset;
        guides = { x: sx.guide, y: sy.guide };
      }
      last = { ...start, x, y };
      onGuides(guides);
      onDraft(last);
    }, (moved) => {
      onGuides({ x: null, y: null });
      if (moved) onCommit(last);
    });
  }, [W, H, stage, targets, drag, onDraft, onCommit, onGuides]);
}

export function BoxEditor({ box, W, H, stage, targets, label, onDraft, onCommit, onGuides }: BoxEditorProps) {
  const drag = useDrag();
  const groupRef = useRef<HTMLDivElement>(null);
  const startMove = useBoxMove(W, H, stage, targets, onDraft, onCommit, onGuides);
  const focusSelf = () => groupRef.current?.focus({ preventScroll: true });

  const onHandleDown = useCallback((handle: BoxHandle, e: React.PointerEvent<HTMLSpanElement>) => {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const perX = W / Math.max(1, rect.width);
    const perY = H / Math.max(1, rect.height);
    const rad = (box.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const w0 = box.w * W;
    const h0 = box.h * H;
    const local = { x: ROOM / 2 - w0 / 2, y: ROOM / 2 - h0 / 2, w: w0, h: h0 };
    const limits = { W: ROOM, H: ROOM, minW: MIN_SIDE, minH: MIN_SIDE };
    const start = box;
    let last = box;
    drag(e, (ev, dxs, dys) => {
      // Pointer move in project px, turned into the box's own axes
      const dx = dxs * perX;
      const dy = dys * perY;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      const keep = ev.shiftKey;
      const r = resizeBox(local, handle, lx, ly, limits, keep);
      // Centre shift in box axes, back to frame axes
      const ox = r.x + r.w / 2 - ROOM / 2;
      const oy = r.y + r.h / 2 - ROOM / 2;
      let next: Box = { ...start, x: start.x + (ox * cos - oy * sin) / W, y: start.y + (ox * sin + oy * cos) / H, w: r.w / W, h: r.h / H };
      let guides: Guides = { x: null, y: null };
      // Square boxes: the dragged edges catch on the same lines as a move
      if (!ev.altKey && !keep && start.rotation === 0) {
        const tx = SNAP_PX / Math.max(1, rect.width);
        const ty = SNAP_PX / Math.max(1, rect.height);
        let left = next.x - next.w / 2;
        let right = next.x + next.w / 2;
        let top = next.y - next.h / 2;
        let bottom = next.y + next.h / 2;
        if (handle.includes("w")) {
          const s = snapValue(left, targets.x, tx);
          left += s.offset;
          guides.x = s.guide;
        } else if (handle.includes("e")) {
          const s = snapValue(right, targets.x, tx);
          right += s.offset;
          guides.x = s.guide;
        }
        if (handle.includes("n")) {
          const s = snapValue(top, targets.y, ty);
          top += s.offset;
          guides.y = s.guide;
        } else if (handle.includes("s")) {
          const s = snapValue(bottom, targets.y, ty);
          bottom += s.offset;
          guides.y = s.guide;
        }
        if (right - left > MIN_SIDE / W && bottom - top > MIN_SIDE / H) {
          next = { ...next, x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top };
        } else guides = { x: null, y: null };
      }
      last = next;
      onGuides(guides);
      onDraft(next);
    }, (moved) => {
      onGuides({ x: null, y: null });
      if (moved) onCommit(last);
    });
  }, [box, W, H, stage, targets, drag, onDraft, onCommit, onGuides]);

  const onRotateDown = useCallback((e: React.PointerEvent) => {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + box.x * rect.width;
    const cy = rect.top + box.y * rect.height;
    const start = box;
    let last = box;
    drag(e, (ev) => {
      // The handle sits above the box, so straight up is 0 degrees
      const deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      last = { ...start, rotation: snapAngle(deg, ev.shiftKey) };
      onDraft(last);
    }, (moved) => {
      if (moved) onCommit(last);
    });
  }, [box, stage, drag, onDraft, onCommit]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.005;
    let next: Box | null = null;
    if (e.key === "ArrowLeft") next = { ...box, x: box.x - step };
    else if (e.key === "ArrowRight") next = { ...box, x: box.x + step };
    else if (e.key === "ArrowUp") next = { ...box, y: box.y - step };
    else if (e.key === "ArrowDown") next = { ...box, y: box.y + step };
    else if (e.key === "[" || e.key === "]") next = { ...box, rotation: snapAngle(box.rotation + (e.key === "]" ? 1 : -1) * (e.shiftKey ? 15 : 1), false) };
    if (!next) return;
    // The timeline's arrow keys step frames; inside the box they move it instead
    e.preventDefault();
    e.stopPropagation();
    onCommit(next);
  }, [box, onCommit]);

  return (
    <MuiBox
      ref={groupRef}
      role="group"
      tabIndex={0}
      aria-label={`${label}. Arrow keys move it, Shift moves further, [ and ] rotate.`}
      onKeyDown={onKeyDown}
      style={{
        left: `${(box.x - box.w / 2) * 100}%`,
        top: `${(box.y - box.h / 2) * 100}%`,
        width: `${box.w * 100}%`,
        height: `${box.h * 100}%`,
        transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
      }}
      sx={{
        position: "absolute",
        pointerEvents: "none",
        outline: "none",
        "&:focus-visible": { boxShadow: `0 0 0 4px rgba(47,123,255,0.45)` },
      }}
    >
      <ResizeFrame box={{ x: 0, y: 0, w: 100, h: 100 }} color={SELECT_BLUE} onHandleDown={onHandleDown}>
        <div
          title="Drag to move (Alt turns snapping off)"
          onPointerDown={(e) => {
            focusSelf();
            startMove(e, box);
          }}
          style={{ position: "absolute", inset: 0, cursor: "move", pointerEvents: "auto", touchAction: "none" }}
        />
        <span
          aria-hidden
          title="Drag to rotate (Shift steps by 15°)"
          onPointerDown={onRotateDown}
          style={{ position: "absolute", left: "50%", top: -40, width: 26, height: 26, marginLeft: -13, cursor: "grab", pointerEvents: "auto", touchAction: "none", display: "grid", placeItems: "center" }}
        >
          <span style={{ position: "absolute", left: 12, top: 22, width: 2, height: 18, background: SELECT_BLUE }} />
          <span style={{ width: 13, height: 13, borderRadius: "50%", background: "#fff", border: `2px solid ${SELECT_BLUE}`, boxShadow: "0 1px 3px rgba(0,0,0,0.35)", boxSizing: "border-box" }} />
        </span>
      </ResizeFrame>
    </MuiBox>
  );
}
