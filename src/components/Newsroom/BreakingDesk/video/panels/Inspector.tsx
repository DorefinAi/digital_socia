"use client";

// Right column: every setting of the selected clip, grouped the way an editor thinks about them. With nothing
// selected it shows the project's own settings. Slider drags pass a coalesce key so one drag is one undo step.

import React, { useState } from "react";
import { Box, Button, ButtonBase, MenuItem, Select, TextField, Typography } from "@mui/material";
import { AlignCenter, AlignLeft, AlignRight, FlipHorizontal2, FlipVertical2, Trash2 } from "lucide-react";
import {
  ASPECTS, DEFAULT_FILTERS, FULL_FRAME, NO_CROP,
  type Aspect,
  type Asset, type AudioClip, type Box as FrameBox, type CaptionClip, type Clip, type MediaClip, type TextClip, type TextStyle, type Track,
} from "../model";
import { findClip, type StudioApi } from "./studioApi";
import { normaliseVolume } from "../audio/peaks";
import { measureTextClip } from "../render/text";
import { ColorField, NumberField, Section, Segmented, SliderField } from "./fields";
import { SPEEDS, TRANSITIONS } from "./catalog";
import { STUDIO_FONTS, cssFamily, fontLabel } from "./fonts";
import { S } from "./studioTheme";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const secs = (v: number) => `${v.toFixed(1)} s`;

export default function Inspector({ api }: { api: StudioApi }) {
  const ref = findClip(api.project, api.selectedClipId);
  return (
    <Box component="aside" aria-label="Inspector" sx={{ height: "100%", overflowY: "auto", bgcolor: S.panel, borderLeft: `1px solid ${S.line}` }}>
      {ref ? <ClipInspector api={api} track={ref.track} clip={ref.clip} /> : <ProjectInspector api={api} />}
    </Box>
  );
}

function Header({ title, sub, onDelete }: { title: string; sub: string; onDelete?: () => void }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.75, py: 1.25, borderBottom: `1px solid ${S.line}` }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }} noWrap>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 12, color: S.muted }} noWrap>
          {sub}
        </Typography>
      </Box>
      {onDelete && (
        <Button size="small" color="inherit" onClick={onDelete} startIcon={<Trash2 size={14} />} sx={{ color: S.muted, "&:hover": { color: S.danger } }}>
          Delete
        </Button>
      )}
    </Box>
  );
}

function ProjectInspector({ api }: { api: StudioApi }) {
  const p = api.project;
  return (
    <>
      <Header title="Project" sub="Select a clip on the timeline to edit it" />
      <Section title="Frame">
        <Segmented label="Frame rate" value={p.fps} options={[25, 30, 60].map((f) => ({ value: f as 25 | 30 | 60, label: `${f} fps` }))} onChange={(fps) => api.setProject({ fps })} />
        <ColorField label="Background behind the footage" value={p.background} onChange={(background) => api.setProject({ background })} />
      </Section>
    </>
  );
}

function ClipInspector({ api, track, clip }: { api: StudioApi; track: Track; clip: Clip }) {
  const set = (patch: Partial<Clip>, key?: string) => api.updateClip(clip.id, patch, key);
  const asset = "assetId" in clip ? api.project.assets.find((a) => a.id === clip.assetId) : undefined;
  const kindLabel = clip.type === "media" ? (asset?.kind === "image" ? "Image" : "Video") : clip.type === "text" ? "Text" : clip.type === "audio" ? "Audio" : "Caption";
  const title = clip.type === "text" || clip.type === "caption" ? clip.text.split("\n")[0] || kindLabel : asset?.name ?? kindLabel;
  const locked = track.locked;

  return (
    <Box key={clip.id} sx={{ opacity: locked ? 0.6 : 1, pointerEvents: locked ? "none" : undefined }}>
      <Header title={title} sub={`${kindLabel} on ${track.name}${locked ? " (locked)" : ""}`} onDelete={locked ? undefined : () => api.removeClip(clip.id)} />
      {clip.type === "text" && <TextSection clip={clip} set={set} aspect={api.project.aspect} />}
      {clip.type === "caption" && <CaptionSection clip={clip} set={set} />}
      <TimingSection clip={clip} set={set} sourceLength={asset?.kind === "image" ? Infinity : asset?.duration || Infinity} />
      {(clip.type === "media" || clip.type === "audio") && asset?.kind !== "image" && <SpeedVolume clip={clip} asset={asset} set={set} silent={clip.type === "media" && clip.audioDetached} onDetach={clip.type === "media" && !clip.audioDetached && asset?.hasAudio !== false ? () => api.detachAudio(clip.id) : undefined} />}
      {clip.type !== "caption" && <FadeSection clip={clip} set={set} />}
      {(clip.type === "media" || clip.type === "text") && <BoxSection box={clip.box} set={(box, key) => set({ box } as Partial<Clip>, key)} />}
      {clip.type === "media" && <MediaLook clip={clip} set={set} />}
      {(track.kind === "video" || track.kind === "overlay") && <TransitionSection api={api} track={track} clip={clip} />}
    </Box>
  );
}

