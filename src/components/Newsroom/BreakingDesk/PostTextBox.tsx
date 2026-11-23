"use client";

// The post's text box and its counter, apart from the editor so a key press re-renders only this (PostEditor is
// thousands of lines: toolbars, the card, pickers, live presence). What is typed lives here and is shown and
// counted at once; the editor gets it a moment later (POST_TEXT_SYNC_MS, as a transition) for the preview,
// pickers, history and live presence, and at once (flushSync) before anything could act on it: a press of the
// pointer anywhere outside the box, an editor shortcut typed in the box, or leaving the box. postTextSync.ts says
// how text the editor puts in the box (story switch, undo, a tag pick, the server) comes back down.

import React, { memo, startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Box, LinearProgress, Paper, TextField, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { counterTone } from "./deskRules";
import { editorKeyFor } from "./editorKeys";
import { POST_TEXT_SYNC_MS, typedAhead } from "./postTextSync";
import { moveHighlight, notInText, replaceToken, tokenAtCaret, useTagSearch, type CaretTag, type TagSearchFn } from "./tagSearch";
import { searchHandles } from "../../../lib/socia/api";

const boxTagSearch: TagSearchFn = (q, kind, signal) => searchHandles(q, kind, signal);

export type PostTextBoxProps = {
  /** The editor's copy of the text */
  value: string;
  /** Goes up when the editor puts text in the box itself; only then does the box take `value` */
  nonce: number;
  /** Hands typing up to the editor, typed on top of its text number `nonce` (stable) */
  onTyped: (value: string, nonce: number) => void;
  /** Leaving the box: the editor settles the typed text into the exact layout that is copied */
  onSettle: (value: string) => void;
  /** What the counter shows for a text (the post as copied, weighted as the platform counts it) */
  count: (value: string) => number;
  /** Watch mode: someone else's live text, shown and counted instead of the person's own */
  watched: { text: string; used: number } | null;
  limit: number;
  isX: boolean;
  label: string;
  readOnly: boolean;
  /** Fixed height in lines; the box scrolls past it */
  rows: number;
  sx: SxProps<Theme>;
  inputRef: (el: HTMLTextAreaElement | null) => void;
  /** Drawn over the box (the holder's live caret in watch mode) */
  overlay?: React.ReactNode;
  /** After the count (watch mode's "read-only while … edits") */
  note?: React.ReactNode;
};

type HandUp = "transition" | "now" | "plain";

function PostTextBoxImpl({ value, nonce, onTyped, onSettle, count, watched, limit, isX, label, readOnly, rows, sx, inputRef, overlay, note }: PostTextBoxProps) {
  const [typed, setTyped] = useState(value);
  // The editor's text number this box has taken; a new one means the editor put text in the box
  const [seen, setSeen] = useState(nonce);
  let shownTyped = typed;
  if (seen !== nonce) {
    setSeen(nonce);
    setTyped(value);
    shownTyped = value;
  }

  // What the hand-up reads: event handlers and the timer can run before the next render, so the typing is written
  // here as it happens and the props after each commit
  const latest = useRef({ typed: shownTyped, nonce, value, onTyped });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxEl = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    latest.current = { typed: shownTyped, nonce, value, onTyped };
  });
  // The editor put text in the box: a hand-up still waiting holds the old text, so it is dropped
  useLayoutEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, [nonce]);

  const handUp = useCallback((how: HandUp) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const now = latest.current;
    // `value` is the editor's text as last rendered: a transition still on its way counts as not handed up yet
    if (!typedAhead(now.typed, now.value)) return;
    if (how === "now") flushSync(() => now.onTyped(now.typed, now.nonce));
    else if (how === "transition") startTransition(() => now.onTyped(now.typed, now.nonce));
    else now.onTyped(now.typed, now.nonce);
  }, []);

  // Any press outside the box (Copy & Mark Posted, Save, a tag, another story, the card) gives the editor the
  // typing first, synchronously, so the click that follows acts on exactly what is in the box
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && boxEl.current?.contains(e.target)) return;
      handUp("now");
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      // Leaving the page with typing still here (the editor closing keeps nothing; a box hidden alone keeps it)
      handUp("plain");
    };
  }, [handUp]);

  const setBox = useCallback(
    (el: HTMLTextAreaElement | null) => {
      boxEl.current = el;
      inputRef(el);
    },
    [inputRef],
  );

  // @ / # typed in the box: the same server lookup as the "Add handle" / "Add hashtag" pickers
  const [tag, setTag] = useState<CaretTag | null>(null);
  const [hi, setHi] = useState(0);
  const readTag = (el: HTMLTextAreaElement | null, text: string) => {
    const next = el && el.selectionStart === el.selectionEnd ? tokenAtCaret(text, el.selectionStart) : null;
    setTag((cur) => (cur?.start === next?.start && cur?.end === next?.end && cur?.query === next?.query ? cur : next));
    setHi(0);
  };
  // The editor replaced the text (Revert, a story switch): the old word's place no longer holds
  const [tagNonce, setTagNonce] = useState(nonce);
  if (tagNonce !== nonce) {
    setTagNonce(nonce);
    setTag(null);
  }
  const tagOn = !!tag && !readOnly && !watched;
  const found = useTagSearch(tag ? tag.prefix + tag.query : "", tag?.prefix ?? "@", boxTagSearch, tagOn);
  // The word being typed is not "already in the post": "#jaipur" typed out in full still offers #Jaipur
  const options = tag && tagOn ? notInText(found, shownTyped.slice(0, tag.start) + shownTyped.slice(tag.end)).slice(0, 8) : [];
  const pick = (value: string) => {
    if (!tag) return;
    const r = replaceToken(latest.current.typed, tag, value);
    setTyped(r.text);
    latest.current.typed = r.text;
    setTag(null);
    if (!timer.current) timer.current = setTimeout(() => handUp("transition"), POST_TEXT_SYNC_MS);
    requestAnimationFrame(() => {
      const el = boxEl.current;
      if (el) {
        el.focus();
        el.setSelectionRange(r.caret, r.caret);
      }
    });
  };

  const shown = watched ? watched.text : shownTyped;
  const used = watched ? watched.used : count(shownTyped);
  const tone = counterTone(used, limit, isX);

  return (
    <>
      <Box sx={{ position: "relative" }}>
        <TextField
          multiline
          fullWidth
          size="small"
          value={shown}
          onChange={(e) => {
            const next = e.target.value;
            setTyped(next);
            latest.current.typed = next;
            readTag(e.target as HTMLTextAreaElement, next);
            // Once per window, so a burst of keys costs the editor a few renders instead of one per key
            if (!timer.current) timer.current = setTimeout(() => handUp("transition"), POST_TEXT_SYNC_MS);
          }}
          // The editor's window listener (Ctrl+S, Ctrl+Enter…) runs after this; it must see the latest text.
          // Escape is included: the editor's Esc leaves the box and may close the editor.
          onSelect={(e) => readTag(e.target as HTMLTextAreaElement, latest.current.typed)}
          onKeyDown={(e) => {
            // Not while a Hindi keyboard is still composing: its Enter commits the word, not a suggestion
            if (options.length && !e.ctrlKey && !e.metaKey && !e.altKey && !e.nativeEvent.isComposing) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                setHi((h) => moveHighlight(h, options.length, e.key as "ArrowDown" | "ArrowUp"));
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                e.stopPropagation();
                pick(options[Math.min(Math.max(0, hi), options.length - 1)]!.value);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setTag(null);
                return;
              }
            }
            if (e.key === "Escape" || editorKeyFor(e.nativeEvent)) handUp("now");
          }}
          onBlur={() => {
            // Not flushSync: a blur can come from React removing the box. The update is discrete, so it is in
            // before the next event; settling reads the typed text itself, not the editor's older copy.
            setTag(null);
            handUp("plain");
            onSettle(latest.current.typed);
          }}
          inputRef={setBox}
          // A plain textarea of fixed height that scrolls: MUI's growing textarea measures itself (a forced
          // layout) on every render, which was about a fifth of each key press
          slotProps={{ input: { inputComponent: "textarea" }, htmlInput: { rows, "aria-label": label, readOnly } }}
          sx={sx}
        />
        {overlay}
        {options.length > 0 && (
          <Paper role="listbox" aria-label={tag?.prefix === "#" ? "Hashtag suggestions" : "Handle suggestions"} elevation={6} sx={{ position: "absolute", left: 0, right: 0, top: "100%", mt: 0.5, zIndex: 20, maxHeight: 260, overflowY: "auto", borderRadius: "8px", py: 0.5 }}>
            {options.map((o, n) => (
              <Box
                key={o.value}
                role="option"
                aria-selected={n === hi}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHi(n)}
                onClick={() => pick(o.value)}
                sx={{ px: 1.5, py: 0.75, cursor: "pointer", display: "flex", alignItems: "baseline", gap: 1, bgcolor: n === hi ? "action.hover" : "transparent" }}
              >
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{o.value}</Typography>
                {(o.nameHi || o.name) && <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary", minWidth: 0 }}>{o.nameHi || o.name}</Typography>}
              </Box>
            ))}
          </Paper>
        )}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 0.75 }}>
        <LinearProgress variant="determinate" value={Math.min(100, (used / limit) * 100)} color={tone} sx={{ flex: 1, height: 4, borderRadius: 2 }} />
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: `${tone}.main` }}>
          {used} / {limit}
          {note}
        </Typography>
      </Box>
    </>
  );
}

/** Re-renders on its own typing and when the editor re-renders it, never per key for the editor */
export const PostTextBox = memo(PostTextBoxImpl);
