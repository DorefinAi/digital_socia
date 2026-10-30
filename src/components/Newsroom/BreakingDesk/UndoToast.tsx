"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Box, Typography, Button, IconButton, Tooltip } from "@mui/material";
import { Check, Copy, ExternalLink, X as CloseIcon } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { PLATFORM_META } from "./shared";
import { useLiveDesk } from "./live/LiveDesk";
import { eventKey, isTextEntryTarget, keyLabel } from "./video/keymap";

const stackSx = { position: "fixed", left: { xs: 12, lg: 24 }, bottom: 24, zIndex: 1400, display: "flex", flexDirection: "column", gap: 1, width: { xs: "calc(100% - 96px)", sm: 380 } } as const;
const toastSx = { display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, borderRadius: "10px", backgroundColor: "#18181B", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" } as const;

/** Bottom-left stack: a countdown with Undo while a post is held, then its live link once it has gone out. */
export default function UndoToast() {
  return useLiveDesk() ? <LiveUndoToast /> : <DemoUndoToast />;
}

function DemoUndoToast() {
  const { pendingPosts, undoPost, dismissPending } = useNewsroom();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingPosts.some((p) => !p.post)) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [pendingPosts]);

  if (!pendingPosts.length) return null;

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
    } catch {
      // Clipboard unavailable; the open button still works
    }
  };

  return (
    <Box role="status" aria-live="polite" sx={{ position: "fixed", left: { xs: 12, lg: 24 }, bottom: 24, zIndex: 1400, display: "flex", flexDirection: "column", gap: 1, width: { xs: "calc(100% - 96px)", sm: 380 } }}>
      {pendingPosts.map((p) => {
        const meta = PLATFORM_META[p.payload.platform];
        const left = Math.max(0, Math.ceil((new Date(p.sendAt).getTime() - now) / 1000));
        return (
          <Box key={p.id} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1, borderRadius: "10px", backgroundColor: "#18181B", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                {p.post ? `Posted to ${meta.short}` : `Posting to ${meta.short} in ${left}s`}
              </Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.payload.headline}</Typography>
            </Box>
            {p.post ? (
              <>
                <Tooltip title={copied === p.id ? "Copied" : "Copy link"}>
                  <IconButton size="small" onClick={() => copy(p.id, p.post!.postUrl)} aria-label="Copy post link" sx={{ color: "#fff" }}>
                    {copied === p.id ? <Check size={15} /> : <Copy size={15} />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Open post">
                  <IconButton size="small" component="a" href={p.post.postUrl} target="_blank" rel="noopener noreferrer" aria-label="Open post" sx={{ color: "#fff" }}>
                    <ExternalLink size={15} />
                  </IconButton>
                </Tooltip>
                <IconButton size="small" onClick={() => dismissPending(p.id)} aria-label="Dismiss" sx={{ color: "rgba(255,255,255,0.6)" }}>
                  <CloseIcon size={15} />
                </IconButton>
              </>
            ) : (
              <Button size="small" onClick={() => undoPost(p.id)} sx={{ minHeight: 30, color: "#FFD400", fontWeight: 700 }}>
                Undo
              </Button>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** The same stack on the live desk: the server holds the post for 10 seconds, Undo cancels the job. */
function LiveUndoToast() {
  const desk = useLiveDesk();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const pending = desk?.pending ?? [];
  const counting = pending.some((p) => !p.outcome && !p.copied);

  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [counting]);

  // Ctrl+Z (Cmd+Z) undoes the newest Copy & Posted while its toast is up, from anywhere but a text box
  const latestCopied = [...pending].reverse().find((p) => p.copied)?.id ?? null;
  const undo = useCallback(
    async (id: string) => {
      if (!desk) return;
      const error = await desk.undo(id);
      if (error) setFailed((f) => ({ ...f, [id]: error }));
    },
    [desk],
  );
  useEffect(() => {
    if (!latestCopied) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || eventKey(e) !== "mod+z" || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      void undo(latestCopied);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [latestCopied, undo]);

  if (!desk || !pending.length) return null;

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
    } catch {
      // Clipboard unavailable; the open button still works
    }
  };

  return (
    <Box role="status" aria-live="polite" sx={stackSx}>
      {pending.map((p) => {
        // Phase 1 Copy & Posted: already in Posted; Undo puts it back in the queue
        if (p.copied) {
          return (
            <Box key={p.id} sx={toastSx}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{p.copied.withCard ? "Copied, card saved, moved to Posted" : "Copied and moved to Posted"}</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: failed[p.id] ? "#FF8A80" : "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{failed[p.id] ?? `Paste it into X now. ${keyLabel("mod+z")} to undo`}</Typography>
              </Box>
              <Button size="small" onClick={() => void undo(p.id)} aria-keyshortcuts="Control+Z Meta+Z" sx={{ minHeight: 30, color: "#FFD400", fontWeight: 700 }}>
                Undo
              </Button>
              <IconButton size="small" onClick={() => desk.dismiss(p.id)} aria-label="Dismiss" sx={{ color: "rgba(255,255,255,0.6)" }}>
                <CloseIcon size={15} />
              </IconButton>
            </Box>
          );
        }
        const left = Math.max(0, Math.ceil((new Date(p.sendAt).getTime() - now) / 1000));
        const posted = p.outcome?.kind === "posted" ? p.outcome : null;
        const title = posted ? "Posted to X" : p.outcome?.kind === "failed" ? "Not posted" : left > 0 ? `Posting to X in ${left}s` : "Posting to X";
        const detail = p.outcome?.kind === "failed" ? p.outcome.message : failed[p.id] ?? p.headline;
        return (
          <Box key={p.id} sx={toastSx}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>{title}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: p.outcome?.kind === "failed" || failed[p.id] ? "#FF8A80" : "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</Typography>
            </Box>
            {posted?.permalink ? (
              <>
                <Tooltip title={copied === p.id ? "Copied" : "Copy link"}>
                  <IconButton size="small" onClick={() => copy(p.id, posted.permalink)} aria-label="Copy post link" sx={{ color: "#fff" }}>
                    {copied === p.id ? <Check size={15} /> : <Copy size={15} />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Open post">
                  <IconButton size="small" component="a" href={posted.permalink} target="_blank" rel="noopener noreferrer" aria-label="Open post" sx={{ color: "#fff" }}>
                    <ExternalLink size={15} />
                  </IconButton>
                </Tooltip>
              </>
            ) : null}
            {p.outcome || left === 0 ? (
              <IconButton size="small" onClick={() => desk.dismiss(p.id)} aria-label="Dismiss" sx={{ color: "rgba(255,255,255,0.6)" }}>
                <CloseIcon size={15} />
              </IconButton>
            ) : (
              <Button size="small" onClick={() => void undo(p.id)} sx={{ minHeight: 30, color: "#FFD400", fontWeight: 700 }}>
                Undo
              </Button>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
