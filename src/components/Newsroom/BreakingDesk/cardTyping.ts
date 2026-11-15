// What a key does while typing right on the card (TemplateCanvas's text box). Kept apart so it can be tested.

/**
 * - "editor": goes on to the editor untouched (Ctrl+S saves)
 * - "post": stops typing and goes on to the editor, which posts (Ctrl+Enter, as from anywhere else)
 * - "stop": stops typing and is kept from the editor, where Esc would close it
 * - "keep": stays in the text box (letters, arrows, Delete, and every key while an IME is composing)
 */
export type TypingKeyAction = "editor" | "post" | "stop" | "keep";

/** `key` as editorKeys' eventKey writes it ("mod+s", "mod+enter", "escape"...); `composing`: an IME is mid-word */
export function typingKeyAction(key: string, composing: boolean): TypingKeyAction {
  if (key === "mod+s") return "editor";
  if (composing) return "keep";
  if (key === "mod+enter") return "post";
  if (key === "escape") return "stop";
  return "keep";
}
