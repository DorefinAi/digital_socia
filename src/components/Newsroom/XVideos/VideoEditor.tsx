"use client";

// The X Videos editor, full window like the X desk's: the dark top bar (← Desk, Prev (K), Next (J), See on X,
// Copy, Copy & Mark Posted), the left rail and panel (Clips / Said in clip / On screen), the clip playing in the
// centre with its trim bar, and the Tweet panel on the right. Keys: J/K next/prev clip, Space or L play, I/O set the
// trim, U puts the line playing on line 1, Esc back to the desk; none of them fire while typing.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, IconButton, Menu, MenuItem, Snackbar, Tooltip, Typography } from "@mui/material";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardCheck, Copy, Eye, Film, Mic, MonitorPlay, X as CloseIcon } from "lucide-react";
import type { XvClip, XvScreenText, XvTranscriptLine } from "@/data/xVideosData";
import VolumeStrip from "../BreakingDesk/VolumeStrip";
import XPostPreview from "../BreakingDesk/phase1/XPostPreview";
import { isTextEntryTarget } from "../BreakingDesk/video/keymap";
import { StudioModal } from "../BreakingDesk/video/panels/StudioLauncher";
import { XIcon } from "@/components/leftNavigation/aiContentPlatforms";
import { ClipFrame, XV_COLORS, isVertical } from "./ClipFrame";
import ClipStage from "./ClipStage";
import { draftBrand, initialDraft, prefixesFor, type UndoEntry, type XvDraft } from "./deskState";
import { ReadyForXDialog, RejectClipDialog, UndoBar } from "./PostFlow";
import { ClipsPanel, ScreenTextPanel, TranscriptPanel } from "./SourcePanels";
import TweetPanel from "./TweetPanel";
import { useClipPlayer } from "./useClipPlayer";
import { X_LIMIT } from "../BreakingDesk/socialText";
import { applyLabel, applyPrefix, assembleTagBlock, composeTweet, fitTitle, labelOf, lineAt, prefixOf, tweetLength } from "./xvTitle";