type Setter = (patch: Partial<Clip>, key?: string) => void;

function TimingSection({ clip, set, sourceLength }: { clip: Clip; set: Setter; sourceLength: number }) {
  const hasSource = clip.type === "media" || clip.type === "audio";
  // A media clip cannot run past the end of its file
  const maxDuration = hasSource && Number.isFinite(sourceLength) ? Math.max(0.1, (sourceLength - (clip as MediaClip).in) / (clip as MediaClip).speed) : 3600;
  return (
    <Section title="Timing">
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <NumberField label="Starts at" suffix="s" value={clip.start} min={0} onChange={(start) => set({ start })} />
        <NumberField label="Length" suffix="s" value={clip.duration} min={0.1} max={maxDuration} onChange={(duration) => set({ duration })} />
        {hasSource && Number.isFinite(sourceLength) && (
          <NumberField
            label="From the file at"
            suffix="s"
            value={(clip as MediaClip).in}
            min={0}
            max={Math.max(0, sourceLength - 0.1)}
            onChange={(v) => set({ in: v, duration: Math.min(clip.duration, (sourceLength - v) / (clip as MediaClip).speed) } as Partial<Clip>)}
          />
        )}
      </Box>
    </Section>
  );
}

function SpeedVolume({ clip, asset, set, silent, onDetach }: { clip: MediaClip | AudioClip; asset: Asset | undefined; set: Setter; silent: boolean; onDetach?: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Loudest moment of the part of the file this clip plays, brought to -1 dB
  const normalise = async () => {
    if (!asset) return;
    setBusy(true);
    try {
      const s = await normaliseVolume(asset, { from: clip.in, to: clip.in + clip.duration * clip.speed });
      if (!s) setNote("This clip has no sound to level.");
      else {
        set({ volume: Number(s.volume.toFixed(2)) } as Partial<Clip>);
        setNote(s.limited ? "Very quiet: raised to the 200% limit." : `Volume set to ${pct(s.volume)} (peak ${s.peakDb.toFixed(1)} dB before).`);
      }
    } catch {
      setNote("Could not read this clip's sound.");
    } finally {
      setBusy(false);
    }
  };
  // Speed keeps the same stretch of the file, so the clip's length on the timeline changes with it
  const setSpeed = (speed: number) => set({ speed, duration: (clip.duration * clip.speed) / speed } as Partial<Clip>);
  return (
    <Section title="Speed and volume">
      <Box>
        <Typography sx={{ fontSize: 12, color: S.muted, mb: 0.5 }}>Speed</Typography>
        <Segmented label="Speed" value={clip.speed} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} onChange={setSpeed} />
      </Box>
      {silent ? (
        <Typography sx={{ fontSize: 12, color: S.muted }}>The sound plays from its own clip on an audio track.</Typography>
      ) : (
        <SliderField label="Volume" value={clip.volume} min={0} max={2} step={0.01} format={pct} reset={1} onChange={(volume) => set({ volume } as Partial<Clip>, "volume")} />
      )}
      {!silent && asset && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Button size="small" variant="outlined" color="inherit" disabled={busy} onClick={() => void normalise()} sx={{ borderColor: S.line, color: S.text }}>
            {busy ? "Measuring" : "Normalise"}
          </Button>
          {note && (
            <Typography role="status" sx={{ fontSize: 12, color: S.muted }}>
              {note}
            </Typography>
          )}
        </Box>
      )}
      {onDetach && (
        <Button size="small" variant="outlined" color="inherit" onClick={onDetach} sx={{ justifySelf: "start", borderColor: S.line, color: S.text }}>
          Detach audio
        </Button>
      )}
    </Section>
  );
}

