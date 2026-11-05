"use client";

// Template tab, live X editor: adding a shared card template and looking after one (contract v2 in
// org-card-templates-contract.md). Anyone who edits drafts uploads; the uploader or an admin renames it and
// moves its text area; only an admin sets the defaults or deletes. Whatever the server says a user can't
// do is not offered at all.

import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Skeleton, Switch, TextField, Typography } from "@mui/material";
import { Check, ImageUp, MoreVertical, Pencil, Scan, Star, Trash2 } from "lucide-react";
import * as socia from "@/lib/socia/api";
import type { CardSlot, OrgCardTemplate, OrgCardTemplateLayout, OrgTemplateTag } from "@/lib/socia/types";
import { BoxGesture, FrameBox, ResizeFrame, useBoxGesture } from "../ResizeFrame";
import { errorText } from "./LiveDesk";
import { type CardWords, fontsReady, paintCardText } from "./backgroundCard";
import { useTemplateImage } from "./orgCanvas";

const SELECT_BLUE = "#2F7BFF";
const MAX_BYTES = 5 * 1024 * 1024;
const MIN_SIDE = 600;
const MAX_SIDE = 4000;
const TYPES = ["image/png", "image/jpeg"];
const LABEL_MAX = 40;

/** Checks what the server would refuse, so the operator hears it at once. Resolves to a sentence or null. */
async function checkFile(file: File): Promise<string | null> {
  if (!TYPES.includes(file.type)) return "Choose a PNG or JPG image.";
  if (file.size > MAX_BYTES) return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Use one of 5 MB or less.`;
  const url = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
      image.onerror = () => reject(new Error("unreadable"));
      image.src = url;
    });
    if (size.w < MIN_SIDE || size.h < MIN_SIDE) return `That image is ${size.w} × ${size.h} px. Both sides need at least ${MIN_SIDE} px.`;
    if (size.w > MAX_SIDE || size.h > MAX_SIDE) return `That image is ${size.w} × ${size.h} px. Use one no bigger than ${MAX_SIDE} px on each side.`;
    return null;
  } catch {
    return "That file isn't an image the browser can read. Choose a PNG or JPG.";
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "Election-results_v2.png" → "Election results v2" */
const nameFromFile = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_MAX);

// ─── Text area editor ───────────────────────────────────────────────────────────────────────────────

/** The sample story drawn on template previews, so the text area shows */
export const SAMPLE: CardWords = {
  headline: "राजस्थान हाईकोर्ट का SI भर्ती-2016 को लेकर बड़ा निर्णय",
  body: "50% आरक्षण सीमा के अनुसार पदों की होगी पुनर्गणना के आदेश, 90 दिन में पदों की पुनर्गणना कर संशोधित सूची जारी करने के निर्देश।",
};
const DEFAULT_DATE = { x: 0.55, y: 0.06, w: 0.38, h: 0.05, color: "#000000", format: "DD/MM/YYYY" };
const MIN = { box: { w: 0.15, h: 0.08 }, date: { w: 0.08, h: 0.025 } };
const PREVIEW_MAX = 1000;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const floor4 = (v: number) => Math.floor(v * 1e4 + 1e-6) / 1e4;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Fractions the server accepts: 0..1, rounded, never past the right or bottom edge. */
function cleanSlot(s: CardSlot): CardSlot {
  const x = round4(clamp01(s.x));
  const y = round4(clamp01(s.y));
  return { x, y, w: Math.max(0.0001, floor4(Math.min(s.w, 1 - x))), h: Math.max(0.0001, floor4(Math.min(s.h, 1 - y))) };
}

function cleanLayout(l: OrgCardTemplateLayout): OrgCardTemplateLayout {
  return {
    date: l.date ? { ...cleanSlot(l.date), color: l.date.color, format: l.date.format } : null,
    box: cleanSlot(l.box),
    headline: { color: l.headline.color },
    body: { color: l.body.color },
    fontMinPx: Math.min(l.fontMinPx, l.fontMaxPx),
    fontMaxPx: Math.max(l.fontMinPx, l.fontMaxPx),
  };
}

type Slot = "box" | "date";
const SLOT_NAME: Record<Slot, string> = { box: "News text", date: "Date" };

interface TextAreaEditorProps {
  template: OrgCardTemplate;
  /** Shown above the picture: what this step is for */
  intro: string;
  saveLabel: string;
  /** Skip (after an upload) or Cancel */
  cancelLabel: string;
  onCancel: () => void;
  onSaved: (template: OrgCardTemplate) => void;
  /** Told when a save starts and ends, so the dialog around it can stay open meanwhile */
  onSavingChange?: (saving: boolean) => void;
}

/** Drag and resize the news text area (and the optional date slot) on the template's picture; a sample story shows the result. */
function TextAreaEditor({ template, intro, saveLabel, cancelLabel, onCancel, onSaved, onSavingChange }: TextAreaEditorProps) {
  const [layout, setLayout] = useState<OrgCardTemplateLayout>(template.layout);
  const [selected, setSelected] = useState<Slot>("box");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { image, error: imageError, retry } = useTemplateImage(template.backgroundUrl);
  const [fontsIn, setFontsIn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startGesture = useBoxGesture();
  const W = template.width || image?.naturalWidth || 1080;
  const H = template.height || image?.naturalHeight || 1080;

  useEffect(() => {
    let cancelled = false;
    void fontsReady().then(() => !cancelled && setFontsIn(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // The sample card, redrawn at most once per screen frame while a place moves
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image) return;
    const frame = requestAnimationFrame(() => {
      const scale = Math.min(1, PREVIEW_MAX / Math.max(W, H));
      canvas.width = Math.round(W * scale);
      canvas.height = Math.round(H * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(image, 0, 0, W, H);
      paintCardText(ctx, layout, SAMPLE, W, H);
    });
    return () => cancelAnimationFrame(frame);
  }, [image, layout, W, H, fontsIn]);

  const toBox = (s: CardSlot): FrameBox => ({ x: s.x * W, y: s.y * H, w: s.w * W, h: s.h * H });
  const fromBox = (b: FrameBox): CardSlot => ({ x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H });

  const move = (slot: Slot, next: CardSlot) => setLayout((l) => (slot === "box" ? { ...l, box: next } : l.date ? { ...l, date: { ...l.date, ...next } } : l));

  /** `frame` is the picture the place sits on (the parent of the place or of its handles' frame) */
  const begin = (slot: Slot, gesture: BoxGesture, e: React.PointerEvent, frame: HTMLElement | null | undefined) => {
    const s = slot === "box" ? layout.box : layout.date;
    if (!frame || !s) return;
    setSelected(slot);
    startGesture(e, { frame, gesture, start: toBox(s), limits: { W, H, minW: MIN[slot].w * W, minH: MIN[slot].h * H }, onChange: (b) => move(slot, fromBox(b)) });
  };

  /** Arrows move the selected place by 1% (Shift 5%), Alt+arrows resize it */
  const onKey = (slot: Slot, e: React.KeyboardEvent) => {
    if (!e.key.startsWith("Arrow") || e.ctrlKey || e.metaKey) return;
    const s = slot === "box" ? layout.box : layout.date;
    if (!s) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 0.05 : 0.01;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    const next = e.altKey
      ? { ...s, w: Math.max(MIN[slot].w, Math.min(1 - s.x, s.w + dx)), h: Math.max(MIN[slot].h, Math.min(1 - s.y, s.h + dy)) }
      : { ...s, x: clamp01(Math.min(1 - s.w, s.x + dx)), y: clamp01(Math.min(1 - s.h, s.y + dy)) };
    move(slot, next);
  };

  const save = async () => {
    setSaving(true);
    onSavingChange?.(true);
    setError(null);
    try {
      const res = await socia.updateOrgCardTemplate(template.slug, { layout: cleanLayout(layout) });
      onSaved(res.template);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  };

  const colour = (label: string, value: string, onChange: (v: string) => void) => (
    <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: "0.75rem", cursor: "pointer" }}>
      <Box
        component="input"
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value.toUpperCase())}
        sx={{ width: 28, height: 28, p: 0, border: "1px solid", borderColor: "divider", borderRadius: "6px", backgroundColor: "transparent", cursor: "pointer" }}
      />
      {label}
    </Box>
  );

  return (
    <>
      <DialogContent sx={{ pt: 0.5 }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mb: 1.5, lineHeight: 1.6 }}>{intro}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) 200px" }, gap: 2, alignItems: "start" }}>
          <Box
            data-area-frame
            sx={{ position: "relative", width: "100%", maxWidth: `calc(62vh * ${W} / ${H})`, mx: "auto", aspectRatio: `${W} / ${H}`, backgroundColor: "#111", borderRadius: "6px", userSelect: "none" }}
          >
            <canvas ref={canvasRef} role="img" aria-label={`${template.label} with a sample story`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: image ? "block" : "none", borderRadius: 6 }} />
            {!image && !imageError && <Skeleton variant="rounded" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />}
            {imageError && (
              <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", p: 2 }}>
                <Alert severity="error" action={<Button color="inherit" size="small" onClick={retry}>Try again</Button>} sx={{ fontSize: "0.8125rem" }}>
                  {imageError}
                </Alert>
              </Box>
            )}
            {image &&
              (["box", "date"] as Slot[]).map((slot) => {
                const s = slot === "box" ? layout.box : layout.date;
                if (!s) return null;
                const on = selected === slot;
                return (
                  <React.Fragment key={slot}>
                    <Box
                      role="button"
                      tabIndex={0}
                      aria-label={`${SLOT_NAME[slot]} area. Drag to move; arrow keys move it, Alt and arrow keys resize it.`}
                      aria-pressed={on}
                      onFocus={() => setSelected(slot)}
                      onKeyDown={(e) => onKey(slot, e)}
                      onPointerDown={(e: React.PointerEvent) => {
                        const el = e.currentTarget as HTMLElement;
                        el.focus({ preventScroll: true });
                        begin(slot, "move", e, el.parentElement);
                      }}
                      sx={{
                        position: "absolute",
                        left: `${s.x * 100}%`,
                        top: `${s.y * 100}%`,
                        width: `${s.w * 100}%`,
                        height: `${s.h * 100}%`,
                        border: on ? "none" : "2px dashed rgba(255,255,255,0.95)",
                        boxShadow: on ? "none" : "0 0 0 1px rgba(0,0,0,0.5)",
                        cursor: "move",
                        touchAction: "none",
                        outline: "none",
                        "&:focus-visible": { boxShadow: "0 0 0 3px rgba(47,123,255,0.6)" },
                      }}
                    >
                      <Box component="span" sx={{ position: "absolute", ...(s.y < 0.05 ? { top: 2, left: 2 } : { left: 0, bottom: "100%", mb: "3px" }), px: 0.6, borderRadius: "3px", backgroundColor: on ? SELECT_BLUE : "rgba(0,0,0,0.75)", color: "#fff", fontSize: "0.625rem", fontWeight: 600, lineHeight: 1.7, whiteSpace: "nowrap", pointerEvents: "none" }}>
                        {SLOT_NAME[slot]}
                      </Box>
                    </Box>
                    {on && <ResizeFrame box={{ x: s.x * 100, y: s.y * 100, w: s.w * 100, h: s.h * 100 }} color={SELECT_BLUE} onHandleDown={(h, e) => begin(slot, h, e, (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-area-frame]"))} />}
                  </React.Fragment>
                );
              })}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {colour("Headline colour", layout.headline.color, (v) => setLayout((l) => ({ ...l, headline: { color: v } })))}
            {colour("Story colour", layout.body.color, (v) => setLayout((l) => ({ ...l, body: { color: v } })))}
            <Box component="label" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, cursor: "pointer" }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>Date slot</Typography>
              <Switch
                size="small"
                checked={!!layout.date}
                onChange={(e) => {
                  const on = e.target.checked;
                  setLayout((l) => ({ ...l, date: on ? { ...DEFAULT_DATE } : null }));
                  setSelected(on ? "date" : "box");
                }}
              />
            </Box>
            {layout.date && colour("Date colour", layout.date.color, (v) => setLayout((l) => (l.date ? { ...l, date: { ...l.date, color: v } } : l)))}
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.6 }}>
              Cards on this design start with the headline at the top of the news text area and the story under it. Today&apos;s date goes in the date slot.
            </Typography>
          </Box>
        </Box>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1.5, fontSize: "0.8125rem" }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={saving} sx={{ color: "text.secondary" }}>
          {cancelLabel}
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving || !image} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {saving ? "Saving" : saveLabel}
        </Button>
      </DialogActions>
    </>
  );
}

// ─── Upload ─────────────────────────────────────────────────────────────────────────────────────────

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** The new template, after its text area was set (or skipped) */
  onDone: (template: OrgCardTemplate) => void;
}

/** Pick a picture, name it, upload it, then set where the news goes on it. */
export function UploadTemplateDialog({ open, onClose, onDone }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<OrgCardTemplate | null>(null);
  // "Save and use it" in flight: closing now would hand the template back twice
  const [savingArea, setSavingArea] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setLabel("");
    setError(null);
    setUploaded(null);
    setBusy(false);
  };
  const close = () => {
    if (busy || savingArea) return;
    // Uploaded but the text area not set: the template is there with the server's default area
    if (uploaded) onDone(uploaded);
    else onClose();
    reset();
  };

  const choose = async (picked: File | undefined) => {
    if (!picked || busy) return;
    setError(null);
    const problem = await checkFile(picked);
    if (problem) {
      setError(problem);
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
    setLabel((l) => l || nameFromFile(picked.name));
  };

  const name = label.trim();
  const upload = async () => {
    if (!file || !name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await socia.uploadOrgCardTemplate(file, name, "x");
      setUploaded(res.template);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth={uploaded ? "md" : "sm"} slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
      <DialogTitle sx={{ fontSize: "1rem", fontWeight: 700, pb: 1 }}>{uploaded ? `Set the text area on ${uploaded.label}` : "Upload a card template"}</DialogTitle>
      {uploaded ? (
        <TextAreaEditor
          template={uploaded}
          intro="Drag the box to where the news goes, and pull its handles to size it. Turn on the date slot if the design has a place for today's date."
          saveLabel="Save and use it"
          cancelLabel="Skip"
          onCancel={() => {
            onDone(uploaded);
            reset();
          }}
          onSaved={(t) => {
            onDone(t);
            reset();
          }}
          onSavingChange={setSavingArea}
        />
      ) : (
        <>
          <DialogContent sx={{ pt: 0.5 }}>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mb: 1.5, lineHeight: 1.6 }}>
              A PNG or JPG up to 5 MB, between {MIN_SIDE} and {MAX_SIDE} px on each side. The card is made at the picture&apos;s own size, and everyone on the desk can use it.
            </Typography>
            <Box
              onDragOver={(e: React.DragEvent) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: React.DragEvent) => {
                e.preventDefault();
                setDragging(false);
                void choose(e.dataTransfer.files?.[0]);
              }}
              sx={{ display: "grid", gridTemplateColumns: preview ? "120px minmax(0, 1fr)" : "1fr", gap: 2, alignItems: "center", p: 1.5, border: "2px dashed", borderColor: dragging ? SELECT_BLUE : "divider", borderRadius: "10px", backgroundColor: dragging ? "action.hover" : "transparent" }}
            >
              {preview && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={preview} alt="The picture you chose" style={{ width: "100%", maxHeight: 160, objectFit: "contain", display: "block", borderRadius: 6, background: "#111" }} />
              )}
              <Box sx={{ textAlign: preview ? "left" : "center", py: preview ? 0 : 2 }}>
                <Button variant="outlined" startIcon={<ImageUp size={16} />} onClick={() => inputRef.current?.click()} disabled={busy}>
                  {file ? "Choose another picture" : "Choose a picture"}
                </Button>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.75 }}>{file ? file.name : "or drop it here"}</Typography>
              </Box>
            </Box>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              void choose(picked);
            }} />
            <TextField
              label="Name"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, LABEL_MAX))}
              helperText={`What the desk sees under the thumbnail. ${name.length} / ${LABEL_MAX}`}
              fullWidth
              size="small"
              disabled={busy}
              sx={{ mt: 2 }}
              slotProps={{ htmlInput: { maxLength: LABEL_MAX, lang: "hi" } }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void upload();
              }}
            />
            {error && (
              <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 1.5, fontSize: "0.8125rem" }}>
                {error}
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={close} disabled={busy} sx={{ color: "text.secondary" }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void upload()} disabled={!file || !name || busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <ImageUp size={15} />}>
              {busy ? "Uploading" : "Upload"}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

// ─── One template's options ─────────────────────────────────────────────────────────────────────────

const TAG_DEFAULTS: { tag: OrgTemplateTag; label: string }[] = [
  { tag: "big_breaking", label: "Default for BIG breaking" },
  { tag: "breaking", label: "Default for BREAKING" },
];

/** True when the server lets this user do anything to the template, so its options button shows. */
export const hasTemplateOptions = (t: OrgCardTemplate) => !!(t.canEdit || t.canDelete || t.canSetDefault);

/** The template's default tags with `tag` switched on or off (PATCH defaultFor; admin only on the server). */
export const toggledDefaults = (t: OrgCardTemplate, tag: OrgTemplateTag): OrgTemplateTag[] =>
  t.defaultFor.includes(tag) ? t.defaultFor.filter((x) => x !== tag) : [...t.defaultFor, tag];

interface DeleteDialogProps {
  template: OrgCardTemplate;
  open: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** "Delete X?": the confirm step before a template goes for everyone (admin only on the server). */
export function DeleteTemplateDialog({ template: t, open, busy, error, onCancel, onConfirm }: DeleteDialogProps) {
  return (
    <Dialog open={open} onClose={() => !busy && onCancel()} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
      <DialogTitle sx={{ fontSize: "1rem", fontWeight: 700 }}>Delete {t.label}?</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
          It goes for everyone on the desk. Cards already posted keep their image; drafts on it move to the default design when opened.
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 1.5, fontSize: "0.8125rem" }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} disabled={busy} sx={{ color: "text.secondary" }}>Keep it</Button>
        <Button variant="contained" color="error" disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <Trash2 size={15} />} onClick={onConfirm}>
          {busy ? "Deleting" : "Delete template"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface TemplateOptionsProps {
  template: OrgCardTemplate;
  /** Loads the list again after a change */
  onChanged: () => Promise<unknown>;
  /** The template was deleted */
  onDeleted?: (slug: string) => void;
  disabled?: boolean;
  /** Only Rename and Edit text area (where defaults and delete are shown as their own buttons) */
  editOnly?: boolean;
}

/** The "⋮" on a thumbnail: rename, move the text area, defaults, delete; each only when allowed. */
export function TemplateOptions({ template: t, onChanged, onDeleted, disabled, editOnly }: TemplateOptionsProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<null | "rename" | "area" | "delete">(null);
  const [label, setLabel] = useState(t.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (editOnly ? !t.canEdit : !hasTemplateOptions(t)) return null;

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
      setDialog(null);
      after?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleDefault = (tag: OrgTemplateTag) => {
    setAnchor(null);
    void run(() => socia.updateOrgCardTemplate(t.slug, { defaultFor: toggledDefaults(t, tag) }));
  };

  const name = label.trim();
  return (
    <>
      <IconButton
        size="small"
        aria-label={`Options for ${t.label}`}
        aria-haspopup="menu"
        disabled={disabled || busy}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
        sx={{ width: 30, height: 30, color: "#fff", backgroundColor: "rgba(0,0,0,0.62)", "&:hover": { backgroundColor: "rgba(0,0,0,0.8)" }, "&:focus-visible": { outline: `2px solid ${SELECT_BLUE}`, outlineOffset: 1 } }}
      >
        {busy ? <CircularProgress size={13} sx={{ color: "#fff" }} /> : <MoreVertical size={15} />}
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ list: { dense: true, "aria-label": `${t.label} options` } }}>
        {t.canEdit && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setLabel(t.label);
              setError(null);
              setDialog("rename");
            }}
          >
            <ListItemIcon><Pencil size={15} /></ListItemIcon>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
        )}
        {t.canEdit && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setError(null);
              setDialog("area");
            }}
          >
            <ListItemIcon><Scan size={15} /></ListItemIcon>
            <ListItemText>Edit text area</ListItemText>
          </MenuItem>
        )}
        {t.canSetDefault &&
          !editOnly &&
          TAG_DEFAULTS.map(({ tag, label: text }) => {
            const on = t.defaultFor.includes(tag);
            return (
              <MenuItem key={tag} onClick={() => toggleDefault(tag)} role="menuitemcheckbox" aria-checked={on}>
                <ListItemIcon>{on ? <Check size={15} /> : <Star size={15} />}</ListItemIcon>
                <ListItemText>{text}</ListItemText>
              </MenuItem>
            );
          })}
        {t.canDelete && !editOnly && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setError(null);
              setDialog("delete");
            }}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon sx={{ color: "inherit" }}><Trash2 size={15} /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {error && !dialog && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ position: "absolute", right: 0, top: "100%", width: 220, zIndex: 2, mt: 0.5, py: 0, fontSize: "0.75rem" }}>
          {error}
        </Alert>
      )}

      <Dialog open={dialog === "rename"} onClose={() => !busy && setDialog(null)} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
        <DialogTitle sx={{ fontSize: "1rem", fontWeight: 700 }}>Rename template</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Name"
            value={label}
            onChange={(e) => setLabel(e.target.value.slice(0, LABEL_MAX))}
            helperText={`${name.length} / ${LABEL_MAX}`}
            fullWidth
            size="small"
            sx={{ mt: 1 }}
            slotProps={{ htmlInput: { maxLength: LABEL_MAX, lang: "hi" } }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name && name !== t.label) void run(() => socia.updateOrgCardTemplate(t.slug, { label: name }));
            }}
          />
          {error && <Alert severity="error" sx={{ mt: 1.5, fontSize: "0.8125rem" }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(null)} disabled={busy} sx={{ color: "text.secondary" }}>Cancel</Button>
          <Button variant="contained" disabled={busy || !name || name === t.label} onClick={() => void run(() => socia.updateOrgCardTemplate(t.slug, { label: name }))}>
            {busy ? "Saving" : "Save name"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === "area"} onClose={() => !busy && setDialog(null)} fullWidth maxWidth="md" slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
        <DialogTitle sx={{ fontSize: "1rem", fontWeight: 700, pb: 1 }}>Text area on {t.label}</DialogTitle>
        {dialog === "area" && (
          <TextAreaEditor
            template={t}
            intro="New cards on this design start from these places. Cards already designed keep where their words are."
            saveLabel="Save text area"
            cancelLabel="Cancel"
            onCancel={() => setDialog(null)}
            onSaved={() => void run(async () => undefined)}
          />
        )}
      </Dialog>

      <DeleteTemplateDialog
        template={t}
        open={dialog === "delete"}
        busy={busy}
        error={error}
        onCancel={() => setDialog(null)}
        onConfirm={() => void run(() => socia.deleteOrgCardTemplate(t.slug), () => onDeleted?.(t.slug))}
      />
    </>
  );
}
