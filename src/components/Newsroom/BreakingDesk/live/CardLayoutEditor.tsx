"use client";

// Templates tab, live desk: where the date and the story go on the operator's X background. Both places
// are moved and resized on a live sample card (drawn by the same code the editor posts with), then
// saved with PATCH /me/card-template. The editor redraws every card with the saved places.

import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, IconButton, Skeleton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import { MoreHorizontal, Move, Redo2, RotateCcw, Save, Scaling, Undo2 } from "lucide-react";
import * as socia from "@/lib/socia/api";
import type { CardSlot, CardTemplateLayout, UserCardTemplate } from "@/lib/socia/types";
import { BoxGesture, FrameBox, ResizeFrame, resizeBox, useBoxGesture } from "../ResizeFrame";
import { apiFileUrl, errorText } from "./LiveDesk";
import { type CardWords, fontsReady, loadImage, paintCardText } from "./backgroundCard";
import { NUDGE, editorKeyFor, editorShortcut, swallowNextContextMenu, withEditorShortcut } from "../editorKeys";
import { type MenuEntry, useEditorMenu } from "../video/ui/EditorContextMenu";

/** The First India places (contract §2); colours, date format and font sizes are not edited here */
const DEFAULT_PLACES: Pick<CardTemplateLayout, "date" | "box"> = {
  date: { x: 0.54, y: 0.185, w: 0.415, h: 0.06, color: "#000000", format: "Date:DD/MM/YYYY" },
  box: { x: 0.075, y: 0.27, w: 0.85, h: 0.58 },
};

/** Smallest places, as shares of the image: a date still readable, a box that can hold a line or two */
const MIN = { date: { w: 0.08, h: 0.025 }, box: { w: 0.15, h: 0.08 } };

const SAMPLES: Record<"short" | "long", CardWords> = {
  short: {
    headline: "राजस्थान हाईकोर्ट का SI भर्ती-2016 को लेकर बड़ा निर्णय",
    body: "50% आरक्षण सीमा के अनुसार पदों की होगी पुनर्गणना के आदेश, 90 दिन में पदों की पुनर्गणना कर संशोधित सूची जारी करने के निर्देश।",
  },
  long: {
    headline: "राजस्थान हाईकोर्ट का SI भर्ती-2016 को लेकर बड़ा निर्णय, 50% आरक्षण सीमा के अनुसार पदों की होगी पुनर्गणना",
    body:
      "50% आरक्षण सीमा के अनुसार पदों की होगी पुनर्गणना के आदेश, 90 दिन में पदों की पुनर्गणना कर संशोधित सूची जारी करने के निर्देश। हाईकोर्ट ने कहा कि भर्ती प्रक्रिया में आरक्षण के नियमों का पालन जरूरी है। राज्य सरकार को तय समय में रिपोर्ट पेश करनी होगी। अभ्यर्थियों ने फैसले का स्वागत किया है और जल्द नियुक्ति की उम्मीद जताई है। मामले की अगली सुनवाई दिसंबर में होगी।",
  },
};

type Slot = "date" | "box";
const SLOT_NAME: Record<Slot, string> = { date: "Date tag", box: "Text box" };

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const floor4 = (v: number) => Math.floor(v * 1e4 + 1e-6) / 1e4;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Fractions the server accepts: 0..1, rounded, and never past the right or bottom edge. */
function cleanSlot(s: CardSlot): CardSlot {
  const x = round4(clamp01(s.x));
  const y = round4(clamp01(s.y));
  return { x, y, w: Math.max(0.0001, floor4(Math.min(s.w, 1 - x))), h: Math.max(0.0001, floor4(Math.min(s.h, 1 - y))) };
}

/** The layout exactly as PATCH wants it: known keys only, places cleaned, font range in order. */
export function cleanLayout(l: CardTemplateLayout): CardTemplateLayout {
  return {
    date: { ...cleanSlot(l.date), color: l.date.color, format: l.date.format },
    box: cleanSlot(l.box),
    headline: { color: l.headline.color },
    body: { color: l.body.color },
    fontMinPx: Math.min(l.fontMinPx, l.fontMaxPx),
    fontMaxPx: Math.max(l.fontMinPx, l.fontMaxPx),
  };
}

const samePlaces = (a: CardTemplateLayout, b: CardTemplateLayout) => JSON.stringify(cleanLayout(a)) === JSON.stringify(cleanLayout(b));

