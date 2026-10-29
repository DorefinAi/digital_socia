"use client";

// Captions: one line at a time on the caption track, typed here or brought in from an .srt, sent out as .srt.
// One shared style for all of them (Project.captionStyle).

import React, { useRef, useState } from "react";
import { Box, Button, ButtonBase, TextField, Typography } from "@mui/material";
import { Download, Plus, Upload } from "lucide-react";
import { newId, type CaptionClip } from "../model";
import { captionsToCues, cuesToCaptions, parseSrt, toSrt } from "../srt";
import { hasRoom, type StudioApi } from "./studioApi";
import { useStudio } from "../store";
import { Section, SliderField } from "./fields";
import { TextStyleFields } from "./Inspector";
import { S, timecode } from "./studioTheme";

const CAPTION_SECONDS = 3;
const selectPlayhead = (s: { playhead: number }) => s.playhead;

export default function CaptionsBin({ api }: { api: StudioApi }) {
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const playhead = useStudio(selectPlayhead);
  const track = api.project.tracks.find((t) => t.kind === "caption");
  const captions = (track?.clips ?? []) as CaptionClip[];

  const addAtPlayhead = () => {
    const start = api.getPlayhead();
    if (track && !hasRoom(track, start, 0.5)) {
      setNote("There is already a caption at the playhead. Move the playhead to a gap first.");
      return;
    }
    // Stop short of the next caption
    const next = captions.find((c) => c.start > start);
    const duration = Math.max(0.5, Math.min(CAPTION_SECONDS, next ? next.start - start : CAPTION_SECONDS));
    setNote(null);
    api.addClip("caption", { id: newId("cap"), type: "caption", start, duration, fadeIn: 0, fadeOut: 0, text: "" });
  };

  const importSrt = async (f: File) => {
    try {
      const { cues, skipped } = parseSrt(await f.text());
      if (!cues.length) {
        setNote(`No captions found in ${f.name}. Check that it is an .srt file.`);
        return;
      }
      if (captions.length && !window.confirm(`Replace the ${captions.length} captions on the timeline with ${cues.length} from ${f.name}?`)) return;
      api.replaceCaptions(cuesToCaptions(cues));
      setNote(`Imported ${cues.length} captions${skipped ? `; ${skipped} unreadable ${skipped === 1 ? "block was" : "blocks were"} skipped` : ""}.`);
    } catch {
      setNote(`Could not read ${f.name}.`);
    }
  };

  const exportSrt = () => {
    const blob = new Blob([toSrt(captionsToCues(captions))], { type: "application/x-subrip;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captions.srt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Box sx={{ display: "grid", gap: 1.25 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
        <Button size="small" variant="outlined" color="inherit" startIcon={<Upload size={14} />} onClick={() => file.current?.click()} sx={{ borderColor: S.line, color: S.text }}>
          Import .srt
        </Button>
        <Button size="small" variant="outlined" color="inherit" startIcon={<Download size={14} />} disabled={!captions.length} onClick={exportSrt} sx={{ borderColor: S.line, color: S.text }}>
          Export .srt
        </Button>
      </Box>
      <input
        ref={file}
        type="file"
        accept=".srt,application/x-subrip,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importSrt(f);
        }}
      />
      <Button size="small" variant="contained" startIcon={<Plus size={15} />} onClick={addAtPlayhead}>
        Add a caption at {timecode(playhead)}
      </Button>
      {note && (
        <Typography role="status" sx={{ fontSize: 12, color: S.muted }}>
          {note}
        </Typography>
      )}

      {captions.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: S.muted, py: 1 }}>No captions yet. Add one at the playhead or import an .srt file.</Typography>
      ) : (
        <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.75 }}>
          {captions.map((c) => {
            const on = c.id === api.selectedClipId;
            return (
              <Box component="li" key={c.id} sx={{ borderRadius: 1, p: 0.75, bgcolor: on ? S.raised : "transparent", border: `1px solid ${on ? S.accent : S.line}` }}>
                <ButtonBase
                  onClick={() => {
                    api.seek(c.start);
                    api.select(c.id);
                  }}
                  sx={{ fontSize: 11.5, color: S.muted, fontVariantNumeric: "tabular-nums", mb: 0.5, borderRadius: 0.5, "&:hover": { color: S.text } }}
                >
                  {timecode(c.start)} – {timecode(c.start + c.duration)}
                </ButtonBase>
                <TextField
                  fullWidth
                  multiline
                  maxRows={3}
                  placeholder="Type the caption"
                  value={c.text}
                  onFocus={() => api.select(c.id)}
                  onChange={(e) => api.updateClip(c.id, { text: e.target.value }, "text")}
                  slotProps={{ htmlInput: { "aria-label": `Caption at ${timecode(c.start)}` } }}
                  sx={{ "& .MuiInputBase-root": { fontSize: 13, py: 0.5 } }}
                />
              </Box>
            );
          })}
        </Box>
      )}

      <Box sx={{ mx: -1.75, mt: 1, borderTop: `1px solid ${S.line}` }}>
        <Section title="Caption style" defaultOpen={false}>
          <TextStyleFields style={api.project.captionStyle} onChange={(patch, key) => api.setCaptionStyle(patch, key)} />
          <SliderField
            label="Distance from the bottom"
            value={api.project.captionStyle.bottom}
            min={0}
            max={0.5}
            step={0.005}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(bottom) => api.setCaptionStyle({ bottom }, "bottom")}
          />
        </Section>
      </Box>
    </Box>
  );
}
