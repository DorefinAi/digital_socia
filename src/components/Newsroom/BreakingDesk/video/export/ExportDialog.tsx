"use client";

// Export dialog: pick resolution and frame rate, see the expected size, export with progress and cancel, then preview,
// download, or hand the file to the post ("Use as post video"). Styled from the surrounding theme (studioTheme).
import React, { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Dialog, IconButton, LinearProgress, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { Download, X } from "lucide-react";
import { projectDuration, type Project } from "../model";
import { defaultVideoBitrate, describeMethod, detectExportMethod, estimateBytes, formatBytes, outputSize } from "./capabilities";
import { download, extensionFor } from "./download";
import { projectHasSound } from "./frameSeek";
import type { ExportFn, ExportMethod, ExportProgress, ExportResolution, SeekablePool } from "./types";

export interface ExportDialogProps<P extends SeekablePool> {
  open: boolean;
  onClose: () => void;
  project: Project;
  pool: P;
  /** Download name without extension */
  fileName?: string;
  /** Shown as "Use as post video" when given; receives the finished file */
  onUse?: (blob: Blob) => void;
  /** Swaps the encoder (tests); defaults to exportMp4, loaded on first export */
  exporter?: ExportFn<P>;
}

export default function ExportDialog<P extends SeekablePool>({ open, onClose, ...rest }: ExportDialogProps<P>) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="export-title"
      slotProps={{ paper: { sx: { borderRadius: "12px", m: 2, width: "calc(100% - 32px)", border: 1, borderColor: "divider" } } }}
    >
      {/* Unmounts on close: a running export is cancelled and the preview URL revoked */}
      {open && <ExportPanel onClose={onClose} {...rest} />}
    </Dialog>
  );
}

type Run =
  | { status: "idle" }
  | { status: "running"; progress: ExportProgress | null }
  | { status: "done"; blob: Blob; url: string; seconds: number }
  | { status: "error"; message: string };

const RESOLUTIONS: ExportResolution[] = [720, 1080];
const FRAME_RATES = [25, 30, 60] as const;

