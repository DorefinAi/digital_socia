"use client";

// Small, dense controls shared by the inspector and the bins. Every control has a visible or accessible label.

import React, { useId, useState } from "react";
import { Box, ButtonBase, Slider, Typography } from "@mui/material";
import { ChevronDown } from "lucide-react";
import { S } from "./studioTheme";

export function Section({ title, children, defaultOpen = true, action }: { title: string; children: React.ReactNode; defaultOpen?: boolean; action?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <Box component="section" sx={{ borderBottom: `1px solid ${S.line}` }}>
      <Box sx={{ display: "flex", alignItems: "center", pr: 1 }}>
        <ButtonBase
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={id}
          sx={{ flex: 1, justifyContent: "space-between", px: 1.75, py: 1.1, fontSize: 13, fontWeight: 600, color: S.text, "&:focus-visible": { outline: `2px solid ${S.accent}`, outlineOffset: -2 } }}
        >
          {title}
          <ChevronDown size={16} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s", color: S.muted }} />
        </ButtonBase>
        {action}
      </Box>
      {open && (
        <Box id={id} sx={{ px: 1.75, pb: 1.5, display: "grid", gap: 1.25 }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

export function FieldLabel({ children, htmlFor, value }: { children: React.ReactNode; htmlFor?: string; value?: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
      <Typography component="label" htmlFor={htmlFor} sx={{ fontSize: 12, color: S.muted }}>
        {children}
      </Typography>
      {value !== undefined && <Typography sx={{ fontSize: 12, color: S.text, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>}
    </Box>
  );
}

export function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  /** Double-click the label value resets to this */
  reset?: number;
  disabled?: boolean;
}) {
  const { label, value, min, max, step, format = (v) => String(v), onChange, reset, disabled } = props;
  return (
    <Box>
      <Box onDoubleClick={reset !== undefined ? () => onChange(reset) : undefined} title={reset !== undefined ? "Double-click to reset" : undefined}>
        <FieldLabel value={format(value)}>{label}</FieldLabel>
      </Box>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(_, v) => onChange(v as number)}
        aria-label={label}
        getAriaValueText={format}
        sx={{ py: 0.75, color: S.accent, "& .MuiSlider-rail": { color: S.line, opacity: 1 } }}
      />
    </Box>
  );
}

/** A number box that commits on blur / Enter, so typing "1." does not fight the model */
export function NumberField({ label, value, onChange, step = 0.1, min, max, suffix, digits = 2 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; digits?: number }) {
  const id = useId();
  const shown = Number(value.toFixed(digits)).toString();
  const [text, setText] = useState(shown);
  // A new value from outside (undo, a drag on the preview) replaces what is in the box
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    setText(shown);
  }
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n)) return setText(shown);
    const v = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (v !== value) onChange(v);
    setText(Number(v.toFixed(digits)).toString());
  };
  return (
    <Box sx={{ display: "grid", gap: 0.4, minWidth: 0 }}>
      <Typography component="label" htmlFor={id} sx={{ fontSize: 11.5, color: S.muted }}>
        {label}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", bgcolor: S.raised, borderRadius: 1, border: `1px solid ${S.line}`, "&:focus-within": { borderColor: S.accent } }}>
        <Box
          component="input"
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && commit()}
          sx={{ width: "100%", minWidth: 0, bgcolor: "transparent", border: 0, outline: 0, color: S.text, font: "inherit", fontSize: 12.5, px: 0.9, py: 0.6, fontVariantNumeric: "tabular-nums" }}
        />
        {suffix && <Typography sx={{ fontSize: 11.5, color: S.faint, pr: 0.9 }}>{suffix}</Typography>}
      </Box>
    </Box>
  );
}

// ── Colours: hex for the picker, plus an opacity for backgrounds stored as rgba() ──

export function parseColor(c: string): { hex: string; alpha: number } {
  const rgba = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(c);
  if (rgba) {
    const hex = "#" + [rgba[1], rgba[2], rgba[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
    return { hex, alpha: rgba[4] !== undefined ? Number(rgba[4]) : 1 };
  }
  if (/^#[0-9a-f]{3}$/i.test(c)) return { hex: "#" + [...c.slice(1)].map((x) => x + x).join(""), alpha: 1 };
  if (/^#[0-9a-f]{6}$/i.test(c)) return { hex: c, alpha: 1 };
  return { hex: "#000000", alpha: 1 };
}

export function toColor(hex: string, alpha: number): string {
  if (alpha >= 1) return hex.toUpperCase();
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Number(alpha.toFixed(2))})`;
}

export function ColorField({ label, value, onChange, withAlpha = false }: { label: string; value: string; onChange: (v: string) => void; withAlpha?: boolean }) {
  const id = useId();
  const { hex, alpha } = parseColor(value);
  return (
    <Box sx={{ display: "grid", gap: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          component="input"
          id={id}
          type="color"
          value={hex}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(toColor(e.target.value, alpha))}
          sx={{ width: 30, height: 26, p: 0, border: `1px solid ${S.line}`, borderRadius: 1, bgcolor: "transparent", cursor: "pointer", "&:focus-visible": { outline: `2px solid ${S.accent}` } }}
        />
        <Typography component="label" htmlFor={id} sx={{ fontSize: 12, color: S.muted, flex: 1 }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: S.faint, fontVariantNumeric: "tabular-nums" }}>{hex.toUpperCase()}</Typography>
      </Box>
      {withAlpha && (
        <Slider
          value={Math.round(alpha * 100)}
          min={0}
          max={100}
          onChange={(_, v) => onChange(toColor(hex, (v as number) / 100))}
          aria-label={`${label} opacity`}
          getAriaValueText={(v) => `${v}%`}
          sx={{ py: 0.5, color: S.accent, "& .MuiSlider-rail": { color: S.line, opacity: 1 } }}
        />
      )}
    </Box>
  );
}

/** A row of mutually exclusive small buttons (fit/fill, align, weight, speed presets) */
export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <Box role="radiogroup" aria-label={label} sx={{ display: "flex", bgcolor: S.raised, borderRadius: 1, p: 0.25, gap: 0.25 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <ButtonBase
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            sx={{
              flex: 1,
              minHeight: 28,
              px: 0.75,
              borderRadius: 0.75,
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              color: on ? S.onAccent : S.muted,
              bgcolor: on ? S.accent : "transparent",
              "&:hover": { color: on ? S.onAccent : S.text },
              "&:focus-visible": { outline: `2px solid ${S.accent}`, outlineOffset: 1 },
            }}
          >
            {o.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
