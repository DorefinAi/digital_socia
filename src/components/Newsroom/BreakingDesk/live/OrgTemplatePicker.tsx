"use client";

// Template tab, live X editor: the desk's shared card designs (and the operator's own X background, when
// they have one) as small cards drawn with this story's words. A click draws the open story on that design.

import React, { useDeferredValue, useEffect, useRef, useState } from "react";
import { Box, Button, Skeleton, Typography } from "@mui/material";
import { ImageUp } from "lucide-react";
import type { DrawableCardTemplate, OrgCardTemplate } from "@/lib/socia/types";
import { fontsReady, paintCardText } from "./backgroundCard";
import { templateImage } from "./orgCanvas";
import { TemplateOptions, UploadTemplateDialog } from "./OrgTemplateManager";

const SELECT_BLUE = "#2F7BFF";
/** Thumbnail width in CSS px; drawn at the screen's pixel ratio */
const THUMB_W = 240;

export interface CardChoice {
  /** An org template's slug, or "own" for the operator's X background */
  key: string;
  label: string;
  /** One line under the label, e.g. "Square, 1080 × 1080" */
  note: string;
  template: DrawableCardTemplate;
  /** The shared template behind the choice (absent for "own"), for its options */
  org?: OrgCardTemplate;
}

function Thumb({ template, headline, body, label }: { template: DrawableCardTemplate; headline: string; body: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Typing in the headline should not wait on two thumbnail repaints
  const deferredHeadline = useDeferredValue(headline);
  const deferredBody = useDeferredValue(body);

  useEffect(() => {
    let cancelled = false;
    Promise.all([templateImage(template.backgroundUrl), fontsReady()])
      .then(([img]) => {
        if (!cancelled) setImage({ url: template.backgroundUrl, img });
      })
      .catch(() => {
        if (!cancelled) setFailed(template.backgroundUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [template.backgroundUrl]);

  const ready = image?.url === template.backgroundUrl ? image.img : null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const W = template.width || ready.naturalWidth;
    const H = template.height || ready.naturalHeight;
    const scale = (THUMB_W * Math.min(2, window.devicePixelRatio || 1)) / W;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(ready, 0, 0, W, H);
    paintCardText(ctx, template.layout, { headline: deferredHeadline, body: deferredBody }, W, H);
  }, [ready, template.width, template.height, template.layout, deferredHeadline, deferredBody]);

  const ratio = `${template.width || 1} / ${template.height || 1}`;
  if (failed === template.backgroundUrl) {
    return (
      <Box sx={{ aspectRatio: ratio, display: "grid", placeItems: "center", p: 1, backgroundColor: "#1A1A1D", color: "#bbb", fontSize: "0.6875rem", textAlign: "center", lineHeight: 1.4 }}>
        Preview didn&apos;t load
      </Box>
    );
  }
  return (
    <Box sx={{ position: "relative", aspectRatio: ratio, lineHeight: 0 }}>
      {!ready && <Skeleton variant="rectangular" sx={{ position: "absolute", inset: 0, height: "100%", bgcolor: "#1A1A1D" }} />}
      <canvas ref={canvasRef} role="img" aria-label={`${label} with this story`} style={{ display: "block", width: "100%", height: "100%" }} />
    </Box>
  );
}

interface OrgTemplatePickerProps {
  choices: CardChoice[];
  /** The key of the design on the card now; null when the card is designed here instead */
  current: string | null;
  headline: string;
  body: string;
  disabled?: boolean;
  onPick: (key: string) => void;
  /** Shows "Upload template" (the user may edit drafts) */
  canUpload?: boolean;
  /** Loads the template list again after an upload, rename, default change or delete */
  onChanged?: () => Promise<unknown>;
  /** A new template is ready (text area set or skipped): put the open story on it */
  onUploaded?: (template: OrgCardTemplate) => void;
}

export default function OrgTemplatePicker({ choices, current, headline, body, disabled, onPick, canUpload, onChanged, onUploaded }: OrgTemplatePickerProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  return (
    <Box component="section" aria-label="Card design" sx={{ mb: 2.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.25 }}>
        <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>Card design</Typography>
        {canUpload && onChanged && (
          <Button size="small" variant="outlined" startIcon={<ImageUp size={14} />} onClick={() => setUploadOpen(true)} sx={{ minHeight: 30, fontSize: "0.75rem", whiteSpace: "nowrap", color: "text.primary", borderColor: "divider" }}>
            Upload template
          </Button>
        )}
      </Box>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 1.5 }}>
        The story is laid out on the design you pick; your words and styling move with it. This browser remembers the choice for this story.
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, alignItems: "end" }}>
        {choices.map((c) => {
          const on = c.key === current;
          return (
            <Box key={c.key} sx={{ position: "relative", minWidth: 0 }}>
            <Box
              component="button"
              type="button"
              disabled={disabled}
              onClick={() => onPick(c.key)}
              aria-pressed={on}
              aria-label={`${c.label} design, ${c.note}`}
              sx={{
                p: 0,
                border: 0,
                background: "none",
                textAlign: "left",
                cursor: disabled ? "default" : "pointer",
                fontFamily: "inherit",
                color: "text.primary",
                minWidth: 0,
                "&:focus-visible": { outline: `2px solid ${SELECT_BLUE}`, outlineOffset: 4, borderRadius: "8px" },
              }}
            >
              <Box sx={{ borderRadius: "8px", overflow: "hidden", outline: on ? `2px solid ${SELECT_BLUE}` : "1px solid", outlineColor: on ? SELECT_BLUE : "divider", outlineOffset: on ? 2 : 0, backgroundColor: "#0B0B0D" }}>
                <Thumb template={c.template} headline={headline} body={body} label={c.label} />
              </Box>
              <Typography lang="hi" sx={{ fontSize: "0.75rem", fontWeight: 700, mt: 0.6 }}>{c.label}</Typography>
              <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.35 }}>
                {c.note}
                {c.org?.createdBy?.name ? `. Added by ${c.org.createdBy.name}` : ""}
              </Typography>
            </Box>
            {c.org && onChanged && (
              <Box sx={{ position: "absolute", top: 6, right: 6 }}>
                <TemplateOptions template={c.org} onChanged={onChanged} disabled={disabled} />
              </Box>
            )}
            </Box>
          );
        })}
      </Box>
      {canUpload && onChanged && (
        <UploadTemplateDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onDone={(t) => {
            setUploadOpen(false);
            void onChanged().then(() => onUploaded?.(t));
          }}
        />
      )}
    </Box>
  );
}
