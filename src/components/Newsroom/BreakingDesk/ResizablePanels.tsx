"use client";

// Side panels the operator can widen, narrow and fold away, around a middle area that keeps a
// minimum width. Widths and folded state are remembered per browser. Drag the handle (mouse, pen or
// touch), or focus it and use the arrow keys, Home and End; double-click puts the default width back.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";

export type PanelSide = "left" | "right";

export interface PanelSpec {
  /** Width in px when nothing is stored */
  initial: number;
  min: number;
  max: number;
}

export interface PanelsConfig {
  /** localStorage key; bump the suffix when the shape changes */
  storageKey: string;
  /** Fixed columns that sit outside the side panels (a tool rail), in px */
  leftFixed: number;
  /** Width of the right panel when folded (the strip that holds its open button), in px */
  rightFolded: number;
  /** The middle area never gets narrower than this */
  minMiddle: number;
  left: PanelSpec;
  right: PanelSpec;
}

interface Stored {
  w: number;
  collapsed: boolean;
}

export interface PanelState {
  side: PanelSide;
  /** Width actually drawn, after fitting the window */
  width: number;
  /** Narrowest and widest the panel can be right now */
  min: number;
  max: number;
  initial: number;
  collapsed: boolean;
  setWidth: (w: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  reset: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function readStored(key: string): Partial<Record<PanelSide, Stored>> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const value = JSON.parse(raw) as Partial<Record<PanelSide, Partial<Stored>>>;
    const pick = (s?: Partial<Stored>): Stored | undefined =>
      s && typeof s.w === "number" && Number.isFinite(s.w) ? { w: s.w, collapsed: s.collapsed === true } : undefined;
    return { left: pick(value.left), right: pick(value.right) };
  } catch {
    return {};
  }
}

/**
 * Two side panels around a middle column. `measure` is the ref for the element whose width is shared out;
 * `columns` is its grid-template-columns (fixed rail, left, middle, right).
 */
export function useResizablePanels(config: PanelsConfig) {
  const { storageKey, leftFixed, rightFolded, minMiddle } = config;
  const [stored, setStored] = useState<Record<PanelSide, Stored>>(() => {
    const saved = typeof window === "undefined" ? {} : readStored(storageKey);
    return {
      left: saved.left ?? { w: config.left.initial, collapsed: false },
      right: saved.right ?? { w: config.right.initial, collapsed: false },
    };
  });
  const [total, setTotal] = useState(0);

  // Watch the shared width so the panels give way on small screens
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setTotal(el.clientWidth);
    observer.current = new ResizeObserver(([entry]) => setTotal(Math.round(entry.contentRect.width)));
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch {
      // Private window or storage blocked: the layout still works, it just isn't remembered
    }
  }, [storageKey, stored]);

  // Fit both panels: the right one gives way first, then the left, never below their minimums
  const spare = total > 0 ? total - leftFixed - minMiddle : Infinity;
  const leftWanted = stored.left.collapsed ? 0 : clamp(stored.left.w, config.left.min, config.left.max);
  const rightWanted = stored.right.collapsed ? rightFolded : clamp(stored.right.w, config.right.min, config.right.max);
  const rightWidth = stored.right.collapsed ? rightFolded : clamp(Math.min(rightWanted, spare - leftWanted), config.right.min, rightWanted);
  const leftWidth = stored.left.collapsed ? 0 : clamp(Math.min(leftWanted, spare - rightWidth), config.left.min, leftWanted);

  const make = (side: PanelSide, width: number, other: number): PanelState => {
    const spec = config[side];
    const max = Math.max(spec.min, Math.min(spec.max, spare - other));
    return {
      side,
      width,
      min: spec.min,
      max,
      initial: Math.min(spec.initial, max),
      collapsed: stored[side].collapsed,
      setWidth: (w) => setStored((s) => ({ ...s, [side]: { w: Math.round(clamp(w, spec.min, max)), collapsed: false } })),
      setCollapsed: (collapsed) => setStored((s) => (s[side].collapsed === collapsed ? s : { ...s, [side]: { ...s[side], collapsed } })),
      reset: () => setStored((s) => ({ ...s, [side]: { w: Math.min(spec.initial, max), collapsed: false } })),
    };
  };

  const left = make("left", leftWidth, rightWidth);
  const right = make("right", rightWidth, leftWidth);
  const columns = `${leftFixed}px ${leftWidth}px minmax(0, 1fr) ${rightWidth}px`;
  return { measure, columns, left, right, leftFixed };
}

