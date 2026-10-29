// The Video Studio keymap: one list of shortcuts, desktop-editor style (Premiere / Clipchamp habits; Cmd on Mac).
// The timeline's shortcut hook, the command palette, tooltips, context-menu hints and the "Keyboard shortcuts"
// sheet all read this file, so a shortcut shown anywhere is the one that works.
//
// Key strings: modifiers in the order mod, alt, shift, then the key as KeyboardEvent.key lower-cased
// ("mod+shift+z", "shift+arrowleft", "space", "?"). mod = Ctrl on Windows/Linux, Cmd on Mac.
// A command id here can be implemented by anyone: the timeline's COMMANDS, or a shell command passed to
// <Timeline extraCommands> with the same id (studio.save, studio.export, preview.fullscreen...).

export type KeySection = "File" | "Edit" | "Clip" | "Playback" | "Navigate" | "View";

export interface KeyBinding {
  /** Command id */
  id: string;
  label: string;
  section: KeySection;
  keys: string[];
  /** Works even while typing in a field (save, export, palette) */
  global?: boolean;
}

export const KEYMAP: KeyBinding[] = [
  // File
  { id: "studio.save", label: "Save now", section: "File", keys: ["mod+s"], global: true },
  { id: "studio.saveAs", label: "Save as a copy", section: "File", keys: ["mod+shift+s"], global: true },
  { id: "studio.export", label: "Export video", section: "File", keys: ["mod+e"], global: true },

  // Edit
  { id: "edit.undo", label: "Undo", section: "Edit", keys: ["mod+z"] },
  { id: "edit.redo", label: "Redo", section: "Edit", keys: ["mod+shift+z", "mod+y"] },
  { id: "edit.cut", label: "Cut", section: "Edit", keys: ["mod+x"] },
  { id: "edit.copy", label: "Copy", section: "Edit", keys: ["mod+c"] },
  { id: "edit.paste", label: "Paste at playhead", section: "Edit", keys: ["mod+v"] },
  { id: "edit.selectAll", label: "Select all clips", section: "Edit", keys: ["mod+a"] },
  { id: "edit.deselect", label: "Clear selection", section: "Edit", keys: ["escape", "mod+shift+a"] },
  { id: "edit.snapping", label: "Snapping on / off", section: "Edit", keys: ["n"] },

  // Clip
  { id: "clip.split", label: "Split at playhead", section: "Clip", keys: ["s", "mod+b"] },
  { id: "clip.delete", label: "Delete", section: "Clip", keys: ["delete", "backspace"] },
  { id: "clip.rippleDelete", label: "Ripple delete (close the gap)", section: "Clip", keys: ["shift+delete", "shift+backspace"] },
  { id: "clip.duplicate", label: "Duplicate", section: "Clip", keys: ["mod+d"] },

  // Playback
  { id: "play.toggle", label: "Play / pause", section: "Playback", keys: ["space", "k"] },
  { id: "preview.fullscreen", label: "Full-screen preview", section: "Playback", keys: ["f"] },

  // Navigate
  { id: "playhead.prevFrame", label: "Previous frame", section: "Navigate", keys: ["arrowleft"] },
  { id: "playhead.nextFrame", label: "Next frame", section: "Navigate", keys: ["arrowright"] },
  { id: "playhead.back1s", label: "Back 1 second", section: "Navigate", keys: ["shift+arrowleft", "j"] },
  { id: "playhead.fwd1s", label: "Forward 1 second", section: "Navigate", keys: ["shift+arrowright", "l"] },
  { id: "playhead.prevEdit", label: "Previous cut", section: "Navigate", keys: ["arrowup"] },
  { id: "playhead.nextEdit", label: "Next cut", section: "Navigate", keys: ["arrowdown"] },
  { id: "playhead.start", label: "Go to start", section: "Navigate", keys: ["home"] },
  { id: "playhead.end", label: "Go to end", section: "Navigate", keys: ["end"] },


  // View
  { id: "view.zoomIn", label: "Zoom in", section: "View", keys: ["=", "+"] },
  { id: "view.zoomOut", label: "Zoom out", section: "View", keys: ["-"] },
  { id: "view.fit", label: "Zoom to fit", section: "View", keys: ["shift+z"] },
  { id: "view.palette", label: "Find a command", section: "View", keys: ["mod+k"], global: true },
];