function FadeSection({ clip, set }: { clip: Clip; set: Setter }) {
  const max = Math.max(0, Math.min(5, clip.duration / 2));
  return (
    <Section title="Fade">
      <SliderField label="Fade in" value={Math.min(clip.fadeIn, max)} min={0} max={max} step={0.05} format={secs} reset={0} onChange={(fadeIn) => set({ fadeIn }, "fadeIn")} />
      <SliderField label="Fade out" value={Math.min(clip.fadeOut, max)} min={0} max={max} step={0.05} format={secs} reset={0} onChange={(fadeOut) => set({ fadeOut }, "fadeOut")} />
    </Section>
  );
}

function BoxSection({ box, set }: { box: FrameBox; set: (box: FrameBox, key?: string) => void }) {
  const at = (k: keyof FrameBox) => (v: number) => set({ ...box, [k]: k === "rotation" ? v : v / 100 }, `box-${k}`);
  return (
    <Section title="Position and size" action={<ResetButton label="Centre" onClick={() => set({ ...box, x: FULL_FRAME.x, y: FULL_FRAME.y, rotation: 0 })} />}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <NumberField label="Centre across" suffix="%" digits={1} step={1} value={box.x * 100} onChange={at("x")} />
        <NumberField label="Centre down" suffix="%" digits={1} step={1} value={box.y * 100} onChange={at("y")} />
        <NumberField label="Width" suffix="%" digits={1} step={1} min={1} max={400} value={box.w * 100} onChange={at("w")} />
        <NumberField label="Height" suffix="%" digits={1} step={1} min={1} max={400} value={box.h * 100} onChange={at("h")} />
      </Box>
      <SliderField label="Rotation" value={box.rotation} min={-180} max={180} step={1} format={(v) => `${v}°`} reset={0} onChange={at("rotation")} />
    </Section>
  );
}

function ResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="small" color="inherit" onClick={onClick} sx={{ color: S.muted, fontSize: 12, minWidth: 0 }}>
      {label}
    </Button>
  );
}

function MediaLook({ clip, set }: { clip: MediaClip; set: Setter }) {
  const crop = (k: keyof MediaClip["crop"]) => (v: number) => set({ crop: { ...clip.crop, [k]: v } } as Partial<Clip>, `crop-${k}`);
  const filter = (k: keyof MediaClip["filters"]) => (v: number) => set({ filters: { ...clip.filters, [k]: v } } as Partial<Clip>, `filter-${k}`);
  const toggle = (on: boolean) => ({ color: on ? S.onAccent : S.muted, bgcolor: on ? S.accent : S.raised });
  return (
    <>
      <Section title="Fit and flip">
        <Segmented
          label="How the picture fills the box"
          value={clip.fit}
          options={[
            { value: "fit", label: "Fit", title: "Show the whole picture, with bars if the shape differs" },
            { value: "fill", label: "Fill", title: "Fill the box, cropping the edges" },
          ]}
          onChange={(fit) => set({ fit } as Partial<Clip>)}
        />
        <Box sx={{ display: "flex", gap: 1 }}>
          <ButtonBase aria-pressed={clip.flipH} onClick={() => set({ flipH: !clip.flipH } as Partial<Clip>)} sx={{ flex: 1, gap: 0.75, py: 0.75, borderRadius: 1, fontSize: 12, fontWeight: 600, ...toggle(clip.flipH) }}>
            <FlipHorizontal2 size={15} /> Flip across
          </ButtonBase>
          <ButtonBase aria-pressed={clip.flipV} onClick={() => set({ flipV: !clip.flipV } as Partial<Clip>)} sx={{ flex: 1, gap: 0.75, py: 0.75, borderRadius: 1, fontSize: 12, fontWeight: 600, ...toggle(clip.flipV) }}>
            <FlipVertical2 size={15} /> Flip down
          </ButtonBase>
        </Box>
      </Section>
      <Section title="Crop" defaultOpen={false} action={<ResetButton label="Reset" onClick={() => set({ crop: { ...NO_CROP } } as Partial<Clip>)} />}>
        {(["left", "right", "top", "bottom"] as const).map((k) => (
          <SliderField key={k} label={`Cut from the ${k}`} value={clip.crop[k]} min={0} max={0.45} step={0.005} format={pct} reset={0} onChange={crop(k)} />
        ))}
      </Section>
      <Section title="Colour" action={<ResetButton label="Reset" onClick={() => set({ filters: { ...DEFAULT_FILTERS } } as Partial<Clip>)} />}>
        <SliderField label="Brightness" value={clip.filters.brightness} min={0} max={2} step={0.01} format={pct} reset={1} onChange={filter("brightness")} />
        <SliderField label="Contrast" value={clip.filters.contrast} min={0} max={2} step={0.01} format={pct} reset={1} onChange={filter("contrast")} />
        <SliderField label="Saturation" value={clip.filters.saturation} min={0} max={2} step={0.01} format={pct} reset={1} onChange={filter("saturation")} />
      </Section>
    </>
  );
}

