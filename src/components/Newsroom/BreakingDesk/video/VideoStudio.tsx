"use client";

// Video Studio: the editor shell. Top bar (frame shape, undo/redo, start over, export), left bins (media, text,
// captions, transitions, audio), the preview in the middle, the selected clip's inspector on the right and the
// timeline along the bottom. It opens on the story's footage (or the draft saved in this browser), keeps the
// project saved per draft, and hands the exported file to the caller. Contract: handoff/video-studio-contract.md.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, ThemeProvider, Typography, useMediaQuery } from "@mui/material";
import { Monitor, Upload } from "lucide-react";
import { ASPECTS, emptyProject, projectDuration, type Aspect, type Project } from "./model";
import { StudioProvider, useCreateStudio, useStudioStore, type StudioStore } from "./store";
import { MediaPool } from "./render/mediaPool";
import { useAudioEngine, useEnginePlaying } from "./audio/hooks";
import { importMusic, isAudioFile, releaseAudioAsset } from "./audio/importMusic";
import { probeHasAudio } from "./audio/decode";
import ExportDialog from "./export/ExportDialog";
import { PLATFORM_ASPECT, assetFrom, projectFromStory, type MediaFacts, type StoryMediaSource, type StudioPlatform } from "./projectFromStory";
import { clearSaved, readSaved, studioKey, useAutosave, writeSaved } from "./panels/autosave";
import { kindOf, probeMedia } from "./panels/probe";
import { useStudioApi } from "./panels/studioApi";
import { BinPanel, BinRail, type BinId } from "./panels/Bins";
import Inspector from "./panels/Inspector";
import TopBar from "./panels/TopBar";
import StudioPreview from "./panels/StudioPreview";
import Timeline from "./timeline/Timeline";
import type { StudioCommand } from "./timeline/commands";
import { togglePlayback } from "./panels/playback";
import { ASSET_DRAG_TYPE } from "./panels/catalog";
import { S, studioTheme } from "./panels/studioTheme";
import { useSuppressBrowserMenu } from "./ui/EditorContextMenu";

export interface VideoStudioProps {
  platform: StudioPlatform;
  /** Draft (or YouTube item) id: the project is saved in this browser under studio:<platform>:<draftId> */
  draftId: string;
  /** The story whose footage and headline start the project; null starts empty */
  story: StoryMediaSource | null;
  /** Frame shape for a new project; defaults to the platform's usual one */
  aspect?: Aspect;
  /** Shown in the top bar; defaults to the story's headline */
  title?: string;
  onClose?: () => void;
  /** "Use as post video" in the export dialog hands the finished file here */
  onUseVideo?: (blob: Blob) => void;
}

/** Below this width the editor cannot fit its four regions */
const MIN_WIDTH = 900;

export default function VideoStudio(props: VideoStudioProps) {
  const store = useCreateStudio(() => emptyProject(props.aspect ?? PLATFORM_ASPECT[props.platform]));
  return (
    <ThemeProvider theme={studioTheme}>
      <StudioProvider store={store}>
        <StudioShell {...props} />
      </StudioProvider>
    </ThemeProvider>
  );
}

/** Records which videos carry sound (decodes in the background; the audio module caches it for playback) */
function fillHasAudio(store: StudioStore, p: Pick<Project, "assets">) {
  for (const a of p.assets) {
    if (a.kind !== "video" || a.hasAudio !== undefined) continue;
    void probeHasAudio(a).then((hasAudio) => store.dispatch({ type: "assets/update", assetId: a.id, patch: { hasAudio } }), () => undefined);
  }
}

async function storyFacts(story: StoryMediaSource | null): Promise<Record<string, MediaFacts>> {
  if (!story) return {};
  const entries = await Promise.all(story.media.map(async (m) => [m.url, await probeMedia(m.url, m.kind)] as const));
  return Object.fromEntries(entries);
}

