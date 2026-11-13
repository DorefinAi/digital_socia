"use client";

// Watch mode: the holder's cursor and selection drawn over the read-only Tweet box. An invisible mirror div
// copies the textarea's font, padding, line height and width, holds the same text as one text node, and a DOM
// Range on it measures where the caret and selection sit (caretMirror.ts has the maths). The overlay follows
// the textarea's own scroll and size. A small name flag shows for FLAG_SHOW_MS after each change, then fades,
// so it never covers the line above for long.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { readableFill } from "@/lib/socia/liveCore";
import { FLAG_SHOW_MS, MIRROR_PROPS, caretInBox, caretRect, caretVisible, flagPosition, shouldFollowCaret, liveSelection, mirrorStyle, mirrorText, snapToGrapheme, toBoxRects, type MirrorProp, type Rect } from "./caretMirror";

interface Geometry {
  box: Rect;
  caret: Rect | null;
  selection: Rect[];
}

const FLAG_H = 18;
/** The flag's width before it is measured: roughly the name at 11px bold */
const flagWidthGuess = (name: string) => Math.ceil(name.length * 7 + 12);

const plain = (r: DOMRect | undefined | null): Rect | null => (r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);

export default function LiveCaret({
  target,
  text,
  selStart,
  selEnd,
  color,
  name,
  changedAt,
}: {
  /** The Tweet box's textarea */
  target: HTMLTextAreaElement | null;
  text: string;
  selStart: number;
  selEnd: number;
  color: string;
  /** The holder's first name, for the flag */
  name: string;
  /** When the holder's state last changed (shows the flag again) */
  changedAt: number;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const flagRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [flagW, setFlagW] = useState(() => flagWidthGuess(name));

  /** What following the caret remembers: its last line, whether it was in view, and the watcher's own scrolling */
  const state = useRef({ lastLine: null as number | null, wasVisible: true, userScrollAt: -Infinity, ownScroll: false });

  /** Measures everything again. "change": the holder's state changed, so the caret may be followed into view. */
  const measure = useCallback(
    (mode: "change" | "layout") => {
      const overlay = overlayRef.current;
      // The box itself, found from the overlay (its sibling), so it is never written through a prop
      const ta = textareaNear(overlay);
      const mirror = mirrorRef.current;
      const host = overlay?.parentElement;
      if (!ta || !overlay || !mirror || !host) return;
      const taRect = ta.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const box = { left: taRect.left - hostRect.left + ta.clientLeft, top: taRect.top - hostRect.top + ta.clientTop, width: ta.clientWidth, height: ta.clientHeight };

      const cs = getComputedStyle(ta) as unknown as Record<MirrorProp, string>;
      const picked: Partial<Record<MirrorProp, string>> = {};
      for (const p of MIRROR_PROPS) picked[p] = cs[p];
      Object.assign(mirror.style, Object.fromEntries(Object.entries(mirrorStyle(picked, ta.clientWidth)).map(([k, v]) => [k, typeof v === "number" ? `${v}px` : v])));
      const shown = mirrorText(text);
      if (mirror.textContent !== shown) mirror.textContent = shown;
      const node = mirror.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return setGeo({ box, caret: null, selection: [] });

      const sel = liveSelection(text, selStart, selEnd);
      const origin = mirror.getBoundingClientRect();
      const range = document.createRange();
      const rectsOf = (a: number, z: number) => {
        range.setStart(node, a);
        range.setEnd(node, z);
        return Array.from(range.getClientRects()).map((r) => plain(r)!);
      };
      const selectionRects = sel.collapsed ? [] : rectsOf(sel.start, sel.end);
      const at = sel.caret;
      const collapsedRect = rectsOf(at, at)[0] ?? null;
      const nextEnd = snapToGrapheme(text, at + 1, true);
      const prevStart = at > 0 ? snapToGrapheme(text, at - 1) : at;
      const nextRects = nextEnd > at ? rectsOf(at, nextEnd) : [];
      const prevRects = prevStart < at ? rectsOf(prevStart, at) : [];
      const raw = caretRect({ collapsed: collapsedRect, next: nextRects[0] ?? null, prev: prevRects[prevRects.length - 1] ?? null });

      if (raw) {
        // Follow the holder's caret only when it just went out of view and the watcher isn't reading elsewhere
        const top = raw.top - origin.top;
        const visible = caretVisible(top, raw.height, ta.scrollTop, ta.clientHeight);
        const follow = state.current;
        if (
          mode === "change" &&
          shouldFollowCaret({ line: top, lastLine: follow.lastLine, visible, wasVisible: follow.wasVisible, sinceUserScroll: Date.now() - follow.userScrollAt })
        ) {
          follow.ownScroll = true;
          ta.scrollTop = top < ta.scrollTop ? Math.max(0, top - 4) : top + raw.height - ta.clientHeight + 4;
        }
        if (mode === "change") {
          follow.lastLine = top;
          follow.wasVisible = caretVisible(top, raw.height, ta.scrollTop, ta.clientHeight);
        }
      }
      const scroll = { top: ta.scrollTop, left: ta.scrollLeft };
      setGeo({
        box,
        caret: raw ? caretInBox(raw, origin, scroll, box) : null,
        selection: toBoxRects(selectionRects, origin, scroll, box),
      });
    },
    [text, selStart, selEnd],
  );

  // A new state from the holder: measure, and maybe follow their cursor
  useLayoutEffect(() => measure("change"), [measure]);
  const measureRef = useRef(measure);
  useEffect(() => {
    measureRef.current = measure;
  });

  // The box scrolled, resized (window, panel drag, autosize) or its font finished loading. Attached once per box;
  // a scroll that isn't the overlay's own counts as the watcher reading, which pauses following for a while.
  useEffect(() => {
    if (!target) return;
    const again = () => measureRef.current("layout");
    const onScroll = () => {
      const s = state.current;
      if (s.ownScroll) s.ownScroll = false;
      else s.userScrollAt = Date.now();
      again();
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(again) : null;
    ro?.observe(target);
    window.addEventListener("resize", again);
    void document.fonts?.ready.then(again).catch(() => undefined);
    return () => {
      target.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      window.removeEventListener("resize", again);
    };
  }, [target]);

  // The flag shows after each change, then fades: it is on until the change it was shown for has had its time
  const [fadedFor, setFadedFor] = useState<number | null>(null);
  const flagOn = fadedFor !== changedAt;
  useEffect(() => {
    const t = setTimeout(() => setFadedFor(changedAt), FLAG_SHOW_MS);
    return () => clearTimeout(t);
  }, [changedAt]);
  useLayoutEffect(() => {
    const w = flagRef.current?.offsetWidth;
    if (w && w !== flagW) setFlagW(w);
  }, [name, geo, flagW]);

  const box = geo?.box ?? { left: 0, top: 0, width: 0, height: 0 };
  const caret = geo?.caret ?? null;
  const flagAt = caret ? flagPosition(caret, box, { width: flagW, height: FLAG_H }) : null;

  return (
    <Box ref={overlayRef} aria-hidden data-testid="live-caret" sx={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
      <div ref={mirrorRef} />
      {geo?.selection.map((r, i) => (
        <Box key={i} sx={{ position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height, backgroundColor: alpha(color, 0.2), borderRadius: "2px" }} />
      ))}
      {caret && <Box data-testid="live-caret-bar" sx={{ position: "absolute", left: caret.left, top: caret.top, width: 2, height: caret.height, backgroundColor: color, borderRadius: "1px" }} />}
      {caret && flagAt && (
        <Box
          ref={flagRef}
          sx={{
            position: "absolute",
            left: flagAt.left,
            top: flagAt.top,
            height: FLAG_H,
            px: "5px",
            display: "flex",
            alignItems: "center",
            borderRadius: flagAt.below ? "0 4px 4px 4px" : "4px 4px 4px 0",
            backgroundColor: readableFill(color),
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: "nowrap",
            opacity: flagOn ? 1 : 0,
            transition: "opacity 300ms ease",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          }}
        >
          {name}
        </Box>
      )}
    </Box>
  );
}

/** The visible textarea beside the overlay (MUI's autosize adds a hidden twin, aria-hidden, for measuring) */
function textareaNear(overlay: HTMLElement | null): HTMLTextAreaElement | null {
  return overlay?.parentElement?.querySelector<HTMLTextAreaElement>("textarea:not([aria-hidden])") ?? null;
}
