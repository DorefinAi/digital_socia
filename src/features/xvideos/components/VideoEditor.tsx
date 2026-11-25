"use client";

// The X Videos editor, full window like the X desk's: the dark top bar (← Desk, Prev (K), Next (J), See on X,
// Copy, Copy & Mark Posted), the left rail and panel (Clips / Said in clip), the clip playing in the centre, and the
// Tweet panel on the right. The side panels resize and fold exactly as in the X post maker (its ResizablePanels).
// Keys: J/K next/prev clip, Space or L play, U puts the line playing on line 1, Esc back to the desk; none of them
// fire while typing.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, IconButton, Menu, MenuItem, Snackbar, Tooltip, Typography, useMediaQuery, type Theme } from "@mui/material";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardCheck, Copy, Eye, Film, Mic, PanelLeftClose, PanelLeftOpen, X as CloseIcon } from "lucide-react";
import type { XvClip, XvTranscriptLine } from "../data/xVideosData";
import VolumeStrip from "../../../components/Newsroom/BreakingDesk/VolumeStrip";
import { FoldedPanelStrip, PanelResizeHandle, type PanelsConfig, useResizablePanels } from "../../../components/Newsroom/BreakingDesk/ResizablePanels";
import XPostPreview from "../../../components/Newsroom/BreakingDesk/phase1/XPostPreview";
import { isTextEntryTarget } from "../../../components/Newsroom/BreakingDesk/video/keymap";
import { StudioModal } from "../../../components/Newsroom/BreakingDesk/video/panels/StudioLauncher";
import { XIcon } from "@/components/leftNavigation/aiContentPlatforms";
import { ClipFrame, XV_COLORS, isVertical } from "./ClipFrame";
import ClipStage from "./ClipStage";
import { draftBrand, initialDraft, prefixesFor, type UndoEntry, type XvDraft } from "./deskState";
import { ReadyForXDialog, RejectClipDialog, UndoBar } from "./PostFlow";
import { ClipsPanel, TranscriptPanel } from "./SourcePanels";
import TweetPanel from "./TweetPanel";
import { useClipPlayer } from "./useClipPlayer";
import { X_LIMIT } from "../../../components/Newsroom/BreakingDesk/socialText";
import { applyLabel, applyPrefix, assembleTagBlock, composeTweet, labelOf, lineAt, prefixOf, tweetLength } from "./xvTitle";

/** Same shape as the X post maker's panels; its own key so the two desks keep their own widths */
const EDITOR_PANELS: PanelsConfig = {
  storageKey: "xClips.editorPanels.v1",
  leftFixed: 60,
  rightFolded: 36,
  minMiddle: 420,
  left: { initial: 292, min: 240, max: 480 },
  right: { initial: 340, min: 300, max: 560 },
};
// A folded panel stays mounted (its scroll stays put) but takes no space and no focus, as in the post maker
const foldedPanelSx = { visibility: "hidden", overflow: "hidden", p: 0, borderLeft: 0, borderRight: 0 } as const;

