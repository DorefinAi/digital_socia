"use client";

// The studio's right-click menu, shared by the timeline, the preview canvas and the bins. Opens at the pointer,
// arrow-key navigable, nested submenus (→ / Enter opens, ← / Esc closes), shortcut hints from video/keymap.ts.
// Pair it with useSuppressBrowserMenu / <EditorMenuBoundary> so the browser's own menu never shows inside the
// editor, except in text fields (spellcheck, paste) and on Shift+right-click.

import { useCallback, useEffect, useRef, useState, type ComponentProps, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import { Box, Divider, ListSubheader, Menu, MenuItem, MenuList, Paper, Popper } from "@mui/material";
import { Check, ChevronRight } from "lucide-react";
import { isTextEntryTarget, shortcutLabel } from "../keymap";
import { S } from "../panels/studioTheme";

export type MenuEntry =
  | {
      kind?: "item";
      label: string;
      icon?: ReactNode;
      /** Keymap command id: its shortcut is shown on the right */
      command?: string;
      /** Literal hint when there is no command id */
      hint?: string;
      disabled?: boolean;
      danger?: boolean;
      /** Shows a tick (toggles and choices) */
      checked?: boolean;
      onSelect?: () => void;
      submenu?: MenuEntry[];
    }
  | { kind: "divider" }
  | { kind: "header"; label: string };

export interface MenuAnchor {
  x: number;
  y: number;
}

/** True when the browser's own menu should open: Shift held, or right-click in a text field */
export function wantsNativeMenu(e: Pick<MouseEvent, "shiftKey" | "target">): boolean {
  return e.shiftKey || isTextEntryTarget(e.target);
}

/**
 * Stop the browser's context menu anywhere inside `ref` (capture phase, so it holds for every child), except text
 * fields and Shift+right-click. Component handlers still get the event and open the editor menu.
 */
export function useSuppressBrowserMenu(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    // Listen on the document and test containment, so it works even when the element mounts after this effect
    const onMenu = (e: MouseEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && el.contains(e.target) && !wantsNativeMenu(e)) e.preventDefault();
    };
    document.addEventListener("contextmenu", onMenu, { capture: true });
    return () => document.removeEventListener("contextmenu", onMenu, { capture: true });
  }, [ref]);
}

/** A Box that suppresses the browser menu inside it (wrap the studio root with this) */
export function EditorMenuBoundary(props: ComponentProps<typeof Box>) {
  const ref = useRef<HTMLDivElement>(null);
  useSuppressBrowserMenu(ref);
  return <Box ref={ref} {...props} />;
}

const itemSx = { gap: 1.25, fontSize: "0.8125rem", minHeight: 30, py: 0.5, pr: 1.25 } as const;

function ItemBody({ entry, sub }: { entry: Extract<MenuEntry, { label: string; kind?: "item" }>; sub?: boolean }) {
  const hint = entry.command ? shortcutLabel(entry.command) : entry.hint;
  return (
    <>
      <Box component="span" sx={{ width: 16, display: "inline-flex", justifyContent: "center", color: entry.danger ? S.danger : S.muted, flexShrink: 0 }}>
        {entry.checked ? <Check size={13} /> : entry.icon}
      </Box>
      <Box component="span" sx={{ flex: 1, minWidth: 0, whiteSpace: "nowrap" }}>{entry.label}</Box>
      {hint && !sub && <Box component="span" sx={{ color: S.faint, fontSize: "0.6875rem", ml: 2 }}>{hint}</Box>}
      {sub && <ChevronRight size={13} color={S.muted} />}
    </>
  );
}

