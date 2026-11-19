// How the post box (PostTextBox) and the editor (PostEditor) share the post's text, kept pure so it can be
// unit-checked (postTextSync.test.ts).
//
// Typing re-renders only the box: it keeps what is typed and hands it to the editor a moment later (or at once,
// before any click or shortcut). The editor's copy carries a `nonce` that goes up whenever the editor puts text
// in the box itself (story switch, undo, a tag pick, settling, the server's text); the box takes the editor's
// text only then, so typing never loops back into the box or moves the caret.

/** The editor's copy of the post text, and how many times the editor has put text in the box */
export type BoxText = { text: string; nonce: number };

/** How long typing may run ahead of the editor before it is handed up (previews, pickers, history, live presence) */
export const POST_TEXT_SYNC_MS = 120;

/** The editor puts text in the box (story switch, undo, picker, settle, server): it wins over anything typed since */
export function putText(box: BoxText, text: string): BoxText {
  return { text, nonce: box.nonce + 1 };
}

/**
 * Typing handed up from the box, typed on top of the editor's text number `nonce`. Dropped when the editor has
 * put other text in the box since (a late hand-up from the last story must not land in the next one).
 */
export function takeTyped(box: BoxText, text: string, nonce: number): BoxText {
  if (box.nonce !== nonce || box.text === text) return box;
  return { text, nonce };
}

/** Whether the box holds typing the editor hasn't got yet, so an action must hand it up first */
export function typedAhead(typed: string, editorText: string): boolean {
  return typed !== editorText;
}
