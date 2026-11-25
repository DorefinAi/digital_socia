"use client";

// The editor's left panel: what is said in the clip (timed transcript) and the other clips. A click on a line jumps
// the player there; ★ puts the line on line 1 of the tweet. The clips show as the share's own folder tree (day, then shift folder), like a code editor's
// file explorer, because the desk's file names and folders are not consistent enough to read as a flat list.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { ChevronDown, ChevronRight, FileVideo, Folder, FolderOpen, Star } from "lucide-react";
import type { XvClip, XvTranscriptLine } from "../data/xVideosData";
import { XV_COLORS } from "./ClipFrame";
import { fmtClock } from "./xvTitle";

const headSx = { px: 1.5, pt: 1.25, pb: 1, display: "flex", flexDirection: "column", gap: 1, borderBottom: "1px solid", borderColor: "divider" } as const;
const hintSx = { fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.4 } as const;
const starSx = { flexShrink: 0, minWidth: 0, minHeight: 24, px: 0.75, py: 0, borderRadius: "6px", fontSize: "0.6875rem", fontWeight: 700, textTransform: "none", color: "text.primary", borderColor: "divider", backgroundColor: "background.paper", gap: 0.4, whiteSpace: "nowrap" } as const;

/**
 * Scrolls `el` into view inside `list` only. scrollIntoView would also scroll the page, which on a phone (panels
 * stacked under the video) pushes the video off screen on every line change.
 */
function keepInView(list: HTMLElement | null, el: HTMLElement | null) {
  if (!list || !el) return;
  const box = list.getBoundingClientRect();
  const row = el.getBoundingClientRect();
  if (row.top < box.top) list.scrollTop -= box.top - row.top;
  else if (row.bottom > box.bottom) list.scrollTop += row.bottom - box.bottom;
}

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
    keepInView(listRef.current, listRef.current?.querySelector<HTMLElement>(`[data-line="${playing}"]`) ?? null);
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

/** A folder on the share, with its sub-folders and clips */
interface FolderNode {
  name: string;
  /** "21-11-2026/3 pm convert", the key for collapsing */
  path: string;
  folders: FolderNode[];
  files: XvClip[];
}

/** Clips grouped by their folder on the share; folders and files sorted by name, as a file explorer does */
function folderTree(clips: XvClip[]): FolderNode {
  const root: FolderNode = { name: "", path: "", folders: [], files: [] };
  for (const c of clips) {
    let node = root;
    for (const part of c.folder) {
      const path = node.path ? `${node.path}/${part}` : part;
      let next = node.folders.find((f) => f.name === part);
      if (!next) {
        next = { name: part, path, folders: [], files: [] };
        node.folders.push(next);
      }
      node = next;
    }
    node.files.push(c);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
  const sort = (n: FolderNode) => {
    n.folders.sort((a, b) => byName(a.name, b.name));
    n.files.sort((a, b) => byName(nameOf(a), nameOf(b)));
    n.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** The name on the share, or the file name for a clip that has none */
const nameOf = (c: XvClip) => c.shareName ?? c.fileName;
/** The clips in the order the tree draws them (folders first, then files, by name), for J / K */
export function treeOrder(clips: XvClip[]): XvClip[] {
  const out: XvClip[] = [];
  const walk = (n: FolderNode) => {
    n.folders.forEach(walk);
    out.push(...n.files);
  };
  walk(folderTree(clips));
  return out;
}

const countFiles = (n: FolderNode): number => n.files.length + n.folders.reduce((sum, f) => sum + countFiles(f), 0);
const ROW_H = 26;
const INDENT = 14;
const rowSx = { width: "100%", height: ROW_H, display: "flex", alignItems: "center", gap: 0.5, pr: 1, border: 0, background: "none", font: "inherit", fontSize: "0.8125rem", color: "inherit", textAlign: "left", cursor: "pointer", whiteSpace: "nowrap", "&:hover": { backgroundColor: "action.hover" }, "&:focus-visible": { outline: "1px solid", outlineColor: "primary.main", outlineOffset: -1 } } as const;

export function ClipsPanel({ clips, currentId, onPick }: { clips: XvClip[]; currentId: string; onPick: (id: string) => void }) {
  // Rebuilt only when the list changes, not on every tick of the player
  const root = useMemo(() => folderTree(clips), [clips]);
  const navRef = useRef<HTMLDivElement>(null);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const currentRef = useRef<HTMLButtonElement>(null);
  // The panel is rebuilt for each clip (the editor body is keyed by clip), so folders start open and the open clip's
  // row is always there to scroll to
  useEffect(() => {
    keepInView(navRef.current, currentRef.current);
  }, [currentId]);
  const flip = (path: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderFolder = (node: FolderNode, depth: number): React.ReactNode => {
    const open = !closed.has(node.path);
    return (
      <Box component="li" key={node.path} sx={{ listStyle: "none" }}>
        <Box component="button" type="button" onClick={() => flip(node.path)} aria-expanded={open} title={node.path} sx={{ ...rowSx, pl: `${4 + depth * INDENT}px`, fontWeight: 600 }}>
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          {open ? <FolderOpen size={15} color="#C09553" aria-hidden /> : <Folder size={15} color="#C09553" aria-hidden />}
          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {node.name}
          </Box>
          <Box component="span" sx={{ ml: "auto", pl: 1, fontSize: "0.6875rem", fontWeight: 400, color: "text.secondary" }}>
            {countFiles(node)}
          </Box>
        </Box>
        {open && renderChildren(node, depth + 1)}
      </Box>
    );
  };

  const renderChildren = (node: FolderNode, depth: number) => (
    // The vertical guide line under an open folder, as in a code editor's explorer
    <Box component="ul" sx={{ m: 0, p: 0, position: "relative", "&::before": depth > 0 ? { content: '""', position: "absolute", top: 0, bottom: 0, left: `${11 + (depth - 1) * INDENT}px`, borderLeft: "1px solid", borderColor: "divider" } : undefined }}>
      {node.folders.map((f) => renderFolder(f, depth))}
      {node.files.map((c) => {
        const current = c.id === currentId;
        return (
          <Box component="li" key={c.id} sx={{ listStyle: "none" }}>
            <Box
              component="button"
              type="button"
              ref={current ? currentRef : undefined}
              onClick={() => onPick(c.id)}
              aria-current={current ? "true" : undefined}
              title={`${nameOf(c)}
${c.headline ?? c.suggestedHeadline ?? ""}`.trim()}
              sx={{ ...rowSx, pl: `${4 + depth * INDENT + 14}px`, backgroundColor: current ? "rgba(26,95,180,0.12)" : "transparent", fontWeight: current ? 600 : 400 }}
            >
              <FileVideo size={14} color="#7A5AF8" aria-hidden style={{ flexShrink: 0 }} />
              <Box component="span" lang="hi" sx={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {nameOf(c)}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  return (
    <>
      <PanelHead title="Clips" aside={`${clips.length} in the folder`} hint="As saved on the share. J and K move to the next and previous clip." />
      <Box ref={navRef} role="navigation" aria-label="Clip folders" sx={{ flex: 1, minHeight: 0, overflow: "auto", py: 0.5 }}>
        {renderChildren(root, 0)}
      </Box>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <Typography sx={{ p: 2, fontSize: "0.8125rem", color: "text.secondary" }}>{text}</Typography>;
}
