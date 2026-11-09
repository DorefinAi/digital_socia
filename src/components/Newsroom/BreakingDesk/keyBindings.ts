"use client";

// Per-user keyboard shortcuts: the person's own keys from GET /me (prefs.keyBindings) laid over the defaults in
// editorKeys.ts. One small store outside React, so the desk's key handlers read the current keys at the moment
// a key is pressed, and a hook (useKeyBindings) so hints and tooltips re-render when someone saves new keys.
//
// Combo strings are the same as video/keymap.ts: lower case, modifiers first in the order mod, alt, shift
// ("j", "mod+enter", "shift+arrowdown", "?"). mod = Ctrl, Cmd on a Mac. An empty list turns an action off.

import { useSyncExternalStore } from "react";
import { isMac, keyLabel } from "./video/keymap";

/** Action id -> its combos (0 to 2). Only actions the person changed are listed; the rest keep their defaults. */
export type KeyBindingMap = Record<string, string[]>;

export const MAX_COMBOS = 2;

interface BindingState {
  overrides: KeyBindingMap;
  /** Bumped on every change, so lookups can cache by it */
  version: number;
}

const INITIAL: BindingState = { overrides: {}, version: 0 };
let state: BindingState = INITIAL;
const listeners = new Set<() => void>();

const MODIFIERS = ["mod", "alt", "shift"] as const;

/** The parts of a combo: "mod+shift+z" -> ["mod", "shift", "z"]; the plus key itself is "+" ("mod++"). */
export function comboParts(combo: string): string[] {
  if (combo === "+") return ["+"];
  const plusKey = combo.endsWith("++");
  const parts = (plusKey ? combo.slice(0, -2) : combo).split("+").filter(Boolean);
  if (plusKey) parts.push("+");
  return parts;
}

/** A combo in the one written form (modifiers first, in order, lower case), or null when it is not one */
export function normaliseCombo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const parts = comboParts(raw.trim().toLowerCase());
  if (!parts.length) return null;
  const key = parts[parts.length - 1];
  // The server treats mod as both Ctrl and Cmd (keys follow the person across Mac and Windows)
  const ALIAS: Record<string, string> = { ctrl: "mod", control: "mod", meta: "mod", cmd: "mod", command: "mod", option: "alt" };
  const mods = parts.slice(0, -1).map((m) => ALIAS[m] ?? m);
  if (new Set(mods).size !== mods.length) return null;
  if ((MODIFIERS as readonly string[]).includes(key)) return null;
  if (mods.some((m) => !(MODIFIERS as readonly string[]).includes(m))) return null;
  const ordered = MODIFIERS.filter((m) => mods.includes(m));
  return [...ordered, key].join("+");
}

/** Reads the server's map leniently: unknown shapes are dropped, each action keeps at most two distinct combos */
export function sanitizeBindings(raw: unknown): KeyBindingMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: KeyBindingMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const combos: string[] = [];
    for (const v of value) {
      const c = normaliseCombo(v);
      if (c && !combos.includes(c)) combos.push(c);
    }
    out[id] = combos.slice(0, MAX_COMBOS);
  }
  return out;
}

/** The same actions with the same keys in the same order */
export const sameMap = (a: KeyBindingMap, b: KeyBindingMap) => {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => b[k] && a[k].length === b[k].length && a[k].every((c, i) => c === b[k][i]));
};

/** Replaces the person's keys (from /me or a save); everything that shows or matches keys follows at once */
export function setKeyBindingOverrides(raw: unknown) {
  const next = sanitizeBindings(raw);
  if (sameMap(next, state.overrides)) return;
  state = { overrides: next, version: state.version + 1 };
  listeners.forEach((l) => l());
}

export const getKeyBindingState = () => state;

/** True when the person set their own keys for this action (including turning it off) */
export const hasOverride = (id: string) => Object.prototype.hasOwnProperty.call(state.overrides, id);

