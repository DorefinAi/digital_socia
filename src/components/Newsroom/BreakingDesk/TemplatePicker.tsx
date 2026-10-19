"use client";

import React, { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { BreakingTag, CardLayout, FtpMedia } from "@/types/newsroom";
import TemplateCanvas from "./TemplateCanvas";
import { BIG_BREAKING_YELLOW, BREAKING_RED, CARD_TEMPLATES, CardTemplate, TemplateFormat, tagAccent, templateById, templatePatch } from "./cardRender";
import { Swatches } from "./TextControls";
import { sectionLabel } from "./composerParts";

const SELECT_BLUE = "#2F7BFF";
const ACCENTS = [BREAKING_RED, BIG_BREAKING_YELLOW, "#1E40AF", "#0F766E", "#7C3AED", "#111111"];

interface TemplatePickerProps {
  layout: CardLayout;
  media: FtpMedia;
  format: TemplateFormat;
  tag: BreakingTag;
  handle: string;
  onPick: (template: CardTemplate) => void;
  onAccent: (accent: string | undefined) => void;
}

/** Every template drawn with this story's picture and words, so the choice is made on the real card. */
export default function TemplatePicker({ layout, media, format, tag, handle, onPick, onAccent }: TemplatePickerProps) {
  const current = templateById(layout.template).id;
  // Thumbnails use the still frame: one live video per thumbnail would be heavy
  const still: FtpMedia = media.kind === "image" ? media : { kind: "image", url: media.posterUrl ?? "", fileName: media.fileName };
  const previews = useMemo(() => CARD_TEMPLATES.map((t) => ({ template: t, layout: { ...layout, ...templatePatch(t, format) } })), [layout, format]);

  return (
    <>
      <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700, mb: 0.25 }}>Template</Typography>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 1.5 }}>Picking a template applies its text style. Your words, crop and text boxes stay.</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25 }}>
        {previews.map(({ template, layout: preview }) => {
          const on = template.id === current;
          return (
            <Box
              key={template.id}
              component="button"
              onClick={() => onPick(template)}
              aria-pressed={on}
              aria-label={`${template.label} template: ${template.blurb}`}
              sx={{ p: 0, border: 0, background: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "text.primary", minWidth: 0 }}
            >
              <Box sx={{ borderRadius: "8px", overflow: "hidden", outline: on ? `2px solid ${SELECT_BLUE}` : "1px solid", outlineColor: on ? SELECT_BLUE : "divider", outlineOffset: on ? 2 : 0, backgroundColor: "#0B0B0D" }}>
                <TemplateCanvas media={still} format={format} handle={handle} tag={tag} layout={preview} renderScale={0.25} style={{ width: "100%", pointerEvents: "none" }} />
              </Box>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, mt: 0.6 }}>{template.label}</Typography>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.35 }}>{template.blurb}</Typography>
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ ...sectionLabel, mt: 2.5, mb: 0.75 }}>Accent colour</Typography>
      <Swatches name="Accent colour" value={layout.accent ?? tagAccent(tag)} onChange={onAccent} colors={ACCENTS} auto={{ active: !layout.accent, onPick: () => onAccent(undefined) }} />
      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.75 }}>
        Colours the bands, bars and tag. &ldquo;A&rdquo; follows the story&apos;s tag: yellow for Big Breaking, red for Breaking.
      </Typography>
    </>
  );
}
