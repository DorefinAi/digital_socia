"use client";

// The editor's left panel: what is said in the clip (timed transcript), what is shown on screen (frame grabs with
// the text read from them), and the other clips in the list. A click jumps the player there; ★ puts the line on
// line 1 of the tweet.

import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { LayoutGrid, Star } from "lucide-react";
import type { XvClip, XvScreenText, XvTranscriptLine } from "@/data/xVideosData";
import { ClipFrame, ScreenTextOverlay, XV_COLORS, isVertical } from "./ClipFrame";
import { fmtClock } from "./xvTitle";

const headSx = { px: 1.5, pt: 1.25, pb: 1, display: "flex", flexDirection: "column", gap: 1, borderBottom: "1px solid", borderColor: "divider" } as const;
const hintSx = { fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.4 } as const;
const starSx = { flexShrink: 0, minWidth: 0, minHeight: 24, px: 0.75, py: 0, borderRadius: "6px", fontSize: "0.6875rem", fontWeight: 700, textTransform: "none", color: "text.primary", borderColor: "divider", backgroundColor: "background.paper", gap: 0.4, whiteSpace: "nowrap" } as const;

function PanelHead({ title, aside, hint, children }: { title: string; aside: string; hint: string; children?: React.ReactNode }) {
  return (
    <Box sx={headSx}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography sx={{ ml: "auto", fontSize: "0.6875rem", color: "text.secondary" }}>{aside}</Typography>
      </Box>
      <Typography sx={hintSx}>{hint}</Typography>
      {children}
    </Box>
  );
}

function StarButton({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={on ? `${label}: on line 1` : `Use on line 1: ${label}`}
      aria-pressed={on}
      sx={starSx}
    >
      <Star size={11} fill={on ? "currentColor" : "none"} aria-hidden />
      {on ? "On line 1" : null}
    </Button>
  );
}

/** The line text with its highlight marked */
function Marked({ text, highlight }: { text: string; highlight?: string }) {
  const i = highlight ? text.indexOf(highlight) : -1;
  if (!highlight || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <Box component="mark" sx={{ backgroundColor: "#FFE58A", color: "inherit", borderRadius: "2px" }}>
        {highlight}
      </Box>
      {text.slice(i + highlight.length)}
    </>
  );
}

interface TranscriptProps {
  clip: XvClip;
  /** Index of the line playing, -1 before the first */
  playing: number;
  /** The line on line 1 of the tweet (its time), or null */
  usedAt: number | null;
  onSeek: (t: number) => void;
  onUse: (line: XvTranscriptLine) => void;
}

export function TranscriptPanel({ clip, playing, usedAt, onSeek, onUse }: TranscriptProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // The playing line stays in view
  useEffect(() => {
    if (playing < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${playing}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [playing]);

  return (
    <>
      <PanelHead title="Said in the clip" aside="Hindi · auto" hint="Click a line to jump there. ★ puts it on line 1 of the tweet (U uses the line playing).">
        {clip.heard.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.625 }}>
            <Typography component="span" sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary" }}>
              Heard
            </Typography>
            {clip.heard.map((h) => (
              <Box key={h} component="span" lang="hi" sx={{ px: 1, py: 0.25, borderRadius: "8px", border: "1px solid", borderColor: "divider", fontSize: "0.75rem", fontWeight: 600 }}>
                {h}
              </Box>
            ))}
          </Box>
        )}
      </PanelHead>
      <Box ref={listRef} role="list" aria-label="Transcript" sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {clip.readingProgress !== undefined && <Empty text={`Reading the clip… ${clip.readingProgress}%. The words said will show here.`} />}
        {clip.readingProgress === undefined && clip.transcript.length === 0 && <Empty text="No speech was found in this clip. Use On screen, or type line 1." />}
        {clip.transcript.map((line, i) => {
          const used = usedAt === line.at;
          const now = i === playing;
          return (
            <Box
              key={line.at}
              role="listitem"
              data-line={i}
              sx={{ display: "flex", gap: 1, px: 1.5, py: 0.875, borderBottom: "1px solid", borderColor: "divider", alignItems: "flex-start", backgroundColor: used ? XV_COLORS.tile : now ? "#F3F6FB" : "transparent", boxShadow: used ? "inset 3px 0 0 #000" : "none" }}
            >
              <Box
                component="button"
                type="button"
                onClick={() => onSeek(line.at)}
                aria-label={`Jump to ${fmtClock(line.at)}`}
                aria-current={now ? "true" : undefined}
                sx={{ flex: 1, minWidth: 0, display: "flex", gap: 1, alignItems: "flex-start", p: 0, border: 0, background: "none", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2, borderRadius: "4px" } }}
              >
                <Box component="span" sx={{ flexShrink: 0, width: 38, pt: "2px", fontFamily: "var(--font-mono), Consolas, monospace", fontSize: "0.6875rem", color: XV_COLORS.said }}>
                  {fmtClock(line.at)}
                </Box>
                <Box component="span" lang="hi" sx={{ fontSize: "0.8125rem", lineHeight: 1.5, fontWeight: now ? 600 : 400 }}>
                  <Marked text={line.text} highlight={line.highlight} />
                </Box>
              </Box>
              <StarButton on={used} onClick={() => onUse(line)} label={line.text} />
            </Box>
          );
        })}
      </Box>
    </>
  );
}

