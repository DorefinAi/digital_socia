"use client";

import React, { useState } from "react";
import { Box, Button, ButtonBase, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { ArrowLeft, ChevronDown, Redo2, RotateCcw, Undo2, Upload } from "lucide-react";
import { ASPECTS, type Aspect } from "../model";
import type { SaveState } from "./autosave";
import { S } from "./studioTheme";

const ORDER: Aspect[] = ["16:9", "9:16", "1:1", "4:5"];

/** A small outline of the frame's shape, so the choice reads at a glance */
function AspectGlyph({ aspect, size = 16 }: { aspect: Aspect; size?: number }) {
  const { width, height } = ASPECTS[aspect];
  const k = size / Math.max(width, height);
  return <Box aria-hidden sx={{ width: Math.round(width * k), height: Math.round(height * k), border: `1.5px solid currentColor`, borderRadius: "2px", flexShrink: 0 }} />;
}

function saveText(s: SaveState): string {
  if (s.kind === "failed") return "Not saved: this browser's storage is full or blocked";
  if (s.kind === "saved") return `Saved in this browser at ${s.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return "Changes save in this browser";
}

export interface TopBarProps {
  title: string;
  aspect: Aspect;
  onAspect: (a: Aspect) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  save: SaveState;
  onStartOver: () => void;
  onExport: () => void;
  exportDisabled: boolean;
  /** Why Export is off, shown as its tooltip (e.g. no video.export permission) */
  exportNote?: string;
  onClose?: () => void;
}

export default function TopBar(p: TopBarProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box component="header" sx={{ height: 52, display: "flex", alignItems: "center", gap: 1.5, px: 1.25, bgcolor: S.chrome, borderBottom: `1px solid ${S.line}` }}>
      {p.onClose && (
        <Tooltip title="Back to the post">
          <IconButton aria-label="Close the studio" onClick={p.onClose} size="small">
            <ArrowLeft size={18} />
          </IconButton>
        </Tooltip>
      )}
      <Box sx={{ minWidth: 0, flex: "1 1 0" }}>
        <Typography noWrap sx={{ fontSize: 14, fontWeight: 700 }} title={p.title}>
          {p.title}
        </Typography>
        <Typography noWrap role="status" sx={{ fontSize: 11.5, color: p.save.kind === "failed" ? S.danger : S.faint }}>
          {saveText(p.save)}
        </Typography>
      </Box>

      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-label={`Frame: ${p.aspect}, ${ASPECTS[p.aspect].label}. Change`}
        sx={{ gap: 1, px: 1.25, height: 34, borderRadius: 1, bgcolor: S.raised, color: S.text, fontSize: 13, fontWeight: 600, "&:hover": { bgcolor: S.hover }, "&:focus-visible": { outline: `2px solid ${S.accent}` } }}
      >
        <AspectGlyph aspect={p.aspect} />
        {p.aspect}
        <Box component="span" sx={{ color: S.muted, fontWeight: 400, display: { xs: "none", xl: "inline" } }}>
          {ASPECTS[p.aspect].label}
        </Box>
        <ChevronDown size={15} color={S.muted} />
      </ButtonBase>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { bgcolor: S.raised, minWidth: 260 } } }}>
        {ORDER.map((a) => (
          <MenuItem
            key={a}
            selected={a === p.aspect}
            onClick={() => {
              p.onAspect(a);
              setAnchor(null);
            }}
            sx={{ gap: 1.5, py: 1 }}
          >
            <Box sx={{ width: 22, display: "grid", placeItems: "center", color: a === p.aspect ? S.accent : S.muted }}>
              <AspectGlyph aspect={a} size={20} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{a}</Typography>
              <Typography sx={{ fontSize: 12, color: S.muted }}>{ASPECTS[a].label}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>

      <Box sx={{ flex: "1 1 0", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 0.5 }}>
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton aria-label="Undo" disabled={!p.canUndo} onClick={p.onUndo} size="small">
              <Undo2 size={18} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Shift+Z)">
          <span>
            <IconButton aria-label="Redo" disabled={!p.canRedo} onClick={p.onRedo} size="small">
              <Redo2 size={18} />
            </IconButton>
          </span>
        </Tooltip>
        <Button color="inherit" size="small" startIcon={<RotateCcw size={15} />} onClick={p.onStartOver} sx={{ color: S.muted, mx: 0.5 }}>
          Start over
        </Button>
        <Tooltip title={p.exportNote ?? ""}>
          <span>
            <Button variant="contained" startIcon={<Upload size={16} />} onClick={p.onExport} disabled={p.exportDisabled} sx={{ px: 2.25, height: 34 }}>
              Export
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