/** Longest side of the sample canvas; enough for a sharp preview, light enough to redraw on every drag frame */
const PREVIEW_MAX = 1200;

interface Props {
  template: UserCardTemplate;
  /** False for roles that can't post: the sample shows, nothing moves */
  editable: boolean;
  /** Loads the saved template again so the editor draws with it */
  onSaved: () => Promise<unknown>;
}

export default function CardLayoutEditor({ template, editable, onSaved }: Props) {
  const saved = template.layout;
  const [draft, setDraft] = useState<CardTemplateLayout | null>(null);
  const layout = draft ?? saved;
  const dirty = !!draft && !samePlaces(draft, saved);
  const [selected, setSelected] = useState<Slot>("box");
  const [sample, setSample] = useState<"short" | "long">("short");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [fit, setFit] = useState<{ fontPx: number; cut: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startGesture = useBoxGesture();
  // Undo and redo: the places before each drag, key press or reset (null = the saved places)
  const [past, setPast] = useState<(CardTemplateLayout | null)[]>([]);
  const [future, setFuture] = useState<(CardTemplateLayout | null)[]>([]);
  const menu = useEditorMenu("Layout options");
  // The last arrow press, so a run of presses on one place is a single undo step
  const [arrowRun, setArrowRun] = useState<{ slot: Slot; at: number } | null>(null);
  // A new background (or a saved layout) starts a fresh history
  const historyKey = `${template.backgroundUrl}|${template.updatedAt}`;
  const [historyFor, setHistoryFor] = useState(historyKey);
  if (historyFor !== historyKey) {
    setHistoryFor(historyKey);
    setPast([]);
    setFuture([]);
  }

  const W = image?.naturalWidth || template.width;
  const H = image?.naturalHeight || template.height;
  const url = apiFileUrl(template.backgroundUrl);

  // The background and the Hindi faces, once per image
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadImage(url), fontsReady()])
      .then(([img]) => {
        if (cancelled) return;
        setImage(img);
        setImageError(null);
      })
      .catch((err: Error) => !cancelled && setImageError(err.message));
    return () => {
      cancelled = true;
    };
  }, [url, reload]);

  // Redraw the sample whenever a place moves; one paint per screen frame at most
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image) return;
    const frame = requestAnimationFrame(() => {
      const scale = Math.min(1, PREVIEW_MAX / Math.max(W, H));
      const cw = Math.round(W * scale);
      const ch = Math.round(H * scale);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      // Clear first: a background with transparent parts would otherwise keep the last frame's words
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(image, 0, 0, W, H);
      const result = paintCardText(ctx, layout, SAMPLES[sample], W, H);
      setFit((f) => (f && f.fontPx === result.fontPx && f.cut === result.cut ? f : result));
    });
    return () => cancelAnimationFrame(frame);
  }, [image, layout, sample, W, H]);

  // Leaving the page with places not saved asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const toBox = (s: CardSlot): FrameBox => ({ x: s.x * W, y: s.y * H, w: s.w * W, h: s.h * H });
  const fromBox = (b: FrameBox): CardSlot => ({ x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H });
  const limits = (slot: Slot) => ({ W, H, minW: MIN[slot].w * W, minH: MIN[slot].h * H });

  const near = (a: number, b: number) => Math.abs(a - b) < 1e-4;

  /** Keeps the places as they are now, so the change about to happen can be undone */
  const remember = () => {
    setArrowRun(null);
    setPast((p) => [...p.slice(-49), draft]);
    setFuture([]);
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [draft, ...f]);
    setPast((p) => p.slice(0, -1));
    setDraft(past[past.length - 1]);
    setJustSaved(false);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, draft]);
    setFuture((f) => f.slice(1));
    setDraft(future[0]);
    setJustSaved(false);
  };

  const place = (slot: Slot, next: CardSlot) => {
    setJustSaved(false);
    setDraft((d) => {
      const base = d ?? saved;
      return slot === "date" ? { ...base, date: { ...base.date, ...next } } : { ...base, box: next };
    });
  };

  const begin = (slot: Slot, gesture: BoxGesture, e: React.PointerEvent, frame: HTMLElement) => {
    if (!editable) return;
    setSelected(slot);
    // A right-click only selects; the menu opens from the frame
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Undo steps only for drags that moved something
    const before = draft;
    const onEnd = (moved: boolean) => {
      if (!moved) return;
      setPast((p) => [...p.slice(-49), before]);
      setFuture([]);
    };
    startGesture(e, { frame, gesture, start: toBox(layout[slot]), limits: limits(slot), onChange: (b) => place(slot, fromBox(b)), onEnd });
  };

  /**
   * Arrows move the selected place by 1% (Shift 5%); Alt+arrows resize it from the bottom-right corner.
   * Shift+F10 or the Menu key opens its options. A run of presses is one undo step; a move the edge stops is none.
   */
  const onKey = (slot: Slot, e: React.KeyboardEvent<HTMLElement>) => {
    if (!editable) return;
    if (editorKeyFor(e.nativeEvent)?.id === "box.menu") {
      e.preventDefault();
      swallowNextContextMenu();
      openMenuAt(e.currentTarget, slot);
      return;
    }
    if (!e.key.startsWith("Arrow") || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const step = e.shiftKey ? NUDGE.big : NUDGE.small;
    const dx = (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0) * W;
    const dy = (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0) * H;
    const now = layout[slot];
    const next = fromBox(resizeBox(toBox(now), e.altKey ? "se" : "move", dx, dy, limits(slot)));
    if (near(next.x, now.x) && near(next.y, now.y) && near(next.w, now.w) && near(next.h, now.h)) return;
    const stamp = e.timeStamp;
    if (!e.repeat && (!arrowRun || arrowRun.slot !== slot || stamp - arrowRun.at > 1000)) remember();
    setArrowRun({ slot, at: stamp });
    place(slot, next);
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      await socia.saveCardTemplateLayout(cleanLayout(draft), "x");
      await onSaved();
      setDraft(null);
      setPast([]);
      setFuture([]);
      setJustSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    remember();
    setJustSaved(false);
    setDraft((d) => {
      const base = d ?? saved;
      return { ...base, date: { ...base.date, x: DEFAULT_PLACES.date.x, y: DEFAULT_PLACES.date.y, w: DEFAULT_PLACES.date.w, h: DEFAULT_PLACES.date.h }, box: { ...DEFAULT_PLACES.box } };
    });
  };
  const geometry = (s: CardSlot) => JSON.stringify(cleanSlot(s));
  const atDefault = geometry(layout.date) === geometry(DEFAULT_PLACES.date) && geometry(layout.box) === geometry(DEFAULT_PLACES.box);

  /** Undo and redo while the focus is in this editor (a place, or its buttons); the desk's other tabs keep the keys */
  const onEditorKey = (e: React.KeyboardEvent) => {
    if (!editable) return;
    const cmd = editorKeyFor(e.nativeEvent);
    if (cmd?.id === "edit.undo") {
      e.preventDefault();
      undo();
    } else if (cmd?.id === "edit.redo") {
      e.preventDefault();
      redo();
    }
  };

  // ── Right-click: reset one place's position or size (the date tag and the text box are both needed, so neither hides) ──
  const resetPlace = (slot: Slot, part: "position" | "size") => {
    remember();
    const now = layout[slot];
    const home = DEFAULT_PLACES[slot];
    const w = part === "size" ? home.w : now.w;
    const h = part === "size" ? home.h : now.h;
    const x = part === "position" ? home.x : now.x;
    const y = part === "position" ? home.y : now.y;
    // Never past the right or bottom edge
    place(slot, { x: Math.min(x, 1 - w), y: Math.min(y, 1 - h), w, h });
  };
  const menuFor = (slot: Slot | null): MenuEntry[] => {
    const general: MenuEntry[] = [
      { label: "Undo", icon: <Undo2 size={14} />, hint: editorShortcut("edit.undo"), disabled: !past.length, onSelect: undo },
      { label: "Redo", icon: <Redo2 size={14} />, hint: editorShortcut("edit.redo"), disabled: !future.length, onSelect: redo },
      { kind: "divider" },
      { label: "Reset both to default", icon: <RotateCcw size={14} />, disabled: saving || atDefault, onSelect: reset },
    ];
    if (!slot) return general;
    const s = layout[slot];
    const home = DEFAULT_PLACES[slot];
    return [
      { kind: "header", label: SLOT_NAME[slot] },
      { label: "Reset position", icon: <Move size={14} />, disabled: near(s.x, home.x) && near(s.y, home.y), onSelect: () => resetPlace(slot, "position") },
      { label: "Reset size", icon: <Scaling size={14} />, disabled: near(s.w, home.w) && near(s.h, home.h), onSelect: () => resetPlace(slot, "size") },
      { kind: "divider" },
      ...general,
    ];
  };
  /** The same menu from the keyboard or the Options button, at the element */
  const openMenuAt = (el: HTMLElement, slot: Slot | null) => {
    const r = el.getBoundingClientRect();
    if (slot) setSelected(slot);
    menu.openAt({ x: r.left, y: r.bottom + 4 }, () => menuFor(slot));
  };
  /** Right-click on a place (its options) or elsewhere on the sample card (the general ones) */
  const openMenu = (e: React.MouseEvent, slot: Slot | null) => {
    if (!editable || !image) return;
    if (slot && menu.open(e, () => menuFor(slot))) setSelected(slot);
    else if (!slot) menu.open(e, () => menuFor(null));
  };

  return (
    <Box onKeyDown={onEditorKey}>
      <Box
        onContextMenu={(e: React.MouseEvent) => openMenu(e, null)}
        sx={{ position: "relative", width: "100%", aspectRatio: `${W} / ${H}`, borderRadius: "10px", backgroundColor: "#111", border: "1px solid", borderColor: "divider", userSelect: "none" }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Sample card on your X background, with today's date and a sample story"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: image ? "block" : "none", borderRadius: 9 }}
        />
        {!image && !imageError && <Skeleton variant="rounded" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "9px" }} />}
        {imageError && (
          <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setReload((n) => n + 1)}>Try again</Button>} sx={{ fontSize: "0.8125rem", borderRadius: "8px" }}>
              {imageError}
            </Alert>
          </Box>
        )}
        {image &&
          (["box", "date"] as Slot[]).map((slot) => (
            <SlotBox
              key={slot}
              slot={slot}
              place={layout[slot]}
              editable={editable}
              selected={editable && selected === slot}
              onSelect={() => setSelected(slot)}
              onBegin={(gesture, e, frame) => begin(slot, gesture, e, frame)}
              onKey={(e) => onKey(slot, e)}
              onMenu={(e) => openMenu(e, slot)}
            />
          ))}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sample}
          onChange={(_, v: "short" | "long" | null) => v && setSample(v)}
          aria-label="Sample story"
          sx={{ "& .MuiToggleButton-root": { px: 1.25, py: 0.4, textTransform: "none", fontSize: "0.75rem", fontWeight: 600 } }}
        >
          <ToggleButton value="short">Short story</ToggleButton>
          <ToggleButton value="long">Long story</ToggleButton>
        </ToggleButtonGroup>
        {fit && (
          <Typography sx={{ fontSize: "0.75rem", color: fit.cut ? "warning.main" : "text.secondary", fontVariantNumeric: "tabular-nums" }}>
            {fit.cut ? `Cut at ${fit.fontPx} px: too long for the box` : `Text at ${fit.fontPx} px (${Math.min(layout.fontMinPx, layout.fontMaxPx)}–${Math.max(layout.fontMinPx, layout.fontMaxPx)})`}
          </Typography>
        )}
      </Box>

      {editable && (
        <>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 1.25, lineHeight: 1.6 }}>
            Drag the date tag or the text box to move it. Drag a handle to resize; hold Shift on a corner to keep the shape. Arrow keys move the selected one by 1% (Shift: 5%); right-click it to reset its position or size.
          </Typography>
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1.5, borderRadius: "10px", fontSize: "0.8125rem" }}>
              {error}
            </Alert>
          )}
          <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
            <Button variant="contained" onClick={() => void save()} disabled={!dirty || saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <Save size={15} />}>
              {saving ? "Saving" : "Save layout"}
            </Button>
            {dirty && (
              <Button
                onClick={() => {
                  remember();
                  setDraft(null);
                }}
                disabled={saving}
                sx={{ color: "text.secondary" }}
              >
                Discard
              </Button>
            )}
            <Box sx={{ display: "flex" }}>
              <Button onClick={undo} disabled={!past.length} aria-label={withEditorShortcut("Undo", "edit.undo")} title={withEditorShortcut("Undo", "edit.undo")} sx={{ minWidth: 0, px: 1, color: "text.secondary" }}>
                <Undo2 size={16} />
              </Button>
              <Button onClick={redo} disabled={!future.length} aria-label={withEditorShortcut("Redo", "edit.redo")} title={withEditorShortcut("Redo", "edit.redo")} sx={{ minWidth: 0, px: 1, color: "text.secondary" }}>
                <Redo2 size={16} />
              </Button>
            </Box>
            <Button onClick={reset} disabled={saving || atDefault} startIcon={<RotateCcw size={15} />} sx={{ color: "text.secondary" }}>
              Reset to default
            </Button>
            <Tooltip title={`Options for the ${SLOT_NAME[selected].toLowerCase()} (${editorShortcut("box.menu")})`}>
              <IconButton
                size="small"
                aria-label={`Options for the ${SLOT_NAME[selected].toLowerCase()}`}
                aria-haspopup="menu"
                onClick={(e) => openMenuAt(e.currentTarget, selected)}
                disabled={!image}
                sx={{ color: "text.secondary" }}
              >
                <MoreHorizontal size={16} />
              </IconButton>
            </Tooltip>
            <Box role="status" aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 0.75, ml: { sm: "auto" }, fontSize: "0.75rem", fontWeight: 600, color: dirty ? "warning.main" : "text.secondary" }}>
              {dirty ? (
                <>
                  <Box component="span" aria-hidden sx={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "warning.main" }} />
                  Unsaved changes
                </>
              ) : justSaved ? (
                "Layout saved. New cards use it."
              ) : null}
            </Box>
          </Box>
        </>
      )}
      {menu.element}
    </Box>
  );
}

