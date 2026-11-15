import { test } from "node:test";
import assert from "node:assert/strict";
import { typingKeyAction } from "./cardTyping";

test("typing on the card: Ctrl+Enter stops typing and posts, Esc only stops typing, Ctrl+S saves", () => {
  assert.equal(typingKeyAction("mod+enter", false), "post");
  assert.equal(typingKeyAction("escape", false), "stop");
  assert.equal(typingKeyAction("mod+s", false), "editor");
  // Everything else stays in the text box: letters, arrows, Delete, plain Enter (a new line)
  for (const key of ["a", "arrowleft", "delete", "backspace", "enter", "shift+enter"]) assert.equal(typingKeyAction(key, false), "keep", key);
});

test("typing on the card: while an IME is composing nothing posts or stops typing; Ctrl+S still saves", () => {
  assert.equal(typingKeyAction("mod+enter", true), "keep");
  assert.equal(typingKeyAction("escape", true), "keep");
  assert.equal(typingKeyAction("mod+s", true), "editor");
});
