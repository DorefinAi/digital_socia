"use client";

import { useEffect, useRef } from "react";
import { bindingForKey, eventKey, isTypingTarget } from "../keymap";
import { COMMANDS, findCommand, type CommandContext, type StudioCommand } from "./commands";

/** Run a command, reporting `done` or a failure through ctx.notify */
export function runCommand(cmd: StudioCommand, ctx: CommandContext) {
  try {
    const result = cmd.run(ctx);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(
        () => cmd.done && ctx.notify?.(cmd.done),
        (err: unknown) => ctx.notify?.(`${cmd.label} failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    } else if (cmd.done) ctx.notify?.(cmd.done);
  } catch (err) {
    ctx.notify?.(`${cmd.label} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Window-level editor shortcuts from video/keymap.ts. Every bound combo has its browser default prevented (Ctrl+S
 * never opens "Save page", Ctrl+D never bookmarks), whether or not the command can run right now. While typing in a
 * field only `global` bindings (save, export, palette) act; everything else is left to the field.
 * `extra` commands (the shell's: studio.save, studio.export, preview.fullscreen...) are matched by keymap id too.
 */
export function useTimelineShortcuts(ctx: CommandContext, enabled = true, extra: readonly StudioCommand[] = []) {
  const ref = useRef({ ctx, extra });
  useEffect(() => {
    ref.current = { ctx, extra };
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat && e.key === " ") return;
      const key = eventKey(e);
      const { ctx: current, extra: more } = ref.current;
      const all = more.length ? [...more, ...COMMANDS] : COMMANDS;
      const binding = bindingForKey(key);
      const cmd = findCommand(key, all);
      if (!binding && !cmd) return;
      if (isTypingTarget(e.target) && !binding?.global) return;
      // Space/Enter on a focused button presses it (keyboard users); clips are role=button but Space plays
      const el = e.target as HTMLElement | null;
      if (key === "space" && el?.closest?.("button, a, [role='button'], [role='menuitem']") && !el.hasAttribute("data-clip-id")) return;
      e.preventDefault();
      if (!cmd || (cmd.enabled && !cmd.enabled(current.store.getState(), current))) return;
      runCommand(cmd, current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