/** The keys that work now for an action: the person's own, else the defaults */
export function effectiveKeys(id: string, defaults: string[]): string[] {
  return hasOverride(id) ? state.overrides[id] : defaults;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller when the person's keys change; returns the current overrides */
export function useKeyBindings(): BindingState {
  return useSyncExternalStore(subscribe, getKeyBindingState, () => INITIAL);
}

// ─── Display ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Each part of a combo as its own keycap label: ["Ctrl", "Enter"], or ["⌘", "Enter"] on a Mac */
export function comboCaps(combo: string, mac = isMac()): string[] {
  return comboParts(combo).map((p) => (p === "+" ? "+" : keyLabel(p, mac)));
}

/** Spoken form for screen readers: "Control plus Shift plus Z" */
export function comboSpoken(combo: string, mac = isMac()): string {
  const names: Record<string, string> = {
    mod: mac ? "Command" : "Control", alt: mac ? "Option" : "Alt", shift: "Shift",
    arrowup: "Up arrow", arrowdown: "Down arrow", arrowleft: "Left arrow", arrowright: "Right arrow",
    "?": "Question mark", "+": "Plus", "-": "Minus", "=": "Equals", "/": "Slash", ",": "Comma", ".": "Period",
  };
  return comboParts(combo).map((p) => names[p] ?? keyLabel(p, mac)).join(" plus ");
}

const ARIA_NAMES: Record<string, string> = {
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight", enter: "Enter",
  escape: "Escape", space: "Space", delete: "Delete", backspace: "Backspace", home: "Home", end: "End",
  pageup: "PageUp", pagedown: "PageDown", contextmenu: "ContextMenu",
};

/** The aria-keyshortcuts value for a list of combos ("Control+Enter R"); undefined when there are none */
export function ariaKeyShortcuts(combos: string[], mac = isMac()): string | undefined {
  const out = combos.map((c) =>
    comboParts(c)
      .map((p) => {
        if (p === "mod") return mac ? "Meta" : "Control";
        if (p === "alt") return "Alt";
        if (p === "shift") return "Shift";
        if (ARIA_NAMES[p]) return ARIA_NAMES[p];
        if (/^f\d{1,2}$/.test(p)) return p.toUpperCase();
        return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
      })
      .join("+")
  );
  return out.length ? out.join(" ") : undefined;
}

// ─── What a person may bind ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Keys nobody can take: Esc closes dialogs, Tab moves between controls, and the browser keeps its own tab and
 * window keys (and the copy/paste keys every text box needs).
 */
const RESERVED: Record<string, string> = {
  escape: "Esc is kept for closing dialogs and leaving a box.",
  tab: "Tab moves between controls, so it can't be a shortcut.",
  "shift+tab": "Shift+Tab moves between controls, so it can't be a shortcut.",
  "mod+w": "The browser keeps this one to close the tab.",
  "mod+t": "The browser keeps this one for a new tab.",
  "mod+n": "The browser keeps this one for a new window.",
  "mod+shift+t": "The browser keeps this one to reopen a tab.",
  "mod+shift+n": "The browser keeps this one for a private window.",
  "mod+tab": "The browser keeps this one to switch tabs.",
  "mod+r": "The browser keeps this one to reload the page.",
  "mod+l": "The browser keeps this one for the address bar.",
  "mod+c": "Copy needs this one in every text box.",
  "mod+v": "Paste needs this one in every text box.",
  "mod+x": "Cut needs this one in every text box.",
  "mod+a": "Select all needs this one in every text box.",
  f5: "The browser keeps F5 to reload the page.",
  f12: "The browser keeps F12 for its developer tools.",
};

/**
 * Why a combo can't be used for an action, or null when it can. `global` actions also work while typing in a
 * box, so they need Ctrl/Cmd or Alt: a plain key there would type a letter and fire the shortcut at once.
 */
export function comboProblem(combo: string, global: boolean | undefined): string | null {
  if (RESERVED[combo]) return RESERVED[combo];
  const parts = comboParts(combo);
  if (global && !parts.includes("mod") && !parts.includes("alt")) {
    return `This one also works while you type in a box, so it needs ${isMac() ? "⌘" : "Ctrl"} or ${isMac() ? "⌥" : "Alt"} with the key.`;
  }
  return null;
}
