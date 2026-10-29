"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Box, Dialog, InputBase } from "@mui/material";
import { Search } from "lucide-react";
import { useStudio, type StudioState } from "../store";
import { COMMANDS, commandKeys, keyLabel, type CommandContext, type StudioCommand } from "./commands";
import { runCommand } from "./useTimelineShortcuts";
import { S } from "./layout";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  ctx: CommandContext;
  /** Extra commands from the shell (export, aspect switch...) shown with the timeline's */
  extra?: StudioCommand[];
}

/** Every word of the query must start a word of the label/keywords (or appear inside it) */
function matches(c: StudioCommand, q: string): number {
  if (!q) return 1;
  const hay = `${c.label} ${c.section} ${c.keywords ?? ""}`.toLowerCase();
  let score = 0;
  for (const word of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const at = hay.indexOf(word);
    if (at < 0) return 0;
    score += at === 0 || hay[at - 1] === " " ? 2 : 1;
  }
  return score;
}

// Re-render on edits that change which commands are enabled, not on every playhead tick
const enabledKey = (s: StudioState) => `${s.past.length}|${s.future.length}|${s.selection.join(",")}|${s.selectedTrackId}|${s.zoom}|${s.project.tracks.length}|${Math.round(s.playhead * 10)}`;

function PaletteBody({ onClose, ctx, extra }: Omit<CommandPaletteProps, "open">) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  // The dialog's focus trap focuses its container first; take focus once it has settled
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  useStudio(enabledKey);
  const state = ctx.store.getState();

  const items = useMemo(() => {
    const all = [...(extra ?? []), ...COMMANDS];
    return all
      .map((c) => ({ c, score: matches(c, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [query, extra]);

  const isEnabled = (c: StudioCommand) => !c.enabled || c.enabled(state, ctx);
  const current = Math.min(active, Math.max(0, items.length - 1));

  const run = (c: StudioCommand | undefined) => {
    if (!c || !isEnabled(c)) return;
    onClose();
    // Let the dialog close (focus returns) before the command runs, so it can open its own UI
    window.setTimeout(() => runCommand(c, ctx), 0);
  };

  const move = (delta: number) => {
    if (!items.length) return;
    const next = (current + delta + items.length) % items.length;
    setActive(next);
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[current]); }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", maxHeight: "min(520px, 70vh)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, height: 48, borderBottom: `1px solid ${S.line}` }}>
        <Search size={16} aria-hidden color={S.muted} />
        <InputBase
          autoFocus
          inputRef={inputRef}
          fullWidth
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder="Type a command, like split or crossfade"
          inputProps={{ "aria-label": "Search commands", role: "combobox", "aria-expanded": true, "aria-controls": listId, "aria-activedescendant": items[current] ? `${listId}-${current}` : undefined }}
          sx={{ fontSize: "0.9375rem", color: S.text }}
        />
      </Box>
      <Box component="ul" id={listId} ref={listRef} role="listbox" aria-label="Commands" sx={{ listStyle: "none", m: 0, p: 0.5, overflowY: "auto" }}>
        {items.length === 0 && <Box component="li" sx={{ px: 1.5, py: 2, color: S.muted, fontSize: "0.8125rem" }}>No command matches “{query}”. Try split, delete or zoom.</Box>}
        {items.map((c, i) => {
          const on = isEnabled(c);
          const isActive = i === current;
          return (
            <Box
              component="li"
              key={c.id}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={isActive}
              aria-disabled={!on}
              onMouseMove={() => active !== i && setActive(i)}
              onClick={() => run(c)}
              sx={{
                display: "flex", alignItems: "center", gap: 1.5, px: 1.25, height: 34, borderRadius: "5px", cursor: on ? "pointer" : "default",
                color: on ? S.text : S.faint, backgroundColor: isActive ? S.hover : "transparent", fontSize: "0.8125rem",
              }}
            >
              <Box component="span" sx={{ width: 64, flexShrink: 0, color: S.faint, fontSize: "0.6875rem" }}>{c.section}</Box>
              <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</Box>
              {commandKeys(c)[0] && (
                <Box component="kbd" sx={{ fontFamily: "inherit", fontSize: "0.6875rem", color: S.muted, px: 0.75, py: 0.125, border: `1px solid ${S.line}`, borderRadius: "4px", backgroundColor: S.chrome }}>
                  {keyLabel(commandKeys(c)[0])}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Ctrl+K: search every timeline action by name and run it */
export function CommandPalette({ open, onClose, ctx, extra }: CommandPaletteProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-label="Command palette"
      slotProps={{ paper: { sx: { backgroundColor: S.panel, border: `1px solid ${S.line}`, alignSelf: "flex-start", mt: "12vh", backgroundImage: "none" } } }}
    >
      {open && <PaletteBody onClose={onClose} ctx={ctx} extra={extra} />}
    </Dialog>
  );
}