function Entries({ items, onDone, onBack }: { items: MenuEntry[]; onDone: () => void; onBack?: () => void }) {
  const [sub, setSub] = useState<{ i: number; el: HTMLLIElement } | null>(null);
  const openSub = sub?.i ?? null;
  const setOpenSub = (v: null) => setSub(v);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const openAt = (i: number, el: HTMLLIElement, delay = 0) => {
    window.clearTimeout(timer.current);
    const go = () => setSub({ i, el });
    if (delay) timer.current = window.setTimeout(go, delay);
    else go();
  };

  return items.map((entry, i) => {
    if (entry.kind === "divider") return <Divider key={`d${i}`} sx={{ my: "4px !important", borderColor: S.line }} />;
    if (entry.kind === "header") return <ListSubheader key={`h${i}`} sx={{ backgroundColor: "transparent", color: S.faint, fontSize: "0.6875rem", lineHeight: "24px" }}>{entry.label}</ListSubheader>;
    const hasSub = !!entry.submenu?.length;
    return (
      <MenuItem
        key={`${entry.label}${i}`}
        disabled={entry.disabled}
        aria-haspopup={hasSub ? "menu" : undefined}
        aria-expanded={hasSub ? openSub === i : undefined}
        onMouseEnter={(e) => (hasSub ? openAt(i, e.currentTarget, 120) : (window.clearTimeout(timer.current), setOpenSub(null)))}
        onClick={(e) => {
          if (hasSub) openAt(i, e.currentTarget);
          else {
            onDone();
            entry.onSelect?.();
          }
        }}
        onKeyDown={(e) => {
          if (hasSub && (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            e.stopPropagation();
            openAt(i, e.currentTarget);
          } else if (onBack && (e.key === "ArrowLeft" || e.key === "Escape")) {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }
        }}
        sx={{ ...itemSx, color: entry.danger ? S.danger : S.text, backgroundColor: openSub === i ? S.hover : undefined }}
      >
        <ItemBody entry={entry} sub={hasSub} />
        {hasSub && openSub === i && (
          <Popper open anchorEl={sub?.el} placement="right-start" sx={{ zIndex: 1400 }} onClick={(e) => e.stopPropagation()}>
            <Paper elevation={8} onContextMenu={(e: ReactMouseEvent) => e.preventDefault()} sx={{ backgroundColor: S.raised, border: `1px solid ${S.line}`, minWidth: 180, ml: "-4px" }}>
              <MenuList autoFocusItem dense>
                <Entries
                  items={entry.submenu!}
                  onDone={onDone}
                  onBack={() => {
                    const back = sub?.el;
                    setOpenSub(null);
                    back?.focus();
                  }}
                />
              </MenuList>
            </Paper>
          </Popper>
        )}
      </MenuItem>
    );
  });
}

/** Context menu at a pointer position. Selecting an item closes the menu, then runs it. */
export function EditorContextMenu({ anchor, items, onClose, label = "Options" }: { anchor: MenuAnchor | null; items: MenuEntry[]; onClose: () => void; label?: string }) {
  return (
    <Menu
      open={!!anchor && items.length > 0}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchor ? { top: anchor.y, left: anchor.x } : undefined}
      disableEnforceFocus
      transitionDuration={{ enter: 90, exit: 0 }}
      slotProps={{
        root: { onContextMenu: (e: ReactMouseEvent) => { e.preventDefault(); onClose(); } },
        paper: { sx: { backgroundColor: S.raised, border: `1px solid ${S.line}`, minWidth: 220 } },
        list: { dense: true, "aria-label": label },
      }}
    >
      {anchor && <Entries items={items} onDone={onClose} />}
    </Menu>
  );
}

/**
 * Menu state in one hook: `open(e, items)` from an onContextMenu handler (ignores Shift+right-click and text fields,
 * prevents the browser menu otherwise), and `element` to render once.
 */
export function useEditorMenu(label?: string) {
  const [state, setState] = useState<{ anchor: MenuAnchor; items: MenuEntry[] } | null>(null);
  const close = useCallback(() => setState(null), []);
  const open = useCallback((e: Pick<MouseEvent, "clientX" | "clientY" | "shiftKey" | "target" | "preventDefault">, items: MenuEntry[] | (() => MenuEntry[])) => {
    if (wantsNativeMenu(e)) return false;
    e.preventDefault();
    setState({ anchor: { x: e.clientX, y: e.clientY }, items: typeof items === "function" ? items() : items });
    return true;
  }, []);
  /** Open at a point without an event (a "⋮" button, keyboard) */
  const openAt = useCallback((anchor: MenuAnchor, items: MenuEntry[] | (() => MenuEntry[])) => {
    setState({ anchor, items: typeof items === "function" ? items() : items });
  }, []);
  const element = <EditorContextMenu anchor={state?.anchor ?? null} items={state?.items ?? []} onClose={close} label={label} />;
  return { open, openAt, close, element, isOpen: !!state };
}