function TextStyleFields({ style, onChange }: { style: TextStyle; onChange: (patch: Partial<TextStyle>, key?: string) => void }) {
  const font = STUDIO_FONTS.find((f) => f.family === style.font);
  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 1, alignItems: "end" }}>
        <Box sx={{ display: "grid", gap: 0.4, minWidth: 0 }}>
          <Typography id="font-label" sx={{ fontSize: 11.5, color: S.muted }}>
            Font
          </Typography>
          <Select
            size="small"
            value={style.font}
            onChange={(e) => onChange({ font: e.target.value })}
            inputProps={{ "aria-labelledby": "font-label" }}
            renderValue={(v) => <span style={{ fontFamily: cssFamily(v) }}>{fontLabel(v)}</span>}
            MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
            sx={{ fontSize: 13, bgcolor: S.raised }}
          >
            {!font && <MenuItem value={style.font}>{fontLabel(style.font)}</MenuItem>}
            {STUDIO_FONTS.map((f) => (
              <MenuItem key={f.family} value={f.family} sx={{ fontFamily: cssFamily(f.family), fontSize: 15 }}>
                {f.label} · हिंदी
              </MenuItem>
            ))}
          </Select>
        </Box>
        <NumberField label="Size" suffix="px" digits={0} step={2} min={8} max={400} value={style.size} onChange={(size) => onChange({ size })} />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <Segmented label="Weight" value={style.weight} options={[{ value: 400, label: "Regular" }, { value: 700, label: "Bold" }]} onChange={(weight) => onChange({ weight })} />
        <Segmented
          label="Alignment"
          value={style.align}
          options={[
            { value: "left", label: <AlignLeft size={15} aria-label="Left" />, title: "Align left" },
            { value: "center", label: <AlignCenter size={15} aria-label="Centre" />, title: "Centre" },
            { value: "right", label: <AlignRight size={15} aria-label="Right" />, title: "Align right" },
          ]}
          onChange={(align) => onChange({ align })}
        />
      </Box>
      <ColorField label="Text colour" value={style.color} onChange={(color) => onChange({ color }, "color")} />
      <OptionalColor
        label="Outline"
        value={style.outlineColor}
        fallback="#000000"
        onChange={(outlineColor) => onChange({ outlineColor, outlineWidth: outlineColor ? style.outlineWidth || 4 : 0 }, "outline")}
      >
        <SliderField label="Outline width" value={style.outlineWidth} min={0} max={20} step={1} format={(v) => `${v} px`} onChange={(outlineWidth) => onChange({ outlineWidth }, "outlineWidth")} />
      </OptionalColor>
      <OptionalColor label="Background" value={style.background} fallback="rgba(0,0,0,0.7)" withAlpha onChange={(background) => onChange({ background }, "background")} />
    </>
  );
}

function OptionalColor({ label, value, fallback, onChange, withAlpha, children }: { label: string; value: string | null; fallback: string; onChange: (v: string | null) => void; withAlpha?: boolean; children?: React.ReactNode }) {
  return (
    <Box sx={{ display: "grid", gap: 0.75, p: 1, borderRadius: 1, bgcolor: value ? "transparent" : S.chrome, border: `1px solid ${S.line}` }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 12, color: S.muted }}>{label}</Typography>
        <Button size="small" color="inherit" onClick={() => onChange(value ? null : fallback)} sx={{ fontSize: 12, minWidth: 0, color: value ? S.muted : S.accent }}>
          {value ? "Remove" : "Add"}
        </Button>
      </Box>
      {value && (
        <>
          <ColorField label={`${label} colour`} value={value} onChange={onChange} withAlpha={withAlpha} />
          {children}
        </>
      )}
    </Box>
  );
}