const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

interface HandleProps {
  panel: PanelState;
  /** Distance in px from the workspace edge on the panel's side to the panel's inner edge */
  offset: number;
  /** What the panel is, for screen readers ("tool panel") */
  label: string;
  /** id of the panel element */
  controls: string;
}

/**
 * The draggable inner edge of a side panel, with a small button to fold it away. Sits over the
 * workspace (the parent must be position: relative), so the panel's own content is untouched.
 */
export function PanelResizeHandle({ panel, offset, label, controls }: HandleProps) {
  const drag = useRef<{ x: number; w: number; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { side, width, min, max, collapsed } = panel;
  // Dragging toward the middle widens the panel
  const sign = side === "left" ? 1 : -1;

  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { x: e.clientX, w: width, id: e.pointerId };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    panel.setWidth(d.w + sign * (e.clientX - d.x));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = width - sign * step;
    else if (e.key === "ArrowRight") next = width + sign * step;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else if (e.key === "Enter") {
      e.preventDefault();
      panel.setCollapsed(!collapsed);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    panel.setWidth(next);
  };

  const name = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  const foldLabel = collapsed ? `Show the ${label}` : `Hide the ${label}`;
  const FoldIcon = side === "left" ? (collapsed ? PanelLeftOpen : PanelLeftClose) : collapsed ? PanelRightOpen : PanelRightClose;

  return (
    <Box sx={{ position: "absolute", top: 0, bottom: 0, [side]: offset - 6, width: 12, zIndex: 4, pointerEvents: "none" }}>
      {!collapsed && (
        <Box
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={`Resize the ${label}`}
          aria-controls={controls}
          aria-valuenow={width}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={`${name} ${width} pixels wide`}
          title="Drag to resize, double-click for the default width"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onDoubleClick={panel.reset}
          onKeyDown={onKeyDown}
          sx={{
            position: "absolute",
            inset: 0,
            cursor: "col-resize",
            touchAction: "none",
            pointerEvents: "auto",
            outline: "none",
            // The visible line sits on the panel's border
            "&::after": {
              content: '""',
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              width: 3,
              transform: "translateX(-50%)",
              backgroundColor: dragging ? "primary.main" : "transparent",
              transition: "background-color 120ms",
            },
            "&:hover::after": { backgroundColor: "text.disabled" },
            "&:focus-visible::after": { backgroundColor: "primary.main" },
          }}
        />
      )}
      <Tooltip title={foldLabel} placement={side === "left" ? "right" : "left"}>
        <IconButton
          aria-label={foldLabel}
          aria-expanded={!collapsed}
          aria-controls={controls}
          onClick={() => panel.setCollapsed(!collapsed)}
          sx={{
            // Just inside the middle area, clear of the panel's own heading
            position: "absolute",
            top: 10,
            [side]: 12,
            width: 24,
            height: 24,
            p: 0,
            pointerEvents: "auto",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "6px",
            color: "text.secondary",
            backgroundColor: "background.paper",
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            "&:hover": { backgroundColor: "background.paper", color: "text.primary", borderColor: "text.secondary" },
            "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
          }}
        >
          <FoldIcon size={14} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/** What a folded right panel leaves behind: a strip with its open button and name */
export function FoldedPanelStrip({ panel, label, title, controls }: { panel: PanelState; label: string; title: string; controls: string }) {
  if (!panel.collapsed) return null;
  return (
    <Box
      component="button"
      type="button"
      aria-label={`Show the ${label}`}
      aria-expanded={false}
      aria-controls={controls}
      onClick={() => panel.setCollapsed(false)}
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [panel.side]: 0,
        width: panel.width,
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.25,
        pt: 1.25,
        border: 0,
        [panel.side === "left" ? "borderRight" : "borderLeft"]: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.paper",
        color: "text.secondary",
        fontFamily: "inherit",
        cursor: "pointer",
        "&:hover": { color: "text.primary", backgroundColor: "action.hover" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
      }}
    >
      {panel.side === "left" ? <PanelLeftOpen size={16} /> : <PanelRightOpen size={16} />}
      <Box component="span" sx={{ writingMode: "vertical-rl", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.02em" }}>
        {title}
      </Box>
    </Box>
  );
}