interface ScreenProps {
  clip: XvClip;
  time: number;
  usedId: string | null;
  onSeek: (t: number) => void;
  onUse: (g: XvScreenText) => void;
}

const FRAME_WHERE = { first: "Start", mid: "Middle", last: "End" } as const;

/**
 * The stills taken from a clip whose on-screen text is not read yet (text recognition is the backend phase): a
 * click jumps there. On a TV cut the text to read is the red headline bar and the BREAKING NEWS box, both of which
 * rotate through 3-4 lines of the story; a vertical digital short has word captions instead.
 */
function FrameGrabs({ clip, time, onSeek }: { clip: XvClip; time: number; onSeek: (t: number) => void }) {
  const [sheet, setSheet] = useState(false);
  const frames = clip.frames ?? [];
  const vertical = isVertical(clip);
  const reads = vertical ? "word captions" : "headline bar / breaking box";
  return (
    <>
      {frames.map((f) => {
        const showing = Math.abs(time - f.at) < 1;
        return (
          <Box key={f.where} role="listitem" sx={{ p: 0.75, borderRadius: "8px", border: "1px solid", borderColor: "divider", backgroundColor: "background.paper" }}>
            <Box component="button" type="button" onClick={() => onSeek(f.at)} aria-label={`Jump to ${fmtClock(f.at)}`} sx={{ display: "block", width: "100%", p: 0, border: 0, background: "none", cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>
              <ClipFrame id={clip.id} src={clip.src} fileName={clip.fileName} image={f.src} sx={{ borderRadius: "5px" }} />
            </Box>
            <Box sx={{ display: "flex", gap: 1, alignItems: "baseline", mt: 0.75 }}>
              <Box component="span" sx={{ flexShrink: 0, fontFamily: "var(--font-mono), Consolas, monospace", fontSize: "0.6875rem", color: showing ? XV_COLORS.said : "text.secondary", fontWeight: showing ? 700 : 400 }}>
                {fmtClock(f.at)}
              </Box>
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.75rem", lineHeight: 1.45 }}>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {FRAME_WHERE[f.where]}
                </Box>
                <Box component="span" sx={{ color: "text.secondary" }}>
                  {" "}
                  · {reads} (text not read yet)
                </Box>
              </Typography>
            </Box>
          </Box>
        );
      })}
      {clip.contactSheet && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Button size="small" variant="outlined" onClick={() => setSheet((s) => !s)} aria-expanded={sheet} startIcon={<LayoutGrid size={14} aria-hidden />} sx={{ alignSelf: "flex-start", minHeight: 32, borderRadius: "8px", textTransform: "none", fontWeight: 600, fontSize: "0.75rem", color: "text.primary", borderColor: "divider" }}>
            {sheet ? "Hide all frames" : "See all frames"}
          </Button>
          {sheet && <SheetImage src={clip.contactSheet} alt={`12 frames from ${clip.fileName}, evenly spaced, in a 4 by 3 grid`} />}
        </Box>
      )}
    </>
  );
}

function SheetImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Empty text="The frames sheet is not in public/xvideos-demo/real-frames/ on this machine." />;
  return <Box component="img" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} sx={{ display: "block", width: "100%", height: "auto", borderRadius: "6px", border: "1px solid", borderColor: "divider" }} />;
}

