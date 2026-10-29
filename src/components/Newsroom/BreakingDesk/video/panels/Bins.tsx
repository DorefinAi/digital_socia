"use client";

// Left column: a rail of bins (Your media, Text, Captions, Transitions, Audio) and the open bin's contents.

import React, { useRef } from "react";
import { Box, Button, ButtonBase, IconButton, Tooltip, Typography } from "@mui/material";
import { ArrowRightLeft, Captions, Film, ImageIcon, Layers, Music, Plus, TriangleAlert, Type, Upload } from "lucide-react";
import type { Asset } from "../model";
import { ASSET_DRAG_TYPE, TEXT_PRESETS, TRANSITIONS } from "./catalog";
import { cssFamily } from "./fonts";
import { findClip, type StudioApi } from "./studioApi";
import { addAssetToTimeline, addTextPreset, type AddMode } from "./timelineOps";
import { TransitionChip } from "./Inspector";
import CaptionsBin from "./CaptionsBin";
import { MUSIC_ACCEPT } from "../audio/importMusic";
import { S, timecode } from "./studioTheme";

export type BinId = "media" | "text" | "captions" | "transitions" | "audio";

export const BINS: { id: BinId; label: string; icon: React.ReactNode }[] = [
  { id: "media", label: "Your media", icon: <Film size={19} /> },
  { id: "text", label: "Text", icon: <Type size={19} /> },
  { id: "captions", label: "Captions", icon: <Captions size={19} /> },
  { id: "transitions", label: "Transitions", icon: <ArrowRightLeft size={19} /> },
  { id: "audio", label: "Audio", icon: <Music size={19} /> },
];


