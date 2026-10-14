"use client";

import React, { useEffect, useState } from "react";
import { Box, Typography, Button, IconButton, Tooltip } from "@mui/material";
import { Check, Copy, ExternalLink, X as CloseIcon } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { PLATFORM_META } from "./shared";

/** Bottom-left stack: a countdown with Undo while a post is held, then its live link once it has gone out. */
export default function UndoToast() {
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