const BAR = { bg: XV_COLORS.bar, text: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.14)" };
const chromeBtnSx = { color: "#fff", borderRadius: "8px", minHeight: 36, minWidth: 0, px: 1.25, fontSize: "0.8125rem", fontWeight: 600, textTransform: "none", whiteSpace: "nowrap", border: `1px solid ${BAR.border}`, gap: 0.5, flexShrink: 0, "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" }, "&.Mui-disabled": { color: "rgba(255,255,255,0.35)" } } as const;
const cmpSx = { ...chromeBtnSx, border: "2px solid #fff", borderRadius: "12px", minHeight: 41, px: 2, fontWeight: 800, fontSize: "0.875rem", backgroundColor: "#111", "&.Mui-disabled": { color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.3)" } } as const;

type SideTab = "clips" | "said";
const SIDE_TABS: { id: SideTab; label: string; icon: React.ReactNode }[] = [
  { id: "clips", label: "Clips", icon: <Film size={18} /> },
  { id: "said", label: "Said in clip", icon: <Mic size={18} /> },
];

/** The sentence without the Hindi full stop, for line 1 */
const asLine = (text: string) => text.trim().replace(/[।.]\s*$/u, "");

interface EditorProps {
  clip: XvClip;
  draft: XvDraft;
  /** The clips Prev/Next and the Clips panel move through (the list as it was when the editor opened) */
  navClips: XvClip[];
  prevId: string | null;
  nextId: string | null;
  postedToday: number;
  undo: UndoEntry[];
  onPatch: (patch: Partial<XvDraft>) => void;
  onGo: (id: string) => void;
  onClose: () => void;
  onPost: (text: string) => void;
  onReject: (reason: string) => void;
  onUndo: (clipId: string) => void;
  onUndoExpire: (now: number) => void;
}

/**
 * The full-window shell stays open while the desk moves between clips; the body is keyed by clip, so the player,
 * panels and dialogs start fresh for each one.
 */
export default function VideoEditor(props: EditorProps) {
  const [tookOver, setTookOver] = useState<Record<string, boolean>>({});
  return (
    <Dialog
      open
      fullScreen
      // Esc is handled by the editor's own keys (it first leaves a text box)
      onClose={(_e, reason) => (reason === "escapeKeyDown" ? undefined : props.onClose())}
      transitionDuration={150}
      aria-labelledby="xv-editor-title"
      slotProps={{ paper: { sx: { borderRadius: 0, backgroundImage: "none", backgroundColor: "#F8F9FA", overflow: "hidden" } } }}
    >
      <EditorBody key={props.clip.id} {...props} tookOver={!!tookOver[props.clip.id]} onTakeOver={() => setTookOver((m) => ({ ...m, [props.clip.id]: true }))} />
      <UndoBar entries={props.undo} onUndo={props.onUndo} onExpire={props.onUndoExpire} />
    </Dialog>
  );
}


/** TV cuts open on one black frame (the bulletin fade-in); the studio starts the cut just after it (25 of the 26 real clips) */
const TV_LEAD_IN = 0.1;
function EditorBody({ clip, draft, navClips, prevId, nextId, postedToday, onPatch, onGo, onClose, onPost, onReject, tookOver, onTakeOver }: EditorProps & { tookOver: boolean; onTakeOver: () => void }) {
  // Opens on the folder's clip list; the speech is one click away
  const [tab, setTab] = useState<SideTab>("clips");
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState<{ copied: boolean; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [studio, setStudio] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<HTMLElement | null>(null);

  const player = useClipPlayer(clip.src, clip.duration, draft.trim);
  const { measure: measureWorkspace, columns: workspaceColumns, left: leftPanel, right: rightPanel } = useResizablePanels(EDITOR_PANELS);
  const wide = useMediaQuery((t: Theme) => t.breakpoints.up("lg"));
  const leftFolded = leftPanel.collapsed;
  const rightFolded = wide && rightPanel.collapsed;
  const prefixes = useMemo(() => prefixesFor(clip), [clip]);
  const brand = draftBrand(draft, clip);
  const tagBlock = assembleTagBlock(
    draft.hashtags.filter((t) => t.on).map((t) => t.value),
    draft.mentions.filter((t) => t.on).map((t) => t.value),
    draft.brandOn ? brand : null,
  );
  const text = composeTweet(draft.title, tagBlock);
  const length = tweetLength(text);
  const playingLine = lineAt(clip.transcript, player.time);
  const posted = clip.status === "posted";
  const held = clip.heldBy && !tookOver ? clip.heldBy : null;
  const blockReason = posted
    ? "Already marked posted"
    : held
      ? `${held} is editing this clip`
      : clip.readingProgress !== undefined
        ? "The clip is still being read"
        : !draft.title.trim()
          ? "Line 1 is empty"
          : length > X_LIMIT
            ? `${length - X_LIMIT} over X's limit`
            : null;
  const anyDialog = !!ready || rejecting || preview || studio || !!scheduleAt;

  const applyLine = useCallback(
    (raw: string, source: XvDraft["source"]) => {
      const label = labelOf(draft.title) ?? (draft.title.trim() ? null : clip.channelLabel);
      const title = applyLabel(applyPrefix(asLine(raw), prefixOf(draft.title, prefixes), prefixes), label);
      onPatch({ title, source });
    },
    [draft.title, clip.channelLabel, prefixes, onPatch],
  );
  const pickTranscript = useCallback((line: XvTranscriptLine) => applyLine(line.text, { kind: "said", at: line.at }), [applyLine]);

  const copy = useCallback(async (t: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      return false;
    }
  }, []);

  const copyOnly = async () => setNotice((await copy(text)) ? "Copied. Not marked posted." : "The browser blocked the clipboard. Select the text and copy it by hand.");

  const copyAndPost = async () => {
    if (blockReason) return;
    const ok = await copy(text);
    onPost(text);
    setReady({ copied: ok, text });
    player.pause();
  };


  // Keyboard, off while typing and while a dialog is up
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTextEntryTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (anyDialog) return;
      const target = e.target as HTMLElement | null;
      const onControl = !!target?.closest?.('button, a, [role="slider"], [role="option"], input');
      const k = e.key.toLowerCase();
      if (k === "j" && nextId) onGo(nextId);
      else if (k === "k" && prevId) onGo(prevId);
      else if (k === "l" || (e.key === " " && !onControl)) player.toggle();
      else if (k === "u") {
        if (playingLine >= 0) pickTranscript(clip.transcript[playingLine]);
      } else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDialog, nextId, prevId, onGo, onClose, player, clip, playingLine, pickTranscript]);


  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
        {/* Top bar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 1.75 }, height: 54, flexShrink: 0, backgroundColor: BAR.bg, color: "#fff" }}>
          <Button onClick={onClose} aria-label="Back to desk (Esc)" sx={chromeBtnSx}>
            <ArrowLeft size={15} />
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Desk
            </Box>
          </Button>
          <Button onClick={() => prevId && onGo(prevId)} disabled={!prevId} aria-label="Previous clip (K)" aria-keyshortcuts="K" sx={chromeBtnSx}>
            <ChevronLeft size={15} />
            <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
              Prev (K)
            </Box>
          </Button>
          <Button onClick={() => nextId && onGo(nextId)} disabled={!nextId} aria-label="Next clip (J)" aria-keyshortcuts="J" sx={chromeBtnSx}>
            <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
              Next (J)
            </Box>
            <ChevronRight size={15} />
          </Button>
          <Box sx={{ display: { xs: "none", md: "flex" }, ml: 1 }}>
            <XIcon size={15} color="#fff" />
          </Box>
          <Typography id="xv-editor-title" component="h1" sx={{ flex: 1, minWidth: 0, ml: { xs: 0.5, md: 0.75 }, fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {clip.district}
            {clip.topic ? `: ${clip.topic}` : ""}
            <Box component="span" sx={{ display: { xs: "none", lg: "inline" } }}> · {clip.fileName}</Box>
          </Typography>
          <Button onClick={() => setPreview(true)} sx={{ ...chromeBtnSx, border: 0, display: { xs: "none", sm: "inline-flex" } }}>
            <Eye size={15} /> See on X
          </Button>
          <Tooltip title="Copy the post (not marked posted)">
            <Button onClick={() => void copyOnly()} aria-label="Copy the post" sx={chromeBtnSx}>
              <Copy size={14} />
              <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
                Copy
              </Box>
            </Button>
          </Tooltip>
          <Tooltip title={blockReason ?? "Copy the post and move the clip to Posted"}>
            <span>
              <Button onClick={() => void copyAndPost()} disabled={!!blockReason} sx={cmpSx}>
                {posted ? <Check size={15} /> : <ClipboardCheck size={15} />}
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  {posted ? "Posted" : "Copy & Mark Posted"}
                </Box>
              </Button>
            </span>
          </Tooltip>
        </Box>
        <VolumeStrip name="X" used={postedToday} cap={10000} />

        {/* Workspace */}
        <Box ref={measureWorkspace} sx={{ position: "relative", flex: 1, minHeight: 0, display: { xs: "flex", lg: "grid" }, flexDirection: "column", gridTemplateColumns: workspaceColumns, overflowY: { xs: "auto", lg: "hidden" } }}>
          {/* Rail */}
          <Box sx={{ order: { xs: 3, lg: 0 }, flexShrink: 0, display: "flex", flexDirection: { xs: "row", lg: "column" }, alignItems: "center", gap: 0.75, p: { xs: 0.75, lg: "10px 4px" }, backgroundColor: "background.paper", borderRight: { lg: "1px solid" }, borderTop: { xs: "1px solid", lg: 0 }, borderColor: "divider" }}>
            {/* Folds the panel beside the rail away; a plain button outside the tab list, as in the post maker */}
            <Tooltip title={leftFolded ? "Show the clip panel" : "Hide the clip panel"}>
              <IconButton aria-label={leftFolded ? "Show the clip panel" : "Hide the clip panel"} aria-expanded={!leftFolded} aria-controls="xv-editor-clip-panel" onClick={() => leftPanel.setCollapsed(!leftPanel.collapsed)} sx={{ color: "text.primary", flexShrink: 0 }}>
                {leftFolded ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </IconButton>
            </Tooltip>
            <Box role="tablist" aria-label="Source" aria-orientation="vertical" sx={{ display: "flex", flexDirection: { xs: "row", lg: "column" }, alignItems: "center", gap: 0.75 }}>
              {SIDE_TABS.map((t) => (
                <Box
                  key={t.id}
                  component="button"
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  aria-controls="xv-editor-clip-panel"
                  // A tab opens the panel when it is folded, as the post maker's tools do
                  onClick={() => {
                    setTab(t.id);
                    if (leftPanel.collapsed) leftPanel.setCollapsed(false);
                  }}
                  sx={{ width: { xs: "auto", lg: 44 }, px: { xs: 1.25, lg: 0 }, py: 0.875, display: "flex", flexDirection: { xs: "row", lg: "column" }, alignItems: "center", gap: 0.5, border: 0, borderRadius: "8px", font: "inherit", fontSize: "0.625rem", fontWeight: 600, lineHeight: 1.1, textAlign: "center", cursor: "pointer", backgroundColor: tab === t.id ? "#ECEEF0" : "transparent", color: tab === t.id ? "text.primary" : "text.secondary", "&:hover": { color: "text.primary" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
                >
                  {t.icon}
                  {t.label}
                </Box>
              ))}
            </Box>
          </Box>

          {/* Clip panel */}
          <Box id="xv-editor-clip-panel" role="tabpanel" component="section" aria-label="From the clip" sx={{ order: { xs: 4, lg: 0 }, flexShrink: 0, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", height: { xs: 440, lg: "auto" }, backgroundColor: "background.paper", borderRight: { lg: "1px solid" }, borderColor: "divider", ...(leftFolded && (wide ? foldedPanelSx : { display: "none" })) }}>
            {tab === "said" && <TranscriptPanel clip={clip} playing={playingLine} usedAt={draft.source.kind === "said" ? draft.source.at : null} onSeek={player.seek} onUse={pickTranscript} />}
            {tab === "clips" && <ClipsPanel clips={navClips} currentId={clip.id} onPick={onGo} />}
          </Box>

          {/* Stage */}
          <Box component="section" aria-label="Clip" sx={{ order: { xs: 1, lg: 0 }, flexShrink: 0, minWidth: 0, minHeight: 0, overflowY: { lg: "auto" }, backgroundColor: "#ECEEF1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: { lg: "center" }, gap: 1.5, p: { xs: 1.5, md: 2.5 } }}>
            {held && (
              <Alert
                severity="info"
                sx={{ width: "100%", maxWidth: 820, borderRadius: "8px", fontSize: "0.8125rem" }}
                action={
                  <Button color="inherit" size="small" onClick={onTakeOver} sx={{ textTransform: "none", fontWeight: 700 }}>
                    Take it over
                  </Button>
                }
              >
                {held} is editing this clip. You can watch and read it; Copy &amp; Mark Posted is off until you take it over.
              </Alert>
            )}
            {posted && (
              <Alert severity="success" sx={{ width: "100%", maxWidth: 820, borderRadius: "8px", fontSize: "0.8125rem" }}>
                Marked posted. Undo from the bar at the bottom within 5 minutes.
              </Alert>
            )}
            <ClipStage
              clip={clip}
              player={player}
              onOpenStudio={() => {
                player.pause();
                setStudio(true);
              }}
            />
          </Box>

          {/* Tweet */}
          <Box id="xv-editor-tweet-panel" component="section" aria-label="Tweet" sx={{ order: { xs: 2, lg: 0 }, flexShrink: 0, minWidth: 0, minHeight: 0, borderLeft: { lg: "1px solid" }, borderColor: "divider", backgroundColor: "background.paper", ...(rightFolded && foldedPanelSx) }}>
            <TweetPanel
              clip={clip}
              draft={draft}
              text={text}
              length={length}
              onPatch={onPatch}
              onRevert={() => onPatch(initialDraft(clip))}
              onReject={() => setRejecting(true)}
              onSave={() => {
                onPatch({ savedAt: new Date().toISOString() });
                setNotice("Draft saved on this desk (demo: not sent anywhere).");
              }}
              onSchedule={setScheduleAt}
            />
          </Box>

          {/* Panel edges: drag to resize, buttons to fold (desktop only); the post maker's own controls */}
          {wide && (
            <>
              <PanelResizeHandle panel={leftPanel} offset={EDITOR_PANELS.leftFixed + leftPanel.width} label="clip panel" controls="xv-editor-clip-panel" />
              {!rightPanel.collapsed && <PanelResizeHandle panel={rightPanel} offset={rightPanel.width} label="tweet panel" controls="xv-editor-tweet-panel" />}
              <FoldedPanelStrip panel={rightPanel} label="tweet panel" title={`Tweet · ${length}/${X_LIMIT}`} controls="xv-editor-tweet-panel" />
            </>
          )}
        </Box>
      </Box>

      <Menu anchorEl={scheduleAt} open={!!scheduleAt} onClose={() => setScheduleAt(null)}>
        {[15, 30, 60].map((m) => (
          <MenuItem
            key={m}
            onClick={() => {
              const at = new Date(Date.now() + m * 60_000);
              onPatch({ scheduledAt: at.toISOString() });
              setScheduleAt(null);
              setNotice(`Scheduled for ${at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}. A reminder only in this demo: posting stays by hand.`);
            }}
          >
            In {m < 60 ? `${m} minutes` : "1 hour"}
          </MenuItem>
        ))}
        {draft.scheduledAt && (
          <MenuItem
            onClick={() => {
              onPatch({ scheduledAt: undefined });
              setScheduleAt(null);
              setNotice("Schedule cleared.");
            }}
          >
            Clear the schedule
          </MenuItem>
        )}
      </Menu>

      <Dialog open={preview} onClose={() => setPreview(false)} maxWidth="sm" fullWidth aria-label="The post on X" slotProps={{ paper: { sx: { borderRadius: "16px", backgroundImage: "none" } } }}>
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography sx={{ fontWeight: 700 }}>See on X</Typography>
            <IconButton onClick={() => setPreview(false)} aria-label="Close" sx={{ ml: "auto" }}>
              <CloseIcon size={16} />
            </IconButton>
          </Box>
          <XPostPreview text={text} used={length} media={<ClipFrame id={clip.id} src={clip.src} fileName={clip.fileName} image={clip.poster} showMissing sx={isVertical(clip) ? { aspectRatio: "4 / 5" } : undefined} />} />
        </Box>
      </Dialog>

      <ReadyForXDialog
        open={!!ready}
        clip={clip}
        text={ready?.text ?? text}
        copied={!!ready?.copied}
        hasNext={!!nextId}
        onCopyAgain={async () => {
          const ok = await copy(ready?.text ?? text);
          setReady((r) => (r ? { ...r, copied: ok } : r));
        }}
        onNext={() => {
          setReady(null);
          if (nextId) onGo(nextId);
        }}
        onDone={() => {
          setReady(null);
          onClose();
        }}
      />

      <RejectClipDialog
        clip={rejecting ? clip : null}
        onClose={() => setRejecting(false)}
        onReject={(reason) => {
          setRejecting(false);
          onReject(reason);
        }}
      />

      <StudioModal
        open={studio}
        platform="X"
        aspect={isVertical(clip) ? "9:16" : "16:9"}
        draftId={`xvideos-${clip.id}`}
        story={{ id: clip.id, headline: draft.title || clip.fileName, media: [{ kind: "video", url: clip.src, fileName: clip.fileName, startAt: isVertical(clip) ? 0 : TV_LEAD_IN }] }}
        title={draft.title || clip.fileName}
        onClose={() => setStudio(false)}
      />

      <Snackbar open={!!notice} autoHideDuration={4000} onClose={() => setNotice(null)} message={notice} anchorOrigin={{ vertical: "top", horizontal: "center" }} />
    </>
  );
}