/** Shrinks (or grows) the box to the text's measured block, keeping its centre and wrap width */
function fitBoxToText(clip: TextClip, aspect: Aspect): FrameBox | null {
  const { width: W, height: H } = ASPECTS[aspect];
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  const m = measureTextClip(ctx, clip, clip.box.w * W, H);
  if (!(m.width > 0 && m.height > 0)) return null;
  // A hair of room so outlines and descenders are not clipped
  return { ...clip.box, w: Math.min(1, (m.width + 8) / W), h: Math.min(1, (m.height + 8) / H) };
}

function TextSection({ clip, set, aspect }: { clip: TextClip; set: Setter; aspect: Aspect }) {
  return (
    <Section title="Text">
      <TextField
        label="Text"
        multiline
        minRows={2}
        maxRows={6}
        value={clip.text}
        onChange={(e) => set({ text: e.target.value } as Partial<Clip>, "text")}
        slotProps={{ input: { sx: { fontFamily: cssFamily(clip.style.font), fontSize: 15 } } }}
      />
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        onClick={() => {
          const box = fitBoxToText(clip, aspect);
          if (box) set({ box } as Partial<Clip>);
        }}
        sx={{ justifySelf: "start", borderColor: S.line, color: S.text }}
      >
        Fit box to text
      </Button>
      <TextStyleFields style={clip.style} onChange={(patch, key) => set({ style: { ...clip.style, ...patch } } as Partial<Clip>, key && `style-${key}`)} />
    </Section>
  );
}

function CaptionSection({ clip, set }: { clip: CaptionClip; set: Setter }) {
  return (
    <Section title="Caption">
      <TextField label="Caption text" multiline minRows={2} maxRows={5} value={clip.text} onChange={(e) => set({ text: e.target.value } as Partial<Clip>, "text")} />
      <Typography sx={{ fontSize: 12, color: S.muted }}>Every caption shares one look. Change it under Captions on the left.</Typography>
    </Section>
  );
}

function TransitionSection({ api, track, clip }: { api: StudioApi; track: Track; clip: Clip }) {
  const index = track.clips.findIndex((c) => c.id === clip.id);
  const hasPrevious = index > 0;
  const current = clip.transitionIn;
  const duration = current?.duration ?? 0.5;
  return (
    <Section title="Transition in">
      <Box role="radiogroup" aria-label="Transition into this clip" sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
        <TransitionChip label="None" on={!current} onClick={() => api.setTransition(clip.id, null)} />
        {TRANSITIONS.map((t) => (
          <TransitionChip
            key={t.type}
            label={t.label}
            on={current?.type === t.type}
            disabled={t.needsPrevious && !hasPrevious}
            onClick={() => api.setTransition(clip.id, { type: t.type, duration })}
          />
        ))}
      </Box>
      {!hasPrevious && <Typography sx={{ fontSize: 12, color: S.muted }}>Crossfades, slides and wipes need a clip before this one on the same track.</Typography>}
      {current && (
        <SliderField label="Transition length" value={current.duration} min={0.1} max={Math.min(3, clip.duration)} step={0.05} format={secs} onChange={(d) => api.setTransition(clip.id, { ...current, duration: d })} />
      )}
    </Section>
  );
}

export function TransitionChip({ label, on, disabled, onClick }: { label: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      sx={{
        justifyContent: "flex-start",
        px: 1,
        py: 0.8,
        borderRadius: 1,
        fontSize: 12,
        fontWeight: on ? 700 : 500,
        textAlign: "left",
        color: on ? S.onAccent : disabled ? S.faint : S.text,
        bgcolor: on ? S.accent : S.raised,
        "&:hover": { bgcolor: on ? S.accent : S.hover },
        "&:focus-visible": { outline: `2px solid ${S.accent}`, outlineOffset: 1 },
      }}
    >
      {label}
    </ButtonBase>
  );
}

export { TextStyleFields };