function StudioShell({ platform, draftId, story, aspect, title, onClose, onUseVideo }: VideoStudioProps) {
  const store = useStudioStore();
  const api = useStudioApi();
  const key = studioKey(platform, draftId);
  const [ready, setReady] = useState(false);
  const [bin, setBin] = useState<BinId>("media");
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dropping, setDropping] = useState(false);
  const narrow = useMediaQuery(`(max-width:${MIN_WIDTH - 0.05}px)`);

  const [pool] = useState(() => new MediaPool());
  const engine = useAudioEngine(api.project);
  const blobs = useRef(new Set<string>());

  useEffect(() => {
    pool.sync(api.project.assets);
  }, [pool, api.project.assets]);

  // Release decoders, elements and every file link made here when the studio closes
  useEffect(() => {
    const urls = blobs.current;
    return () => {
      // Audio assets also drop their decoded sound and waveform caches
      store.getState().project.assets.filter((a) => a.kind === "audio" && urls.has(a.url)).forEach(releaseAudioAsset);
      pool.dispose();
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, [pool, store]);

  // Open: the copy saved in this browser, else a fresh cut from the story
  const fresh = useCallback(async () => {
    const facts = await storyFacts(story);
    const p = projectFromStory(story, platform, facts);
    if (aspect) p.aspect = aspect;
    return p;
  }, [story, platform, aspect]);

  const loadProject = useCallback(
    (p: Project) => {
      store.dispatch({ type: "project/replace", project: p });
      // A blob: link saved last session is dead; probe only files that can still be read
      fillHasAudio(store, { assets: p.assets.filter((a) => !a.url.startsWith("blob:")) });
      // Files picked from the computer last time are gone with that tab; ask for them again
      setMissing(new Set(p.assets.filter((a) => a.url.startsWith("blob:")).map((a) => a.id)));
    },
    [store],
  );

  // Opens once per draft: a story object refreshed by polling must not reload the project under the editor
  const freshRef = useRef(fresh);
  useEffect(() => {
    freshRef.current = fresh;
  }, [fresh]);
  useEffect(() => {
    let live = true;
    const open = async () => readSaved(key)?.project ?? (await freshRef.current());
    void open().then((p) => {
      if (!live) return;
      loadProject(p);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [key, loadProject]);

  const save = useAutosave(key, api.project, ready);

  const startOver = async () => {
    setConfirmReset(false);
    engine.pause();
    clearSaved(key);
    setReady(false);
    loadProject(await fresh());
    store.dispatch({ type: "seek", time: 0 });
    setReady(true);
  };

  const importFiles = useCallback(
    async (files: File[]) => {
      const skipped: string[] = [];
      const state = store.getState().project;
      for (const file of files) {
        const kind = kindOf(file) ?? (isAudioFile(file) ? "audio" : null);
        if (!kind) {
          skipped.push(file.name);
          continue;
        }
        const lostAudio = kind === "audio" ? state.assets.find((a) => missing.has(a.id) && a.kind === "audio" && a.name === file.name.replace(/\.[^.]+$/, "")) : undefined;
        if (kind === "audio" && !lostAudio) {
          // Decoded once here so the waveform, preview and export share it
          try {
            const asset = await importMusic(file);
            blobs.current.add(asset.url);
            api.addAsset(asset);
          } catch (err) {
            setNotice(err instanceof Error ? err.message : `Could not read the sound in ${file.name}.`);
          }
          continue;
        }
        const url = URL.createObjectURL(file);
        blobs.current.add(url);
        const facts = await probeMedia(url, kind);
        // Same name as a file that went missing after a reload: put it back in place
        const lost = lostAudio ?? state.assets.find((a) => missing.has(a.id) && a.name === file.name && a.kind === kind);
        if (lost) {
          api.updateAsset(lost.id, { url, duration: facts.duration ?? lost.duration, width: facts.width, height: facts.height });
          setMissing((m) => {
            const next = new Set(m);
            next.delete(lost.id);
            return next;
          });
        } else {
          const asset = assetFrom(kind, url, file.name, facts);
          api.addAsset(asset);
          if (kind === "video") fillHasAudio(store, { assets: [asset] });
        }
      }
      if (skipped.length) setNotice(`Skipped ${skipped.join(", ")}: not a video, photo or sound file.`);
      setBin((b) => (files.every((f) => kindOf(f) === "audio") ? "audio" : b === "audio" ? b : "media"));
    },
    [api, missing, store],
  );

  const togglePlay = useCallback(() => togglePlayback(engine, store), [engine, store]);
  const playing = useEnginePlaying(engine);
  const openExport = useCallback(() => {
    engine.pause();
    setExporting(true);
  }, [engine]);
  const previewRef = useRef<HTMLDivElement>(null);
  // Shell actions in the timeline's Ctrl+K palette; ids that are in the keymap also get its shortcut
  const commands = useMemo<StudioCommand[]>(
    () => [
      { id: "studio.export", label: "Export video", section: "Edit", keywords: "mp4 download render", run: openExport },
      {
        id: "studio.save",
        label: "Save now",
        section: "Edit",
        keywords: "save store",
        run: ({ store: st }) => setNotice(writeSaved(key, st.getState().project) ? "Saved in this browser." : "Could not save: this browser's storage is full or blocked."),
      },
      {
        id: "studio.saveAs",
        label: "Save as a copy",
        section: "Edit",
        keywords: "save copy download project json",
        // The project file (clips, text, settings); files imported from the computer are not inside it
        run: ({ store: st }) => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(st.getState().project, null, 2)], { type: "application/json" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = `${platform.toLowerCase()}-${draftId}-project.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 0);
          setNotice("Project copy downloaded. Imported files are not inside it.");
        },
      },
      {
        id: "preview.fullscreen",
        label: "Full-screen preview",
        section: "View",
        keywords: "fullscreen full screen",
        run: () => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void previewRef.current?.requestFullscreen?.().catch(() => setNotice("This browser did not allow full screen."));
        },
      },
      ...(["16:9", "9:16", "1:1", "4:5"] as const).map((a): StudioCommand => ({
        id: `studio.aspect.${a}`,
        label: `Frame ${a}: ${ASPECTS[a].label}`,
        section: "View",
        keywords: "aspect ratio size shape",
        run: ({ store: st }) => st.dispatch({ type: "project/set", patch: { aspect: a } }),
      })),
    ],
    [openExport, key, platform, draftId],
  );

  // Right-click inside the studio shows editor menus, never the browser's (text fields and Shift+right-click excepted)
  const rootRef = useRef<HTMLDivElement>(null);
  useSuppressBrowserMenu(rootRef);

  const headline = story?.headline.trim() ?? "";
  const heading = title ?? (headline || "Untitled video");
  const empty = projectDuration(api.project) === 0;

  if (narrow) {
    return (
      <Box sx={{ position: "fixed", inset: 0, zIndex: 1250, minHeight: "100dvh", display: "grid", placeItems: "center", p: 3, bgcolor: S.stage, color: S.text }}>
        <Box sx={{ maxWidth: 380, textAlign: "center", display: "grid", gap: 1.5, justifyItems: "center" }}>
          <Monitor size={36} color={S.accent} />
          <Typography component="h1" sx={{ fontSize: 18, fontWeight: 700 }}>
            Use a larger screen to edit video
          </Typography>
          <Typography sx={{ fontSize: 14, color: S.muted }}>
            The studio needs a window at least {MIN_WIDTH} pixels wide for the preview, timeline and settings. Widen this window or open the draft on a laptop or desktop. Your edits are kept.
          </Typography>
          {onClose && (
            <Button variant="outlined" color="inherit" onClick={onClose}>
              Back to the post
            </Button>
          )}
        </Box>
      </Box>
    );
  }

  // Always the whole window, above the desk's sidebar, header and assistant button (z 1100-1200), below MUI menus and dialogs (1300+)
  return (
    <Box
      ref={rootRef}
      sx={{ position: "fixed", inset: 0, zIndex: 1250, height: "100dvh", display: "grid", gridTemplateRows: "auto minmax(0, 1fr) minmax(190px, 32%)", bgcolor: S.stage, color: S.text, overflow: "hidden" }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        void importFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <TopBar
        title={heading}
        aspect={api.project.aspect}
        onAspect={api.setAspect}
        canUndo={api.canUndo}
        canRedo={api.canRedo}
        onUndo={api.undo}
        onRedo={api.redo}
        save={save}
        onStartOver={() => setConfirmReset(true)}
        onExport={openExport}
        exportDisabled={!ready || empty}
        onClose={onClose}
      />

      <Box sx={{ display: "flex", minHeight: 0 }}>
        <BinRail active={bin} onChange={setBin} />
        <BinPanel api={api} bin={bin} onImport={(f) => void importFiles(f)} missing={missing} headline={headline} />
        <Box ref={previewRef} component="main" aria-label="Preview" sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative", bgcolor: S.stage }}>
          {ready ? (
            <StudioPreview pool={pool} engine={engine} onTogglePlay={togglePlay} />
          ) : (
            <Box sx={{ flex: 1, display: "grid", placeItems: "center", color: S.muted }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <CircularProgress size={18} color="inherit" />
                <Typography sx={{ fontSize: 13 }}>Opening the story&apos;s footage</Typography>
              </Box>
            </Box>
          )}
        </Box>
        <Box sx={{ width: { xs: 272, xl: 312 }, flexShrink: 0, minHeight: 0 }}>
          <Inspector api={api} />
        </Box>
      </Box>

      <Box sx={{ minHeight: 0 }}>
        <Timeline onTogglePlay={togglePlay} playing={playing} extraCommands={commands} />
      </Box>

      {dropping && (
        <Box aria-hidden sx={{ position: "absolute", inset: 8, border: `2px dashed ${S.accent}`, borderRadius: 2, bgcolor: "rgba(18,20,24,.82)", display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 10 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Upload size={22} color={S.accent} />
            <Typography sx={{ fontSize: 16, fontWeight: 600 }}>Drop to add to Your media</Typography>
          </Box>
        </Box>
      )}

      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} aria-labelledby="reset-title">
        <DialogTitle id="reset-title">Start over from the story?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: S.muted }}>
            Every edit to this video is removed, including imported files, and the studio rebuilds the cut from the story&apos;s footage. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmReset(false)}>
            Keep editing
          </Button>
          <Button color="error" variant="contained" onClick={() => void startOver()}>
            Start over
          </Button>
        </DialogActions>
      </Dialog>

      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        project={api.project}
        pool={pool}
        fileName={`${platform.toLowerCase()}-${draftId}`}
        onUse={onUseVideo}
      />

      <Snackbar open={!!notice} autoHideDuration={6000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="info" onClose={() => setNotice(null)} variant="filled" sx={{ bgcolor: S.raised, color: S.text }}>
          {notice}
        </Alert>
      </Snackbar>
    </Box>
  );
}