const BAR = { bg: XV_COLORS.bar, text: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.14)" };
const chromeBtnSx = { color: "#fff", borderRadius: "8px", minHeight: 36, minWidth: 0, px: 1.25, fontSize: "0.8125rem", fontWeight: 600, textTransform: "none", whiteSpace: "nowrap", border: `1px solid ${BAR.border}`, gap: 0.5, flexShrink: 0, "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" }, "&.Mui-disabled": { color: "rgba(255,255,255,0.35)" } } as const;
const cmpSx = { ...chromeBtnSx, border: "2px solid #fff", borderRadius: "12px", minHeight: 41, px: 2, fontWeight: 800, fontSize: "0.875rem", backgroundColor: "#111", "&.Mui-disabled": { color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.3)" } } as const;

type SideTab = "clips" | "said" | "screen";
const SIDE_TABS: { id: SideTab; label: string; icon: React.ReactNode }[] = [
  { id: "clips", label: "Clips", icon: <Film size={18} /> },
  { id: "said", label: "Said in clip", icon: <Mic size={18} /> },
  { id: "screen", label: "On screen", icon: <MonitorPlay size={18} /> },
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
  const [tab, setTab] = useState<SideTab>(() => (clip.transcript.length || !clip.screenText.length ? "said" : "screen"));
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState<{ copied: boolean; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [studio, setStudio] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<HTMLElement | null>(null);
  const [pickedGrab, setPickedGrab] = useState<string | null>(null);

  const player = useClipPlayer(clip.src, clip.duration, draft.trim);
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
  const pickGrab = useCallback(
    (g: XvScreenText) => {
      setPickedGrab(g.id);
      applyLine(g.text, { kind: "screen", at: g.at });
    },
    [applyLine],
  );

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

  const setTrim = useCallback((trim: { start: number; end: number }) => onPatch({ trim: { start: Math.max(0, trim.start), end: Math.min(player.duration, trim.end) } }), [onPatch, player.duration]);

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
      else if (k === "i") setTrim({ start: Math.min(player.time, draft.trim.end - 1), end: draft.trim.end });
      else if (k === "o") setTrim({ start: draft.trim.start, end: Math.max(player.time, draft.trim.start + 1) });
      else if (k === "u") {
        if (tab === "screen") {
          const g = [...clip.screenText].reverse().find((s) => s.at <= player.time + 0.05);
          if (g) pickGrab(g);
        } else if (playingLine >= 0) pickTranscript(clip.transcript[playingLine]);
      } else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDialog, nextId, prevId, onGo, onClose, player, draft.trim, setTrim, tab, clip, playingLine, pickGrab, pickTranscript]);

  const frameMarkers = (clip.frames ?? []).map((f) => ({ at: f.at, label: `Frame at ${f.at.toFixed(0)} s` }));
  const markers = tab === "screen" ? (clip.screenText.length ? clip.screenText.map((g) => ({ at: g.at, label: g.text })) : frameMarkers) : clip.transcript.filter((l) => l.worth).map((l) => ({ at: l.at, label: l.text }));
  const trimmed = draft.trim.start > 0.05 || draft.trim.end < clip.duration - 0.05 ? draft.trim : null;

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

        {/* Body */}
        <Box sx={{ flex: 1, minHeight: 0, display: { xs: "flex", lg: "grid" }, flexDirection: "column", gridTemplateColumns: "352px minmax(0, 1fr) 340px", overflowY: { xs: "auto", lg: "hidden" } }}>
          {/* Rail + source panel */}
          <Box component="section" aria-label="From the clip" sx={{ order: { xs: 3, lg: 0 }, flexShrink: 0, display: "flex", flexDirection: { xs: "column", lg: "row" }, minHeight: 0, borderRight: { lg: "1px solid" }, borderTop: { xs: "1px solid", lg: 0 }, borderColor: "divider", backgroundColor: "background.paper" }}>
            <Box role="tablist" aria-label="Source" aria-orientation="vertical" sx={{ display: "flex", flexDirection: { xs: "row", lg: "column" }, alignItems: "center", gap: 0.75, p: { xs: 0.75, lg: "10px 4px" }, width: { lg: 52 }, flexShrink: 0, borderRight: { lg: "1px solid" }, borderBottom: { xs: "1px solid", lg: 0 }, borderColor: "divider" }}>
              {SIDE_TABS.map((t) => (
                <Box
                  key={t.id}
                  component="button"
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  sx={{ width: { xs: "auto", lg: 44 }, px: { xs: 1.25, lg: 0 }, py: 0.875, display: "flex", flexDirection: { xs: "row", lg: "column" }, alignItems: "center", gap: 0.5, border: 0, borderRadius: "8px", font: "inherit", fontSize: "0.625rem", fontWeight: 600, lineHeight: 1.1, textAlign: "center", cursor: "pointer", backgroundColor: tab === t.id ? "#ECEEF0" : "transparent", color: tab === t.id ? "text.primary" : "text.secondary", "&:hover": { color: "text.primary" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
                >
                  {t.icon}
                  {t.label}
                </Box>
              ))}
            </Box>
            <Box role="tabpanel" sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, height: { xs: 440, lg: "auto" } }}>
              {tab === "said" && <TranscriptPanel clip={clip} playing={playingLine} usedAt={draft.source.kind === "said" ? draft.source.at : null} onSeek={player.seek} onUse={pickTranscript} />}
              {tab === "screen" && (
                <ScreenTextPanel
                  clip={clip}
                  time={player.time}
                  usedId={draft.source.kind === "screen" ? (clip.screenText.find((g) => draft.source.kind === "screen" && g.at === draft.source.at)?.id ?? null) : null}
                  onSeek={(t) => {
                    player.seek(t);
                    setPickedGrab(clip.screenText.find((g) => g.at === t)?.id ?? null);
                  }}
                  onUse={pickGrab}
                />
              )}
              {tab === "clips" && <ClipsPanel clips={navClips} currentId={clip.id} onPick={onGo} />}
            </Box>
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
              trim={draft.trim}
              onTrim={setTrim}
              markers={markers}
              markerColor={tab === "screen" ? XV_COLORS.ocr : XV_COLORS.said}
              showBoxes={tab === "screen"}
              pickedGrab={tab === "screen" ? pickedGrab : null}
              onOpenStudio={() => {
                player.pause();
                setStudio(true);
              }}
            />
          </Box>

          {/* Tweet */}
          <Box component="section" aria-label="Tweet" sx={{ order: { xs: 2, lg: 0 }, flexShrink: 0, minHeight: 0, borderLeft: { lg: "1px solid" }, borderColor: "divider", backgroundColor: "background.paper" }}>
            <TweetPanel
              clip={clip}
              draft={draft}
              text={text}
              length={length}
              onPatch={onPatch}
              onFit={() => onPatch({ title: fitTitle(draft.title, tagBlock) })}
              onRevert={() => onPatch({ ...initialDraft(clip), trim: draft.trim })}
              onReject={() => setRejecting(true)}
              onSave={() => {
                onPatch({ savedAt: new Date().toISOString() });
                setNotice("Draft saved on this desk (demo: not sent anywhere).");
              }}
              onSchedule={setScheduleAt}
            />
          </Box>
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
        trimmed={trimmed}
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