/** Shown in the shortcuts sheet: things that are not single keys */
export const POINTER_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "mod+wheel", label: "Zoom the timeline at the pointer" },
  { keys: "shift+wheel", label: "Scroll the timeline sideways" },
  { keys: "shift+click", label: "Add a clip to the selection (Ctrl/Cmd+click too)" },
  { keys: "alt+drag", label: "Move or trim without snapping" },
  { keys: "shift+right-click", label: "Open the browser's own menu" },
];

/** The browser keeps these for itself; a web page cannot take them over */
export const BROWSER_RESERVED: { keys: string; label: string }[] = [
  { keys: "mod+w", label: "Close the tab" },
  { keys: "mod+t", label: "New tab" },
  { keys: "mod+n", label: "New window" },
  { keys: "mod+tab", label: "Switch tabs" },
  { keys: "mod+shift+t", label: "Reopen a closed tab" },
];

// ---------------------------------------------------------------------------------------------------------------

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Key string for a keyboard event ("mod+shift+z"). Shift is folded into punctuation ("?" not "shift+/"). */
export function eventKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"> & { code?: string }, mac = isMac()): string {
  const mod = mac ? e.metaKey : e.ctrlKey;
  let key = e.key.toLowerCase();
  if (key === " " || key === "spacebar") key = "space";
  if (key === "del") key = "delete";
  // On Mac, Option+X types a symbol (≈): fall back to the physical letter
  if (e.altKey && e.code?.startsWith("Key") && !/^[a-z]$/.test(key)) key = e.code.slice(3).toLowerCase();
  const parts: string[] = [];
  if (mod) parts.push("mod");
  if (e.altKey) parts.push("alt");
  const punctuation = key.length === 1 && !/[a-z0-9]/.test(key);
  if (e.shiftKey && !punctuation) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

const byKey = new Map<string, KeyBinding>();
for (const b of KEYMAP) for (const k of b.keys) byKey.set(k, b);
const byId = new Map(KEYMAP.map((b) => [b.id, b]));

/** The binding for a key string, or undefined */
export function bindingForKey(key: string): KeyBinding | undefined {
  return byKey.get(key);
}

export function bindingFor(id: string): KeyBinding | undefined {
  return byId.get(id);
}

export function keysFor(id: string): string[] {
  return byId.get(id)?.keys ?? [];
}

const NAMES: Record<string, string> = {
  arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓", delete: "Del", backspace: "Backspace", escape: "Esc",
  space: "Space", home: "Home", end: "End", tab: "Tab", wheel: "Scroll", click: "Click", drag: "Drag", "right-click": "Right-click",
};

/** Display form: "Ctrl+Shift+Z" on Windows, "⌘⇧Z" on Mac */
export function keyLabel(key: string, mac = isMac()): string {
  return key.split("+").filter(Boolean).map((p) => {
    if (p === "mod") return mac ? "⌘" : "Ctrl";
    if (p === "shift") return mac ? "⇧" : "Shift";
    if (p === "alt") return mac ? "⌥" : "Alt";
    return NAMES[p] ?? (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1));
  }).join(mac ? "" : "+") || (key === "+" ? "+" : key);
}

/** First shortcut of a command for display, or "" */
export function shortcutLabel(id: string): string {
  const k = keysFor(id)[0];
  return k ? keyLabel(k) : "";
}

/** "Split at playhead (S)" for tooltips */
export function withShortcut(label: string, id: string): string {
  const s = shortcutLabel(id);
  return s ? `${label} (${s})` : label;
}

/** Text entry: shortcuts (except global ones) and the custom right-click menu stay out of the way */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return !["checkbox", "radio", "button", "range", "color", "submit", "reset", "file"].includes((el as HTMLInputElement).type);
  return false;
}

/** Where bare-key shortcuts must not fire: text entry, and widgets that use the arrows/letters themselves */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (isTextEntryTarget(el) || el.tagName === "SELECT") return true;
  return !!el.closest?.('[role="slider"], [role="menu"], [role="menubar"], [role="listbox"], [role="dialog"], [role="combobox"]');
}
