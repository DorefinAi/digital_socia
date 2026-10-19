"use client";

import React from "react";
import { Box, Typography, Slider, Select, MenuItem, ListSubheader, Switch, Tooltip, Button, IconButton } from "@mui/material";
import { AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, Italic, RotateCcw, Underline } from "lucide-react";
import { CardTextStyle, TextAlign } from "@/types/newsroom";
import { TEMPLATE_FONTS, fontById, nearestWeight, FontGroup } from "./templateFonts";
import { BIG_BREAKING_YELLOW, BREAKING_RED, ResolvedStyle } from "./cardRender";
import { sectionLabel } from "./composerParts";

const SELECT_BLUE = "#2F7BFF";

export const TEXT_COLORS = ["#FFFFFF", "#111111", BIG_BREAKING_YELLOW, BREAKING_RED, "#1D9BF0", "#22C55E", "#F97316"];
const BOX_COLORS = ["#08080A", "#FFFFFF", BREAKING_RED, BIG_BREAKING_YELLOW, "#1E3A8A"];
const WEIGHT_NAMES: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };
const GROUPS: FontGroup[] = ["Sans", "Condensed", "Serif", "Display", "Handwritten"];

const labelSx = { ...sectionLabel, mt: 2, mb: 0.75 };
const rowSx = { display: "flex", alignItems: "center", gap: 1 };

/** Round colour chips plus the system colour picker. */
export function Swatches({ value, onChange, colors, name, auto }: { value: string; onChange: (color: string) => void; colors: readonly string[]; name: string; auto?: { active: boolean; onPick: () => void } }) {
  const ring = (on: boolean) => ({ outline: on ? `2px solid ${SELECT_BLUE}` : "none", outlineOffset: 2 });
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
      {auto && (
        <Tooltip title="Template colour">
          <Box component="button" aria-label={`${name}: template default`} aria-pressed={auto.active} onClick={auto.onPick} sx={{ width: 28, height: 28, borderRadius: "50%", cursor: "pointer", border: "1px solid", borderColor: "divider", backgroundColor: "background.paper", color: "text.primary", fontFamily: "inherit", fontSize: "0.625rem", fontWeight: 800, ...ring(auto.active) }}>
            A
          </Box>
        </Tooltip>
      )}
      {colors.map((c) => (
        <Box key={c} component="button" aria-label={`${name} ${c}`} aria-pressed={!auto?.active && value.toLowerCase() === c.toLowerCase()} onClick={() => onChange(c)} sx={{ width: 28, height: 28, borderRadius: "50%", cursor: "pointer", backgroundColor: c, border: "1px solid", borderColor: "divider", ...ring(!auto?.active && value.toLowerCase() === c.toLowerCase()) }} />
      ))}
      <Tooltip title="Any colour">
        <Box
          component="input"
          type="color"
          aria-label={`${name}: any colour`}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          sx={{ width: 28, height: 28, p: 0, border: "1px solid", borderColor: "divider", borderRadius: "50%", overflow: "hidden", backgroundColor: "transparent", cursor: "pointer", "&::-webkit-color-swatch-wrapper": { p: 0 }, "&::-webkit-color-swatch": { border: 0, borderRadius: "50%" } }}
        />
      </Tooltip>
    </Box>
  );
}

function LabeledSlider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{label}</Typography>
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{format(value)}</Typography>
      </Box>
      <Slider size="small" min={min} max={max} step={step} value={value} onChange={(_, v) => onChange(v as number)} aria-label={label} sx={{ color: "text.primary", py: 1 }} />
    </Box>
  );
}

const toggleSx = (on: boolean) => ({ width: 36, height: 36, borderRadius: "8px", border: "1px solid", borderColor: on ? "text.primary" : "divider", color: "text.primary", backgroundColor: on ? "action.selected" : "transparent" });

export const ALIGN_ICONS: Record<TextAlign, React.ReactNode> = { left: <AlignLeft size={15} />, center: <AlignCenter size={15} />, right: <AlignRight size={15} /> };