export function BinRail({ active, onChange }: { active: BinId; onChange: (b: BinId) => void }) {
  return (
    <Box component="nav" aria-label="Bins" sx={{ width: 72, flexShrink: 0, bgcolor: S.chrome, borderRight: `1px solid ${S.line}`, display: "flex", flexDirection: "column", gap: 0.5, py: 1 }}>
      {BINS.map((b) => {
        const on = b.id === active;
        return (
          <ButtonBase
            key={b.id}
            onClick={() => onChange(b.id)}
            aria-current={on ? "page" : undefined}
            sx={{
              mx: 0.75,
              py: 1,
              borderRadius: 1.5,
              flexDirection: "column",
              gap: 0.5,
              fontSize: 11,
              lineHeight: 1.2,
              fontWeight: on ? 700 : 500,
              color: on ? S.text : S.muted,
              bgcolor: on ? S.raised : "transparent",
              position: "relative",
              "&::before": on ? { content: '""', position: "absolute", left: -6, top: 10, bottom: 10, width: 3, borderRadius: 2, bgcolor: S.accent } : undefined,
              "&:hover": { color: S.text, bgcolor: on ? S.raised : S.panel },
              "&:focus-visible": { outline: `2px solid ${S.accent}` },
            }}
          >
            {b.icon}
            {b.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

export interface BinProps {
  api: StudioApi;
  bin: BinId;
  onImport: (files: File[]) => void;
  /** Asset ids whose file was imported in an earlier session and must be chosen again */
  missing: Set<string>;
  headline: string;
}

export function BinPanel(props: BinProps) {
  const { bin } = props;
  const title = BINS.find((b) => b.id === bin)!.label;
  return (
    <Box sx={{ width: { xs: 236, xl: 280 }, flexShrink: 0, bgcolor: S.panel, borderRight: `1px solid ${S.line}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700, px: 1.75, pt: 1.5, pb: 1 }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1.75, pb: 2 }}>
        {bin === "media" && <MediaBin {...props} />}
        {bin === "text" && <TextBin api={props.api} headline={props.headline} />}
        {bin === "captions" && <CaptionsBin api={props.api} />}
        {bin === "transitions" && <TransitionsBin api={props.api} />}
        {bin === "audio" && <AudioBin {...props} />}
      </Box>
    </Box>
  );
}

function ImportButton({ label, accept, onImport }: { label: string; accept: string; onImport: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button fullWidth variant="outlined" color="inherit" startIcon={<Upload size={16} />} onClick={() => input.current?.click()} sx={{ borderColor: S.line, borderStyle: "dashed", py: 1.1, color: S.text, "&:hover": { borderColor: S.accent, bgcolor: S.raised } }}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onImport(files);
        }}
      />
    </>
  );
}

function AssetTile({ asset, api, missing, showOverlay = true }: { asset: Asset; api: StudioApi; missing: boolean; showOverlay?: boolean }) {
  const add = (mode: AddMode) => addAssetToTimeline(api, asset, mode);
  return (
    <Box
      draggable={!missing}
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      sx={{ borderRadius: 1.5, overflow: "hidden", bgcolor: S.raised, border: `1px solid ${missing ? S.danger : "transparent"}`, "&:hover .tile-actions, &:focus-within .tile-actions": { opacity: 1 } }}
    >
      <Box sx={{ position: "relative", aspectRatio: "16 / 9", bgcolor: S.stage, display: "grid", placeItems: "center", color: S.faint }}>
        {missing ? (
          <TriangleAlert size={22} color={S.danger} />
        ) : asset.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : asset.kind === "video" ? (
          <video src={`${asset.url}#t=0.5`} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} aria-hidden />
        ) : (
          <Music size={22} />
        )}
        {asset.duration > 0 && (
          <Typography sx={{ position: "absolute", right: 4, bottom: 4, fontSize: 10.5, px: 0.5, borderRadius: 0.5, bgcolor: "rgba(0,0,0,.7)", fontVariantNumeric: "tabular-nums" }}>{timecode(asset.duration)}</Typography>
        )}
        {!missing && (
          <Box className="tile-actions" sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, bgcolor: "rgba(10,12,16,.55)", opacity: 0, transition: "opacity .12s" }}>
            <Tooltip title={asset.kind === "audio" ? "Add at the playhead" : "Add to the end of the video"}>
              <IconButton size="small" aria-label={`Add ${asset.name} to the timeline`} onClick={() => add("main")} sx={{ bgcolor: S.accent, color: S.onAccent, "&:hover": { bgcolor: S.accent } }}>
                <Plus size={16} />
              </IconButton>
            </Tooltip>
            {showOverlay && asset.kind !== "audio" && (
              <Tooltip title="Add over the video at the playhead (picture in picture)">
                <IconButton size="small" aria-label={`Add ${asset.name} as an overlay`} onClick={() => add("overlay")} sx={{ bgcolor: S.text, color: S.stage, "&:hover": { bgcolor: S.text } }}>
                  <Layers size={16} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
      <Box sx={{ px: 0.9, py: 0.6, display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
        {asset.kind === "video" ? <Film size={12} color={S.faint} /> : asset.kind === "image" ? <ImageIcon size={12} color={S.faint} /> : <Music size={12} color={S.faint} />}
        <Typography sx={{ fontSize: 11.5, color: missing ? S.danger : S.muted, minWidth: 0 }} noWrap title={asset.name}>
          {missing ? `Choose again: ${asset.name}` : asset.name}
        </Typography>
      </Box>
    </Box>
  );
}

function MediaBin({ api, onImport, missing }: BinProps) {
  const assets = api.project.assets.filter((a) => a.kind !== "audio");
  const lost = assets.filter((a) => missing.has(a.id));
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <ImportButton label="Import video or photos" accept="video/*,image/*" onImport={onImport} />
      <Typography sx={{ fontSize: 12, color: S.muted }}>Or drop files anywhere on the studio.</Typography>
      {lost.length > 0 && (
        <Typography role="status" sx={{ fontSize: 12, color: S.danger }}>
          {lost.length === 1 ? "1 file" : `${lost.length} files`} from your computer must be imported again after a reload. Import a file with the same name to put it back.
        </Typography>
      )}
      {assets.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: S.muted, py: 2 }}>Nothing here yet. Import footage to start your cut.</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          {assets.map((a) => (
            <AssetTile key={a.id} asset={a} api={api} missing={missing.has(a.id)} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function AudioBin({ api, onImport, missing }: BinProps) {
  const assets = api.project.assets.filter((a) => a.kind === "audio");
  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <ImportButton label="Import music or a voice-over" accept={MUSIC_ACCEPT} onImport={onImport} />
      {assets.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: S.muted, py: 1 }}>Imported sound files appear here. They go on the timeline at the playhead.</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          {assets.map((a) => (
            <AssetTile key={a.id} asset={a} api={api} missing={missing.has(a.id)} showOverlay={false} />
          ))}
        </Box>
      )}
      <Typography sx={{ fontSize: 12, color: S.muted }}>To edit a video&apos;s own sound separately, select the video and choose Detach audio.</Typography>
    </Box>
  );
}

function TextBin({ api, headline }: { api: StudioApi; headline: string }) {
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Typography sx={{ fontSize: 12, color: S.muted }}>Adds at the playhead for 5 seconds.</Typography>
      {TEXT_PRESETS.map((p) => {
        const text = p.id === "lower-third" && headline ? headline : p.sample;
        return (
          <ButtonBase
            key={p.id}
            onClick={() => addTextPreset(api, p, text)}
            aria-label={`Add ${p.label}`}
            sx={{ display: "block", textAlign: "left", borderRadius: 1.5, overflow: "hidden", bgcolor: S.stage, border: `1px solid ${S.line}`, "&:hover": { borderColor: S.accent }, "&:focus-visible": { outline: `2px solid ${S.accent}` } }}
          >
            <Box sx={{ height: 68, display: "flex", alignItems: "center", justifyContent: p.style.align === "left" ? "flex-start" : "center", px: 1.25, backgroundImage: "linear-gradient(135deg, #2b3440, #1a1f27)" }}>
              <Box
                component="span"
                sx={{
                  fontFamily: cssFamily(p.style.font),
                  fontWeight: p.style.weight,
                  fontSize: Math.max(12, Math.min(22, p.style.size / 3.4)),
                  color: p.style.color,
                  bgcolor: p.style.background ?? "transparent",
                  px: p.style.background ? 0.75 : 0,
                  py: p.style.background ? 0.25 : 0,
                  WebkitTextStroke: p.style.outlineColor && p.style.outlineWidth ? `${Math.min(1.5, p.style.outlineWidth / 3)}px ${p.style.outlineColor}` : undefined,
                  paintOrder: "stroke",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {text}
              </Box>
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, px: 1, py: 0.6, color: S.text }}>{p.label}</Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function TransitionsBin({ api }: { api: StudioApi }) {
  const ref = findClip(api.project, api.selectedClipId);
  const usable = ref && (ref.track.kind === "video" || ref.track.kind === "overlay") ? ref : null;
  const hasPrevious = !!usable && usable.track.clips.findIndex((c) => c.id === usable.clip.id) > 0;
  const videoTrack = api.project.tracks.find((t) => t.kind === "video");
  const cuts = videoTrack ? videoTrack.clips.length - 1 : 0;

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Typography sx={{ fontSize: 12.5, color: usable ? S.text : S.muted }}>
        {usable ? "Plays as the selected clip begins." : "Select a clip on a video or overlay track, then pick how it comes in."}
      </Typography>
      <Box role="radiogroup" aria-label="Transition" sx={{ display: "grid", gap: 0.75 }}>
        {TRANSITIONS.map((t) => (
          <TransitionChip
            key={t.type}
            label={t.label}
            on={usable?.clip.transitionIn?.type === t.type}
            disabled={!usable || (t.needsPrevious && !hasPrevious)}
            onClick={() => usable && api.setTransition(usable.clip.id, { type: t.type, duration: usable.clip.transitionIn?.duration ?? 0.5 })}
          />
        ))}
      </Box>
      {usable?.clip.transitionIn && (
        <Button size="small" color="inherit" onClick={() => api.setTransition(usable.clip.id, null)} sx={{ justifySelf: "start", color: S.muted }}>
          Remove transition
        </Button>
      )}
      {cuts > 0 && videoTrack && (
        <Box sx={{ pt: 1.5, borderTop: `1px solid ${S.line}`, display: "grid", gap: 0.75 }}>
          <Typography sx={{ fontSize: 12, color: S.muted }}>
            The Video track has {cuts === 1 ? "1 cut" : `${cuts} cuts`}.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            sx={{ borderColor: S.line, color: S.text }}
            onClick={() => videoTrack.clips.slice(1).forEach((c) => api.setTransition(c.id, { type: "crossfade", duration: c.transitionIn?.duration ?? 0.5 }))}
          >
            Crossfade every cut
          </Button>
        </Box>
      )}
    </Box>
  );
}
