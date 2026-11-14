// Unit checks for keymap.ts eventKey and the desk's J/K lookups (editorKeys.ts). Run with the repo's "npm test".
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventKey } from "./keymap";
import { editorKeyFor, queueKeyFor } from "../editorKeys";

type Ev = Parameters<typeof eventKey>[0];
const ev = (key: string, code?: string, mods: Partial<Ev> = {}): Ev => ({ key, code, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
const kev = (key: string, code: string, mods: Partial<Ev> = {}) => ev(key, code, mods) as unknown as KeyboardEvent;

test("Latin layouts keep their own letters", () => {
  assert.equal(eventKey(ev("j", "KeyJ"), false), "j");
  assert.equal(eventKey(ev("J", "KeyJ", { shiftKey: true }), false), "shift+j");
  // AZERTY: the letter on the key wins over its QWERTY position
  assert.equal(eventKey(ev("a", "KeyQ"), false), "a");
  assert.equal(eventKey(ev("z", "KeyZ", { ctrlKey: true }), false), "mod+z");
});

test("Hindi (Inscript) layout: Devanagari letters map to the physical key", () => {
  assert.equal(eventKey(ev("र", "KeyJ"), false), "j");
  assert.equal(eventKey(ev("क", "KeyK"), false), "k");
  assert.equal(eventKey(ev("ऱ", "KeyJ", { shiftKey: true }), false), "shift+j");
  assert.equal(eventKey(ev("ॆ", "KeyZ", { ctrlKey: true }), false), "mod+z");
  assert.equal(eventKey(ev("१", "Digit1"), false), "1");
  // A shifted digit is a symbol in that layout too: read as that symbol (Shift folded), never as a digit
  assert.equal(eventKey(ev("ऍ", "Digit1", { shiftKey: true }), false), "ऍ");
});

test("IME placeholders and dead keys fall back to the physical letter", () => {
  assert.equal(eventKey(ev("Process", "KeyJ"), false), "j");
  assert.equal(eventKey(ev("Unidentified", "KeyK"), false), "k");
  assert.equal(eventKey(ev("Dead", "KeyE"), false), "e");
});

test("named keys and ASCII punctuation are untouched", () => {
  assert.equal(eventKey(ev("ArrowDown", "ArrowDown"), false), "arrowdown");
  assert.equal(eventKey(ev("Enter", "Enter"), false), "enter");
  assert.equal(eventKey(ev("Escape", "Escape"), false), "escape");
  assert.equal(eventKey(ev(" ", "Space"), false), "space");
  assert.equal(eventKey(ev("F10", "F10", { shiftKey: true }), false), "shift+f10");
  assert.equal(eventKey(ev("?", "Slash", { shiftKey: true }), false), "?");
  assert.equal(eventKey(ev("!", "Digit1", { shiftKey: true }), false), "!");
  assert.equal(eventKey(ev("/", "Slash"), false), "/");
  // Mac Option+X still reads as the letter
  assert.equal(eventKey(ev("≈", "KeyX", { altKey: true }), true), "alt+x");
});

test("queue: J/K with a Hindi layout and with Shift", () => {
  assert.equal(queueKeyFor(kev("j", "KeyJ"), true)?.id, "queue.next");
  assert.equal(queueKeyFor(kev("र", "KeyJ"), true)?.id, "queue.next");
  assert.equal(queueKeyFor(kev("क", "KeyK"), true)?.id, "queue.prev");
  assert.equal(queueKeyFor(kev("K", "KeyK", { shiftKey: true }), true)?.id, "queue.prev");
});

test("editor: J/K with a Hindi layout and with Shift; Shift does not take other combos", () => {
  assert.equal(editorKeyFor(kev("j", "KeyJ"))?.id, "story.next");
  assert.equal(editorKeyFor(kev("र", "KeyJ"))?.id, "story.next");
  assert.equal(editorKeyFor(kev("J", "KeyJ", { shiftKey: true }))?.id, "story.next");
  assert.equal(editorKeyFor(kev("K", "KeyK", { shiftKey: true }))?.id, "story.prev");
  assert.equal(editorKeyFor(kev("ऱ", "KeyJ", { shiftKey: true }))?.id, "story.next");
  // Shift+arrows stay the big nudge, not the plain nudge
  assert.equal(editorKeyFor(kev("ArrowLeft", "ArrowLeft", { shiftKey: true }))?.id, "box.nudgeBig");
  assert.equal(editorKeyFor(kev("Z", "KeyZ", { ctrlKey: true, shiftKey: true }))?.id, "edit.redo");
  assert.equal(editorKeyFor(kev("x", "KeyX")), undefined);
});