export function ScreenTextPanel({ clip, time, usedId, onSeek, onUse }: ScreenProps) {
  const unread = clip.screenText.length === 0 && (clip.frames?.length ?? 0) > 0;
  return (
    <>
      <PanelHead
        title="On screen"
        aside={unread ? `${clip.frames?.length} frames, text not read yet` : `${clip.screenText.length} found`}
        hint={
          unread
            ? isVertical(clip)
              ? "Stills from the start, middle and end. The word captions on them will be read here, then ★ puts one on line 1."
              : "Stills from the start, middle and end. The red headline bar and the BREAKING NEWS box rotate through 3–4 lines of the story; once read, each line shows here and ★ puts it on line 1."
            : "Text read from the frames: supers, tickers, name straps. ★ puts it on line 1."
        }
      />
      <Box role="list" aria-label={unread ? "Frames from the clip" : "Text read from the screen"} sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {clip.readingProgress !== undefined && <Empty text={`Reading the clip… ${clip.readingProgress}%. Supers and tickers will show here.`} />}
        {unread && <FrameGrabs clip={clip} time={time} onSeek={onSeek} />}
        {clip.readingProgress === undefined && clip.screenText.length === 0 && !unread && <Empty text="No text was read from the frames of this clip." />}
        {clip.screenText.map((g) => {
          const used = usedId === g.id;
          const showing = time >= g.at && time < g.at + 6;
          return (
            <Box key={g.id} role="listitem" sx={{ p: 0.75, borderRadius: "8px", border: "1px solid", borderColor: used ? "#000" : "divider", outline: used ? "1px solid #000" : "none", backgroundColor: used ? XV_COLORS.tile : "background.paper" }}>
              <Box component="button" type="button" onClick={() => onSeek(g.at)} aria-label={`Jump to ${fmtClock(g.at)}`} sx={{ display: "block", width: "100%", p: 0, border: 0, background: "none", cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 } }}>
                <ClipFrame id={clip.id} src={clip.src} fileName={clip.fileName} at={g.at + 0.5} sx={{ borderRadius: "5px" }}>
                  <ScreenTextOverlay text={g.text} box={g.box} kind={g.kind} showText boxed />
                </ClipFrame>
              </Box>
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", mt: 0.75 }}>
                <Box component="span" sx={{ flexShrink: 0, pt: "2px", fontFamily: "var(--font-mono), Consolas, monospace", fontSize: "0.6875rem", color: showing ? XV_COLORS.said : "text.secondary", fontWeight: showing ? 700 : 400 }}>
                  {fmtClock(g.at)}
                </Box>
                <Typography lang="hi" sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem", fontWeight: 700, lineHeight: 1.45 }}>
                  {g.text}
                </Typography>
                <StarButton on={used} onClick={() => onUse(g)} label={g.text} />
              </Box>
            </Box>
          );
        })}
      </Box>
    </>
  );
}

/** The other clips in the list, to jump to without going back to the desk */
export function ClipsPanel({ clips, currentId, onPick }: { clips: XvClip[]; currentId: string; onPick: (id: string) => void }) {
  return (
    <>
      <PanelHead title="Clips" aside={`${clips.length} in the list`} hint="J and K move to the next and previous clip." />
      <Box role="list" aria-label="Clips" sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {clips.map((c) => (
          <Box
            key={c.id}
            role="listitem"
            component="button"
            type="button"
            onClick={() => onPick(c.id)}
            aria-current={c.id === currentId ? "true" : undefined}
            sx={{ width: "100%", display: "flex", gap: 1, p: 1, border: 0, borderBottom: "1px solid", borderColor: "divider", background: c.id === currentId ? "rgba(0,0,0,0.06)" : "none", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", "&:hover": { backgroundColor: "action.hover" }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}
          >
            <ClipFrame id={c.id} src={c.src} fileName={c.fileName} image={c.poster} sx={{ width: 72, borderRadius: "4px", flexShrink: 0 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography lang="hi" sx={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {c.headline ?? c.suggestedHeadline ?? c.fileName}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <Typography sx={{ p: 2, fontSize: "0.8125rem", color: "text.secondary" }}>{text}</Typography>;
}
