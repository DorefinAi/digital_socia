// Keyboard shortcuts of the X post / card editor (PostEditor) and the X background layout (CardLayoutEditor).
// Same key strings as the Video Studio (video/keymap.ts: "mod+shift+z", "?", mod = Ctrl, Cmd on Mac), so both
// editors read the same way. The editor's key handler, the tooltips and the "Keyboard shortcuts" sheet all read
// this list, so a shortcut shown anywhere is the one that works.

import { eventKey, isMac, isTextEntryTarget, keyLabel } from "./video/keymap";

export { eventKey, isMac, isTextEntryTarget, keyLabel };

export type EditorKeySection = "Post" | "Edit" | "Text box" | "Help";

export interface EditorKey {
  id: string;
  label: string;
  section: EditorKeySection;
  /** Key strings the handler matches */
  keys: string[];
  /** Shown in the sheet instead of `keys` when they read better grouped ("←↑→↓") */
  show?: string[];
  /** Works even while typing in a field */
  global?: boolean;
}

export const EDITOR_KEYS: EditorKey[] = [
  { id: "post.approve", label: "Post to X (as the Post button)", section: "Post", keys: ["mod+enter"], global: true },
  { id: "post.save", label: "Save draft", section: "Post", keys: ["mod+s"], global: true },
  { id: "editor.close", label: "Close the editor (asks about unsaved changes)", section: "Post", keys: ["escape"] },

  { id: "edit.undo", label: "Undo", section: "Edit", keys: ["mod+z"] },
  { id: "edit.redo", label: "Redo", section: "Edit", keys: ["mod+shift+z", "mod+y"] },

  { id: "box.nudge", label: "Move the selected text box by 1%", section: "Text box", keys: ["arrowleft", "arrowright", "arrowup", "arrowdown"], show: ["arrows"] },
  { id: "box.nudgeBig", label: "Move it by 5%", section: "Text box", keys: ["shift+arrowleft", "shift+arrowright", "shift+arrowup", "shift+arrowdown"], show: ["shift+arrows"] },
  { id: "box.resize", label: "Resize it from the bottom-right corner (Shift for 5%)", section: "Text box", keys: [], show: ["alt+arrows"] },
  { id: "box.delete", label: "Delete the selected text box", section: "Text box", keys: ["delete", "backspace"] },
  { id: "box.menu", label: "Options for the selection (reset position or size, hide, layer order)", section: "Text box", keys: ["shift+f10", "contextmenu"] },

  { id: "help.keys", label: "Show these shortcuts", section: "Help", keys: ["?"] },
];

/** Not single keys; listed in the sheet */
export const EDITOR_POINTER_KEYS: { keys: string; label: string }[] = [
  { keys: "right-click", label: "Text box and card options" },
  { keys: "shift+right-click", label: "The browser's own menu" },
  { keys: "double-click", label: "Type in the text under the pointer" },
];

/**
 * After the editor opens its menu from the Menu key (or Shift+F10), the browser still sends its own
 * contextmenu event, which would close the editor's menu or open the browser's. Eat that one event.
 */
export function swallowNextContextMenu() {
  const eat = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    off();
  };
  const off = () => {
    document.removeEventListener("contextmenu", eat, true);
    window.clearTimeout(timer);
  };
  document.addEventListener("contextmenu", eat, true);
  const timer = window.setTimeout(off, 800);
}

/** Steps for the arrow keys, as shares of the card */
export const NUDGE = { small: 0.01, big: 0.05 } as const;

const byKey = new Map<string, EditorKey>();
for (const k of EDITOR_KEYS) for (const key of k.keys) byKey.set(key, k);

/** The editor command for a keyboard event, or undefined */
export function editorKeyFor(e: KeyboardEvent): EditorKey | undefined {
  return byKey.get(eventKey(e));
}

/** First key of a command for tooltips: "Ctrl+Enter" */
export function editorShortcut(id: string): string {
  const k = EDITOR_KEYS.find((b) => b.id === id)?.keys[0];
  return k ? keyLabel(k) : "";
}

/** "Undo (Ctrl+Z)" */
export function withEditorShortcut(label: string, id: string): string {
  const s = editorShortcut(id);
  return s ? `${label} (${s})` : label;
}

/** Display form of a sheet key, including the grouped arrow forms */
export function editorKeyLabel(key: string): string {
  if (key === "contextmenu") return "Menu key";
  const arrows = "←↑→↓";
  if (key === "arrows") return arrows;
  if (key.endsWith("+arrows")) return `${keyLabel(key.slice(0, -"+arrows".length) + "+x").slice(0, -1)}${arrows}`;
  if (key === "double-click") return "Double-click";
  if (key === "shift+right-click") return `${keyLabel("shift+x").slice(0, -1)}Right-click`;
  return keyLabel(key);
}

/** Spoken name of a sheet key: the arrow glyphs read as "arrow keys" */
export function editorKeyName(key: string): string | undefined {
  if (key === "arrows") return "Arrow keys";
  if (key.endsWith("+arrows")) return `${keyLabel(key.slice(0, -"+arrows".length) + "+x").slice(0, -1)} arrow keys`.replace("+ ", " plus ");
  return undefined;
}

/**
 * Where bare-key shortcuts must not fire: text entry, and widgets that use the arrows and letters themselves.
 * Unlike the studio's check this does not stop at role="dialog", since the whole editor is a dialog.
 */
export function isEditorTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (isTextEntryTarget(el) || el.tagName === "SELECT") return true;
  return !!el.closest?.(
    '[role="slider"], [role="menu"], [role="menubar"], [role="listbox"], [role="combobox"], [role="radiogroup"], [role="tab"], [role="tablist"], [role="toolbar"], [role="spinbutton"], [role="switch"], [role="tree"], [role="grid"]'
  );
}

/** Controls that take keys of their own (a focused button, link, toggle or any other focusable widget) */
const INTERACTIVE =
  'button, a[href], input, textarea, select, summary, [contenteditable="true"], [role="button"], [role="link"], [role="tab"], [role="slider"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"], [role="spinbutton"], [tabindex]:not([tabindex="-1"])';

/**
 * Where Delete, Backspace and the arrows may act on the card: focus inside the canvas stage, or on nothing in
 * particular (the page or the editor's own frame after a text box was left). Never on a focused control.
 */
export function isCanvasKeyTarget(target: EventTarget | null, stage: HTMLElement | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return true;
  if (stage && stage.contains(el)) return !isTextEntryTarget(el);
  if (el === document.body || el === document.documentElement) return true;
  return !el.closest?.(INTERACTIVE);
}