/** m:ss.t with tabular digits */
function clock(sec: number): string {
  const v = Math.max(0, sec);
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

function remaining(sec: number | null): string {
  if (sec === null) return "Estimating time left";
  if (sec < 5) return "A few seconds left";
  if (sec < 60) return `About ${Math.ceil(sec / 5) * 5} s left`;
  return `About ${Math.ceil(sec / 60)} min left`;
}

const PHASE_TEXT: Record<ExportProgress["phase"], string> = {
  preparing: "Preparing the encoder",
  audio: "Mixing sound",
  video: "Encoding frames",
  finalizing: "Writing the file",
  done: "Export finished",
};

function ExportPanel<P extends SeekablePool>({ onClose, project, pool, fileName = "video", onUse, exporter }: Omit<ExportDialogProps<P>, "open">) {
  const [resolution, setResolution] = useState<ExportResolution>(1080);
  const [fps, setFps] = useState<number>(project.fps);
  const [method, setMethod] = useState<ExportMethod | null>(null);
  const [run, setRun] = useState<Run>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const duration = projectDuration(project);
  const size = outputSize(project.aspect, resolution);
  const bitrate = defaultVideoBitrate(resolution, fps);
  const hasSound = projectHasSound(project);

  // What this browser will do at the chosen size (H.264 MP4, WebM, or real-time capture)
  useEffect(() => {
    let live = true;
    detectExportMethod(size, fps, bitrate, hasSound).then(
      (m) => live && setMethod(m),
      () => live && setMethod({ kind: "none" }),
    );
    return () => {
      live = false;
    };
  }, [size.width, size.height, fps, bitrate, hasSound]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel a running export when the dialog goes away
  useEffect(() => () => abortRef.current?.abort(), []);

  // Revoke the preview URL when it is replaced or the dialog closes
  const doneUrl = run.status === "done" ? run.url : null;
  useEffect(() => {
    if (!doneUrl) return;
    return () => URL.revokeObjectURL(doneUrl);
  }, [doneUrl]);

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRun({ status: "running", progress: null });
    const startedAt = performance.now();
    try {
      const exportFn: ExportFn<P> = exporter ?? ((await import("./exportMp4")).exportMp4 as unknown as ExportFn<P>);
      const blob = await exportFn(project, pool, {
        height: resolution,
        fps,
        bitrate,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setRun({ status: "running", progress });
        },
      });
      if (controller.signal.aborted) return;
      setRun({ status: "done", blob, url: URL.createObjectURL(blob), seconds: (performance.now() - startedAt) / 1000 });
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        setRun({ status: "idle" });
        return;
      }
      setRun({ status: "error", message: err instanceof Error ? err.message : "The export failed." });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setRun({ status: "idle" });
  };

  const running = run.status === "running";
  const unsupported = method?.kind === "none";
  const empty = !(duration > 0);
  const ext = method?.kind === "webcodecs" ? method.container : method?.kind === "realtime" && method.mimeType.includes("webm") ? "webm" : "mp4";

  return (
    <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2.25 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography id="export-title" component="h2" sx={{ fontWeight: 700, fontSize: "1rem" }}>
          {run.status === "done" ? "Your video is ready" : "Export video"}
        </Typography>
        <IconButton size="small" aria-label={running ? "Cancel export and close" : "Close"} onClick={onClose} sx={{ mr: -0.75 }}>
          <X size={16} />
        </IconButton>
      </Box>

      {/* Announces phase changes and the result, not every percent */}
      <Box aria-live="polite" sx={visuallyHidden}>
        {run.status === "running" ? PHASE_TEXT[run.progress?.phase ?? "preparing"] : run.status === "done" ? "Export finished" : ""}
      </Box>

      {(run.status === "idle" || run.status === "error") && (
        <>
          <Setting label="Resolution" id="export-res">
            <ToggleButtonGroup
              exclusive
              size="small"
              value={resolution}
              onChange={(_, v: ExportResolution | null) => v && setResolution(v)}
              aria-labelledby="export-res"
            >
              {RESOLUTIONS.map((r) => (
                <ToggleButton key={r} value={r} sx={toggleSx}>
                  {r}p
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Setting>
          <Setting label="Frame rate" id="export-fps">
            <ToggleButtonGroup exclusive size="small" value={fps} onChange={(_, v: number | null) => v && setFps(v)} aria-labelledby="export-fps">
              {FRAME_RATES.map((f) => (
                <ToggleButton key={f} value={f} sx={toggleSx}>
                  {f} fps
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Setting>

          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5, fontSize: "0.8125rem" }}>
            <Fact term="Frame size" value={`${size.width} × ${size.height}`} />
            <Fact term="Length" value={clock(duration)} />
            <Fact term="File size" value={empty ? "No content" : `About ${formatBytes(estimateBytes(duration, bitrate))}`} />
          </Box>

          {method && (method.kind === "webcodecs" ? (
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{describeMethod(method)}</Typography>
          ) : (
            <Alert severity={method.kind === "none" ? "error" : "warning"} variant="outlined" sx={{ fontSize: "0.8125rem", py: 0 }}>
              {describeMethod(method)}
            </Alert>
          ))}

          {run.status === "error" && (
            <Alert severity="error" variant="outlined" sx={{ fontSize: "0.8125rem", py: 0 }}>
              {run.message}
            </Alert>
          )}

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={onClose} color="inherit">
              Close
            </Button>
            <Button variant="contained" onClick={() => void start()} disabled={!method || unsupported || empty}>
              {run.status === "error" ? "Try again" : `Export ${ext.toUpperCase()}`}
            </Button>
          </Box>
        </>
      )}

      {run.status === "running" && <Progress progress={run.progress} duration={duration} fps={fps} onCancel={cancel} />}

      {run.status === "done" && (
        <>
          <Box
            component="video"
            src={run.url}
            controls
            playsInline
            aria-label="Exported video preview"
            sx={{ width: "100%", maxHeight: "50vh", bgcolor: "#000", borderRadius: "8px", display: "block", aspectRatio: `${size.width} / ${size.height}` }}
          />
          <Box component="dl" sx={{ m: 0, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 2, rowGap: 0.5, fontSize: "0.8125rem" }}>
            <Fact term="File" value={`${extensionFor(run.blob).toUpperCase()}, ${formatBytes(run.blob.size)}`} />
            <Fact term="Took" value={`${run.seconds.toFixed(1)} s (${(duration / run.seconds).toFixed(1)}× real time)`} />
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 1 }}>
            <Button color="inherit" onClick={() => setRun({ status: "idle" })}>
              Change settings
            </Button>
            <Button
              variant={onUse ? "outlined" : "contained"}
              startIcon={<Download size={16} />}
              onClick={() => download(run.blob, fileName)}
            >
              Download {extensionFor(run.blob).toUpperCase()}
            </Button>
            {onUse && (
              <Button variant="contained" onClick={() => onUse(run.blob)}>
                Use as post video
              </Button>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

function Progress({ progress, duration, fps, onCancel }: { progress: ExportProgress | null; duration: number; fps: number; onCancel: () => void }) {
  const phase = progress?.phase ?? "preparing";
  const at = progress ? Math.min(duration, progress.framesDone / fps) : 0;
  const pct = Math.round((progress?.fraction ?? 0) * 100);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      {/* The render head: timeline position of the frame being encoded */}
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, fontVariantNumeric: "tabular-nums" }}>
        <Typography component="span" sx={{ fontSize: "2.25rem", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {clock(at)}
        </Typography>
        <Typography component="span" sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
          of {clock(duration)}
        </Typography>
      </Box>
      <LinearProgress
        variant={progress ? "determinate" : "indeterminate"}
        value={pct}
        aria-label="Export progress"
        sx={{ height: 3, borderRadius: 2, bgcolor: "divider" }}
      />
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, fontSize: "0.8125rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
        <span>
          {PHASE_TEXT[phase]}
          {phase === "video" && progress ? ` ${progress.framesDone} of ${progress.framesTotal}` : ""}
        </span>
        <span>
          {phase === "video" ? remaining(progress?.eta ?? null) : `${pct}%`}
          {phase === "video" && progress?.speed ? `, ${progress.speed.toFixed(1)}× real time` : ""}
        </span>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button color="inherit" variant="outlined" onClick={onCancel} sx={{ borderColor: "divider" }}>
          Cancel export
        </Button>
      </Box>
    </Box>
  );
}

function Setting({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
      <Typography id={id} sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <>
      <Box component="dt" sx={{ color: "text.secondary" }}>
        {term}
      </Box>
      <Box component="dd" sx={{ m: 0, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Box>
    </>
  );
}

const toggleSx = {
  px: 1.5,
  py: 0.5,
  fontSize: "0.8125rem",
  textTransform: "none",
  "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "primary.main", color: "primary.contrastText" },
} as const;

const visuallyHidden = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;
