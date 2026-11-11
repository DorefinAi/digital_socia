// Keyboard shortcuts of the X post / card editor (PostEditor) and the X background layout (CardLayoutEditor).
// Same key strings as the Video Studio (video/keymap.ts: "mod+shift+z", "?", mod = Ctrl, Cmd on Mac), so both
// editors read the same way. The editor's key handler, the tooltips and the "Keyboard shortcuts" sheet all read
// this list, so a shortcut shown anywhere is the one that works. These are the defaults: a person can change most
// of them on their profile (keyBindings.ts), and every lookup below reads the keys that work for them now.

import { eventKey, isMac, isTextEntryTarget, keyLabel } from "./video/keymap";
import { effectiveKeys, getKeyBindingState, hasOverride } from "./keyBindings";

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
  /** Can't be changed on the profile (Esc, the arrow groups, the standard menu keys) */
  fixed?: boolean;
  /** The saved-keys id when it differs from `id` (phase 1's Copy & Mark Posted shares the Post action's keys) */
  bind?: string;
}

/** The desk's queue: J/K move (phase 1 also the up and down arrows), Enter or E opens, R rejects, / searches, ? lists the keys */
export const QUEUE_KEYS: EditorKey[] = [
  { id: "queue.next", label: "Next story", section: "Post", keys: ["j", "arrowdown"] },
  { id: "queue.prev", label: "Previous story", section: "Post", keys: ["k", "arrowup"] },
  { id: "queue.open", label: "Open the selected story", section: "Post", keys: ["enter", "e"] },
  { id: "queue.reject", label: "Reject the selected story", section: "Post", keys: ["r"] },
  { id: "queue.search", label: "Search", section: "Post", keys: ["/"] },
  { id: "queue.clear", label: "Clear the search", section: "Post", keys: ["escape"], fixed: true },
  { id: "queue.help", label: "Show these shortcuts", section: "Help", keys: ["?"] },
];

export const EDITOR_KEYS: EditorKey[] = [
  { id: "post.approve", label: "Post to X (as the Post button)", section: "Post", keys: ["mod+enter"], global: true },
  { id: "post.save", label: "Save draft", section: "Post", keys: ["mod+s"], global: true },
  { id: "editor.close", label: "Close the editor (asks about unsaved changes)", section: "Post", keys: ["escape"], fixed: true },
  { id: "story.next", label: "Next story (in the queue's order; saves first)", section: "Post", keys: ["j"] },
  { id: "story.prev", label: "Previous story (saves first)", section: "Post", keys: ["k"] },

  { id: "edit.undo", label: "Undo", section: "Edit", keys: ["mod+z"] },
  { id: "edit.redo", label: "Redo", section: "Edit", keys: ["mod+shift+z", "mod+y"] },

  { id: "box.nudge", label: "Move the selected text box by 1%", section: "Text box", keys: ["arrowleft", "arrowright", "arrowup", "arrowdown"], show: ["arrows"], fixed: true },
  { id: "box.nudgeBig", label: "Move it by 5%", section: "Text box", keys: ["shift+arrowleft", "shift+arrowright", "shift+arrowup", "shift+arrowdown"], show: ["shift+arrows"], fixed: true },
  { id: "box.resize", label: "Resize it from the bottom-right corner (Shift for 5%)", section: "Text box", keys: [], show: ["alt+arrows"], fixed: true },
  { id: "box.delete", label: "Delete the selected text box", section: "Text box", keys: ["delete", "backspace"] },
  { id: "box.menu", label: "Options for the selection (reset position or size, hide, layer order)", section: "Text box", keys: ["shift+f10", "contextmenu"], fixed: true },

  { id: "help.keys", label: "Show these shortcuts", section: "Help", keys: ["?"] },
];

/**
 * Phase 1's text editor (Phase1Editor): no card canvas and no X API posting, so Ctrl+Enter is Copy & Mark Posted
 * (the one main button, as Post to X is in phase 2).
 */
export const PHASE1_KEYS: EditorKey[] = [
  { id: "post.copyPosted", label: "Copy & Mark Posted (copies the post and moves it to Posted)", section: "Post", keys: ["mod+enter"], global: true, bind: "post.approve" },
  { id: "post.save", label: "Save the text now (it also saves by itself)", section: "Post", keys: ["mod+s"], global: true },
  { id: "editor.close", label: "Back to the desk", section: "Post", keys: ["escape"], fixed: true },
  { id: "help.keys", label: "Show these shortcuts", section: "Help", keys: ["?"] },
];

/** The keys that work now for a command: the person's own, else the defaults (fixed ones never change) */
export function keysOf(k: EditorKey): string[] {
  return k.fixed ? k.keys : effectiveKeys(k.bind ?? k.id, k.keys);
}

/** A combo -> command lookup for one list, rebuilt only when the person's keys change */
function lookup(list: EditorKey[]) {
  let version = -1;
  let map = new Map<string, EditorKey>();
  return (combo: string): EditorKey | undefined => {
    const v = getKeyBindingState().version;
    if (v !== version) {
      map = new Map();
      // Keys the person set on their profile first: a default (say J for a newer action) never takes a key
      // they already gave to something else
      const own = (k: EditorKey) => !k.fixed && hasOverride(k.bind ?? k.id);
      for (const k of list) if (own(k)) for (const key of keysOf(k)) if (!map.has(key)) map.set(key, k);
      for (const k of list) if (!own(k)) for (const key of keysOf(k)) if (!map.has(key)) map.set(key, k);
      version = v;
    }
    return map.get(combo);
  };
}