export function FontSelect({ value, onChange, compact }: { value: string; onChange: (id: string) => void; compact?: boolean }) {
  const current = fontById(value);
  return (
    <Select
      size="small"
      value={current.id}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{ "aria-label": "Font" }}
      renderValue={() => <span style={{ fontFamily: current.family }}>{current.label}</span>}
      MenuProps={{ slotProps: { paper: { sx: { maxHeight: 420 } } } }}
      sx={{ width: compact ? 132 : "100%", borderRadius: "8px", fontSize: "0.8125rem", "& .MuiSelect-select": { py: compact ? 0.6 : 1 } }}
    >
      {GROUPS.flatMap((group) => [
        <ListSubheader key={group} sx={{ lineHeight: "30px", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {group}
        </ListSubheader>,
        ...TEMPLATE_FONTS.filter((f) => f.group === group).map((f) => (
          <MenuItem key={f.id} value={f.id} sx={{ fontFamily: f.family, fontSize: "1rem", display: "flex", justifyContent: "space-between", gap: 2 }}>
            <span>{f.label}</span>
            <span style={{ opacity: 0.6 }}>समाचार</span>
          </MenuItem>
        )),
      ])}
    </Select>
  );
}

interface TextControlsProps {
  style: ResolvedStyle;
  onChange: (patch: Partial<CardTextStyle>) => void;
  size: { value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void };
  /** Headline only: its colour can follow the template */
  autoColor?: { active: boolean; onPick: () => void };
  onReset: () => void;
}

/** Canva-style text settings for the headline or a text box. */
export default function TextControls({ style: s, onChange, size, autoColor, onReset }: TextControlsProps) {
  const font = fontById(s.font);
  const weight = nearestWeight(font, s.weight);
  const bold = weight >= 700;

  return (
    <Box>
      <Typography sx={labelSx}>Font</Typography>
      <FontSelect value={s.font} onChange={(id) => onChange({ font: id, weight: nearestWeight(fontById(id), s.weight) })} />
      <Box sx={{ ...rowSx, mt: 1 }}>
        <Select size="small" value={weight} onChange={(e) => onChange({ weight: Number(e.target.value) })} inputProps={{ "aria-label": "Weight" }} sx={{ flex: 1, borderRadius: "8px", fontSize: "0.8125rem" }}>
          {font.weights.map((w) => (
            <MenuItem key={w} value={w} sx={{ fontSize: "0.8125rem" }}>
              {WEIGHT_NAMES[w] ?? w}
            </MenuItem>
          ))}
        </Select>
      </Box>
      <LabeledSlider label="Size" {...size} />

      <Typography sx={labelSx}>Style</Typography>
      <Box sx={{ ...rowSx, flexWrap: "wrap", gap: 0.75 }}>
        <Tooltip title="Bold">
          <IconButton aria-label="Bold" aria-pressed={bold} onClick={() => onChange({ weight: nearestWeight(font, bold ? 400 : 700) })} sx={toggleSx(bold)}>
            <Bold size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Italic">
          <IconButton aria-label="Italic" aria-pressed={s.italic} onClick={() => onChange({ italic: !s.italic })} sx={toggleSx(s.italic)}>
            <Italic size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Underline">
          <IconButton aria-label="Underline" aria-pressed={s.underline} onClick={() => onChange({ underline: !s.underline })} sx={toggleSx(s.underline)}>
            <Underline size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Capitals (English letters)">
          <IconButton aria-label="Capitals" aria-pressed={s.uppercase} onClick={() => onChange({ uppercase: !s.uppercase })} sx={toggleSx(s.uppercase)}>
            <CaseUpper size={16} />
          </IconButton>
        </Tooltip>
        <Box sx={{ width: "1px", height: 24, backgroundColor: "divider", mx: 0.25 }} />
        {(["left", "center", "right"] as const).map((a) => (
          <Tooltip key={a} title={`Align ${a}`}>
            <IconButton aria-label={`Align ${a}`} aria-pressed={s.align === a} onClick={() => onChange({ align: a })} sx={toggleSx(s.align === a)}>
              {ALIGN_ICONS[a]}
            </IconButton>
          </Tooltip>
        ))}
      </Box>

      <Typography sx={labelSx}>Colour</Typography>
      <Swatches name="Text colour" value={s.color} onChange={(color) => onChange({ color })} colors={TEXT_COLORS} auto={autoColor} />

      <Typography sx={labelSx}>Highlight colour</Typography>
      <Swatches name="Highlight colour" value={s.highlight} onChange={(highlight) => onChange({ highlight })} colors={TEXT_COLORS} />
      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.5 }}>Words inside **double asterisks** take this colour.</Typography>

      <Typography sx={labelSx}>Spacing</Typography>
      <LabeledSlider label="Letter spacing" value={s.letterSpacing} min={-0.05} max={0.3} step={0.01} format={(v) => `${Math.round(v * 100)}`} onChange={(letterSpacing) => onChange({ letterSpacing })} />
      <LabeledSlider label="Line spacing" value={s.lineHeight} min={0.9} max={2.2} step={0.02} format={(v) => v.toFixed(2)} onChange={(lineHeight) => onChange({ lineHeight })} />

      <Typography sx={labelSx}>Effects</Typography>
      <LabeledSlider label="Shadow" value={s.shadow} min={0} max={1} step={0.05} format={(v) => (v ? `${Math.round(v * 100)}` : "Off")} onChange={(shadow) => onChange({ shadow })} />
      {s.shadow > 0 && <Swatches name="Shadow colour" value={s.shadowColor} onChange={(shadowColor) => onChange({ shadowColor })} colors={["#000000", "#FFFFFF", BREAKING_RED]} />}
      <LabeledSlider label="Outline" value={s.strokeWidth} min={0} max={14} step={0.5} format={(v) => (v ? `${v}px` : "Off")} onChange={(strokeWidth) => onChange({ strokeWidth })} />
      {s.strokeWidth > 0 && <Swatches name="Outline colour" value={s.strokeColor} onChange={(strokeColor) => onChange({ strokeColor })} colors={["#000000", "#FFFFFF", BREAKING_RED, BIG_BREAKING_YELLOW]} />}

      <Box sx={{ ...rowSx, justifyContent: "space-between", mt: 1.5 }}>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Background box</Typography>
        <Switch size="small" checked={s.box} onChange={(e) => onChange({ box: e.target.checked })} slotProps={{ input: { "aria-label": "Background box" } }} />
      </Box>
      {s.box && (
        <Box sx={{ pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
          <Swatches name="Box colour" value={s.boxColor} onChange={(boxColor) => onChange({ boxColor })} colors={BOX_COLORS} />
          <LabeledSlider label="Box transparency" value={1 - s.boxOpacity} min={0} max={0.9} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange({ boxOpacity: +(1 - v).toFixed(2) })} />
          <LabeledSlider label="Rounded corners" value={s.boxRadius} min={0} max={60} step={1} format={(v) => `${v}`} onChange={(boxRadius) => onChange({ boxRadius })} />
        </Box>
      )}

      <Typography sx={labelSx}>Arrange</Typography>
      <LabeledSlider label="Transparency" value={1 - s.opacity} min={0} max={0.9} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => onChange({ opacity: +(1 - v).toFixed(2) })} />
      <LabeledSlider label="Rotate" value={s.rotation} min={-30} max={30} step={1} format={(v) => `${v}°`} onChange={(rotation) => onChange({ rotation })} />

      <Button size="small" onClick={onReset} startIcon={<RotateCcw size={13} />} sx={{ mt: 1.5, px: 0.5, color: "text.secondary", fontSize: "0.75rem" }}>
        Reset text style
      </Button>
    </Box>
  );
}