const pct = (s: CardSlot): FrameBox => ({ x: s.x * 100, y: s.y * 100, w: s.w * 100, h: s.h * 100 });
const percent = (v: number) => `${Math.round(v * 1000) / 10}%`;

interface SlotBoxProps {
  slot: Slot;
  place: CardSlot;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  /** `frame` is the picture the place sits on */
  onBegin: (gesture: BoxGesture, e: React.PointerEvent, frame: HTMLElement) => void;
  onKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  /** Right-click on this place */
  onMenu: (e: React.MouseEvent) => void;
}

/** One place on the background: a dashed outline when idle, the eight handles when selected. Focusable, so arrows work too. */
function SlotBox({ slot, place: s, editable, selected, onSelect, onBegin, onKey, onMenu }: SlotBoxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const begin = (gesture: BoxGesture, e: React.PointerEvent) => {
    const el = ref.current;
    const frame = el?.parentElement;
    if (!editable || !el || !frame) return;
    // The drag stops the browser from focusing on press, so focus here for the arrow keys
    el.focus({ preventScroll: true });
    onBegin(gesture, e, frame);
  };
  return (
    <>
      <Box
        ref={ref}
        role={editable ? "button" : "img"}
        tabIndex={editable ? 0 : undefined}
        aria-label={`${SLOT_NAME[slot]}: ${percent(s.x)} from the left, ${percent(s.y)} from the top, ${percent(s.w)} wide, ${percent(s.h)} high.${editable ? " Arrow keys move it, Alt and arrow keys resize it, Shift+F10 opens its options." : ""}`}
        aria-pressed={editable ? selected : undefined}
        aria-roledescription={editable ? "movable area" : undefined}
        onFocus={() => editable && onSelect()}
        onKeyDown={onKey}
        onContextMenu={(e: React.MouseEvent) => {
          // This place's menu, not the card's
          e.stopPropagation();
          onMenu(e);
        }}
        onPointerDown={(e: React.PointerEvent) => begin("move", e)}
        sx={{
          position: "absolute",
          left: `${s.x * 100}%`,
          top: `${s.y * 100}%`,
          width: `${s.w * 100}%`,
          height: `${s.h * 100}%`,
          border: selected ? "none" : "2px dashed rgba(255,255,255,0.95)",
          boxShadow: selected ? "none" : "0 0 0 1px rgba(0,0,0,0.45)",
          borderRadius: "3px",
          cursor: editable ? "move" : "default",
          touchAction: editable ? "none" : "auto",
          outline: "none",
          "&:focus-visible": { boxShadow: "0 0 0 3px rgba(47,123,255,0.55)" },
        }}
      >
        <Box
          component="span"
          sx={{
            position: "absolute",
            // Above the place, or just inside it when it touches the top of the picture
            ...(s.y < 0.05 ? { top: 2, left: 2 } : { left: 0, bottom: "100%", mb: "3px" }),
            px: 0.6,
            borderRadius: "3px",
            backgroundColor: selected ? "#2F7BFF" : "rgba(0,0,0,0.72)",
            color: "#fff",
            fontSize: "0.625rem",
            fontWeight: 600,
            lineHeight: 1.7,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {SLOT_NAME[slot]}
        </Box>
      </Box>
      {selected && <ResizeFrame box={pct(s)} color="#2F7BFF" onHandleDown={(h, e) => begin(h, e)} />}
    </>
  );
}