/** The keys of a command by id in a list (for aria-keyshortcuts and hints) */
export function keysById(list: EditorKey[], id: string): string[] {
  const cmd = list.find((b) => b.id === id);
  return cmd ? keysOf(cmd) : [];
}

const firstKeyLabel = (list: EditorKey[], id: string) => {
  const k = keysById(list, id)[0];
  return k ? keyLabel(k) : "";
};

const phase1Lookup = lookup(PHASE1_KEYS);

/** The phase 1 editor command for a keyboard event, or undefined */
export function phase1KeyFor(e: KeyboardEvent): EditorKey | undefined {
  return phase1Lookup(eventKey(e));
}

/** First key of a phase 1 command for tooltips: "Ctrl+Enter", or "" when the person turned it off */
export function phase1Shortcut(id: string): string {
  return firstKeyLabel(PHASE1_KEYS, id);
}

const queueLookup = lookup(QUEUE_KEYS);
const BARE_ARROWS = new Set(["arrowup", "arrowdown"]);

/**
 * The queue command for a keyboard event, or undefined. Shift with a bare key still counts as that key (Shift+J
 * moves, as before) unless the person gave the Shift combo a job of its own. Phase 2 has no arrow keys on the
 * queue unless the person set them.
 */
export function queueKeyFor(e: KeyboardEvent, phase1: boolean): EditorKey | undefined {
  const mac = isMac();
  // Ctrl on a Mac (Cmd elsewhere) is never part of a desk shortcut
  if (mac ? e.ctrlKey : e.metaKey) return undefined;
  const combo = eventKey(e, mac);
  let cmd = queueLookup(combo);
  if (!cmd && combo.startsWith("shift+") && !combo.slice(6).includes("+")) cmd = queueLookup(combo.slice(6));
  if (cmd && !phase1 && BARE_ARROWS.has(combo) && !hasOverride(cmd.id)) return undefined;
  return cmd;
}

/** The queue keys shown on screen (phase 2 leaves out the default arrows, which don't work there) */
export function queueKeysShown(id: string, phase1: boolean): string[] {
  const keys = keysById(QUEUE_KEYS, id);
  return phase1 || hasOverride(id) ? keys : keys.filter((k) => !BARE_ARROWS.has(k));
}

/** "Keyboard: J / K or ↑ / ↓ to move, Enter or E to open, R to reject.", from the keys that work now */
export function queueHint(phase1: boolean): string {
  const next = queueKeysShown("queue.next", phase1);
  const prev = queueKeysShown("queue.prev", phase1);
  const pairs: string[] = [];
  for (let i = 0; i < Math.max(next.length, prev.length); i++) {
    let pair = [next[i], prev[i]].filter((k): k is string => !!k);
    // The arrows read top to bottom
    if (pair[0] === "arrowdown" && pair[1] === "arrowup") pair = ["arrowup", "arrowdown"];
    pairs.push(pair.map((k) => keyLabel(k)).join(" / "));
  }
  const list = (id: string) => queueKeysShown(id, phase1).map((k) => keyLabel(k)).join(" or ");
  const open = list("queue.open");
  const reject = list("queue.reject");
  const parts = [pairs.length ? `${pairs.join(" or ")} to move` : "", open ? `${open} to open` : "", reject ? `${reject} to reject` : ""].filter(Boolean);
  return parts.length ? `Keyboard: ${parts.join(", ")}.` : "";
}

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

const editorLookup = lookup(EDITOR_KEYS);

/** The editor command for a keyboard event, or undefined */
export function editorKeyFor(e: KeyboardEvent): EditorKey | undefined {
  return editorLookup(eventKey(e));
}

/** First key of a command for tooltips: "Ctrl+Enter", or "" when the person turned it off */
export function editorShortcut(id: string): string {
  return firstKeyLabel(EDITOR_KEYS, id);
}

/** "Undo (Ctrl+Z)"; just "Undo" when the command has no key */
export function withEditorShortcut(label: string, id: string): string {
  const s = editorShortcut(id);
  return s ? `${label} (${s})` : label;
}

/** " (Ctrl+Enter)" to end a tooltip, or "" when the command has no key */
export function editorShortcutSuffix(id: string): string {
  const s = editorShortcut(id);
  return s ? ` (${s})` : "";
}

export interface KeyGroup {
  /** Keys clash only within one area: the queue's keys are off while the editor is open */
  area: "queue" | "editor";
  title: string;
  keys: EditorKey[];
}

/** Every action a person sees on their profile, by area. `phase1`: the Post action is Copy & Mark Posted. */
export function profileKeyGroups(phase1: boolean): KeyGroup[] {
  const post = EDITOR_KEYS.filter((k) => k.section === "Post").map((k) =>
    k.id === "post.approve" ? { ...k, label: phase1 ? "Copy & Mark Posted (copies the post and moves it to Posted)" : "Post to X" } : k
  );
  const editor = (section: EditorKeySection) => EDITOR_KEYS.filter((k) => k.section === section);
  return [
    { area: "queue", title: "Queue", keys: QUEUE_KEYS },
    { area: "editor", title: "Post", keys: post },
    { area: "editor", title: "Edit", keys: editor("Edit") },
    { area: "editor", title: "Text box", keys: editor("Text box") },
    { area: "editor", title: "Help", keys: editor("Help") },
  ];
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
  // A popover or menu over the editor (More text settings, a font list) keeps the bare keys for itself
  return !!el.closest?.(
    '.MuiPopover-root, [role="slider"], [role="menu"], [role="menubar"], [role="listbox"], [role="combobox"], [role="radiogroup"], [role="tab"], [role="tablist"], [role="toolbar"], [role="spinbutton"], [role="switch"], [role="tree"], [role="grid"]'
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
