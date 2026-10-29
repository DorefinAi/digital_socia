"use client";

// Templates tab, live desk: the operator's own X card background. One per user per platform, kept on
// the server until they replace or remove it. The editor draws every X card on it (backgroundCard.ts).

import React, { useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, Skeleton, Typography } from "@mui/material";
import { ImageUp, RefreshCw, Trash2 } from "lucide-react";
import * as socia from "@/lib/socia/api";
import { LoadError } from "@/components/Newsroom/SociaDesk/liveShared";
import { errorText, useLiveDesk } from "./LiveDesk";
import { usePermissions } from "@/lib/access/usePermissions";
import CardLayoutEditor from "./CardLayoutEditor";

const MAX_BYTES = 5 * 1024 * 1024;
const MIN_SIDE = 600;
/** The server's limit; past it a browser canvas may refuse to draw */
const MAX_SIDE = 8192;
const TYPES = ["image/png", "image/jpeg"];

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

export default function CardBackgroundPanel() {
  const desk = useLiveDesk();
  const { can } = usePermissions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | "remove">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Set before the file check, so a second drop or pick during the check doesn't start another upload
  const uploading = useRef(false);
  if (!desk) return null;

  const polled = desk.cardTemplate;
  const template = polled.data?.template ?? null;
  const canChange = can("card_template.own");

  const upload = async (file: File | undefined) => {
    if (!file || busy || uploading.current) return;
    uploading.current = true;
    setBusy("upload");
    setError(null);
    try {
      const problem = await checkFile(file);
      if (problem) {
        setError(problem);
        return;
      }
      await socia.uploadCardTemplate(file, "x");
      await polled.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      uploading.current = false;
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError(null);
    try {
      await socia.deleteCardTemplate("x");
      await polled.refresh();
      setConfirmRemove(false);
    } catch (err) {
      setError(errorText(err));
      setConfirmRemove(false);
    } finally {
      setBusy(null);
    }
  };

  const pick = () => inputRef.current?.click();
  const uploadLabel = busy === "upload" ? "Uploading" : template ? "Replace" : "Upload background";

  return (
    <Box component="section" aria-labelledby="x-background-title" sx={{ backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", p: { xs: 2, md: 2.5 } }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: template ? "minmax(0, 480px) minmax(0, 1fr)" : "minmax(0, 320px) minmax(0, 1fr)" }, gap: { xs: 2, md: 3 }, alignItems: "start" }}>
        <Box sx={{ maxWidth: template ? 480 : 320, width: "100%" }}>
          {polled.loading ? (
            <Skeleton variant="rounded" sx={{ width: "100%", height: "auto", aspectRatio: "1", borderRadius: "10px" }} />
          ) : template ? (
            <CardLayoutEditor template={template} editable={canChange} onSaved={polled.refresh} />
          ) : (
            // Drops land on this wrapper, which always takes them: a file dropped on a disabled zone must not
            // make the browser leave the desk to open it
            <Box
              onDragOver={(e: React.DragEvent) => {
                e.preventDefault();
                if (canChange && !busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: React.DragEvent) => {
                e.preventDefault();
                setDragging(false);
                if (canChange && !busy) void upload(e.dataTransfer.files?.[0]);
              }}
            >
              <Box
                component="button"
                type="button"
                onClick={pick}
                disabled={!canChange || !!busy}
                sx={{
                  width: "100%",
                  aspectRatio: "1",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  p: 2,
                  border: "2px dashed",
                  borderColor: dragging ? "primary.main" : "divider",
                  borderRadius: "10px",
                  backgroundColor: dragging ? "action.hover" : "transparent",
                  color: "text.secondary",
                  fontFamily: "inherit",
                  cursor: canChange ? "pointer" : "default",
                  "&:hover:not(:disabled)": { backgroundColor: "action.hover", color: "text.primary" },
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                  // A disabled button swallows drag events; let them reach the wrapper
                  "&:disabled": { pointerEvents: "none" },
                }}
              >
                {busy === "upload" ? <CircularProgress size={22} /> : <ImageUp size={28} aria-hidden />}
                <Typography component="span" sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "text.primary" }}>
                  {canChange ? "Drop your background here, or click to choose" : "No background yet"}
                </Typography>
                <Typography component="span" sx={{ fontSize: "0.75rem" }}>PNG or JPG, up to 5 MB</Typography>
              </Box>
            </Box>
          )}
        </Box>

        {/* On a phone the explanation comes before the picture it explains */}
        <Box sx={{ minWidth: 0, order: { xs: -1, md: 0 } }}>
          <Typography id="x-background-title" component="h2" sx={{ fontWeight: 700, fontSize: "1rem" }}>
            Your X background
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5, maxWidth: "62ch", lineHeight: 1.6 }}>
            Every X card you open is drawn on this picture: today&apos;s date in the date tag, then the headline in yellow and the whole story in white inside the text box. The text shrinks until it fits. Move and resize the date tag and the text box on the sample, then save the layout. Only your cards use it, and it stays until you replace or remove it.
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 1 }}>
            PNG or JPG, up to 5 MB, at least {MIN_SIDE} px on each side. Use the same size you post at, for example 1080 × 1080.
          </Typography>

          {polled.error && !polled.data && !polled.loading && (
            <Box sx={{ mt: 2 }}>
              <LoadError error={polled.error} onRetry={() => void polled.refresh()} />
            </Box>
          )}
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ mt: 2, borderRadius: "10px", fontSize: "0.8125rem" }}>
              {error}
            </Alert>
          )}
          {template && (
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 2 }}>
              {template.width} × {template.height} px, updated {new Date(template.updatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
            </Typography>
          )}

          {canChange ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 2 }}>
              <Button
                variant={template ? "outlined" : "contained"}
                onClick={pick}
                disabled={!!busy || polled.loading}
                startIcon={busy === "upload" ? <CircularProgress size={14} color="inherit" /> : template ? <RefreshCw size={15} /> : <ImageUp size={15} />}
              >
                {uploadLabel}
              </Button>
              {template && (
                <Button color="error" onClick={() => setConfirmRemove(true)} disabled={!!busy} startIcon={<Trash2 size={15} />}>
                  Remove
                </Button>
              )}
            </Box>
          ) : (
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 2 }}>Your role can&apos;t post, so it has no card background.</Typography>
          )}
        </Box>
      </Box>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        aria-label="Choose an X background image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void upload(file);
        }}
      />

      <Dialog open={confirmRemove} onClose={() => !busy && setConfirmRemove(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none" } } }}>
        <Box sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 700 }}>Remove your X background?</Typography>
          <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mt: 1 }}>
            Stories you open after this get the automatic card. Cards already posted don&apos;t change.
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2.5 }}>
            <Button onClick={() => setConfirmRemove(false)} disabled={!!busy}>Keep it</Button>
            <Button variant="contained" color="error" onClick={() => void remove()} disabled={!!busy} startIcon={busy === "remove" ? <CircularProgress size={14} color="inherit" /> : undefined}>
              Remove background
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
