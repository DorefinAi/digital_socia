"use client";

// What went out, read-only: the card at full size and the exact posted text as it reads on X, with who
// posted it and when. Opened from a row in the Posted list.

import React, { useEffect, useId, useRef, useState } from "react";
import { Box, Button, Dialog, IconButton, Typography } from "@mui/material";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import type { SocialPost } from "@/types/newsroom";
import XPostPreview from "./phase1/XPostPreview";
import { countChars } from "./socialText";

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "14:05" today, "13 Oct, 14:05" on another day (24-hour clock, as the rest of the desk) */
function postedTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return sameDay(at, new Date())
    ? at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
    : at.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "Posted 14:05 by Ravi", or "Copied and posted by hand at 14:05 by Ravi" for a post pasted into X */
function postedLine(post: SocialPost): string {
  const time = postedTime(post.postedAt);
  const byHand = !!post.byHand || !post.postUrl;
  // Live posts carry the real name (null when unknown); the postedBy label then only names the X API ("Socia")
  const who = post.postedByName !== undefined ? (post.postedByName ?? (byHand ? null : post.postedBy)) : post.postedBy;
  const by = who ? ` by ${who}` : "";
  if (byHand) return `Copied and posted by hand${time ? ` at ${time}` : ""}${by}`;
  return `Posted${time ? ` ${time}` : ""}${by}`;
}

interface PostedPreviewDialogProps {
  post: SocialPost;
  onClose: () => void;
}

export default function PostedPreviewDialog({ post, onClose }: PostedPreviewDialogProps) {
  const titleId = useId();
  const recalled = post.status === "recalled";
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(post.text);
      setCopy("copied");
    } catch {
      // Clipboard is blocked on insecure origins; the text in the preview stays selectable
      setCopy("failed");
    }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopy("idle"), 1800);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby={titleId}
      slotProps={{ paper: { sx: { borderRadius: "14px", backgroundImage: "none", m: { xs: 1.5, sm: 4 }, width: { xs: "calc(100% - 24px)", sm: "calc(100% - 64px)" }, maxHeight: { xs: "calc(100% - 24px)", sm: "calc(100% - 64px)" } } } }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, px: 2.5, pt: 2, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} component="h2" sx={{ fontWeight: 700, fontSize: "1rem", overflowWrap: "anywhere" }}>
            {post.headline}
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.25 }}>{postedLine(post)}</Typography>
          {recalled && (
            <Typography sx={{ fontSize: "0.8125rem", color: "error.main", mt: 0.25 }}>
              Recalled{post.recallReason ? `: ${post.recallReason}` : ""}. It is no longer on X.
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ mt: -0.25, mr: -1 }}>
          <X size={18} />
        </IconButton>
      </Box>

      <Box sx={{ p: { xs: 1.5, sm: 2.5 }, overflowY: "auto", backgroundColor: "action.hover" }}>
        <XPostPreview
          text={post.text}
          used={countChars(post.text, "X (Twitter)")}
          when={postedTime(post.postedAt) || "posted"}
          media={
            post.thumbUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={post.thumbUrl} alt={`Card posted with the story: ${post.headline}`} style={{ display: "block", width: "100%", height: "auto", backgroundColor: "#111" }} />
            ) : undefined
          }
        />
        {!post.thumbUrl && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 1 }}>Posted without a card.</Typography>}
      </Box>

      <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 1, px: 2.5, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
        {/* Announced to screen readers when the copy lands or fails */}
        <Typography role="status" sx={{ mr: "auto", fontSize: "0.75rem", color: copy === "failed" ? "error.main" : "text.secondary" }}>
          {copy === "copied" ? "Text copied" : copy === "failed" ? "Couldn't copy. Select the text and copy it." : ""}
        </Typography>
        {post.text.trim() && (
          <Button onClick={() => void copyText()} startIcon={copy === "copied" ? <Check size={14} /> : <Copy size={14} />} sx={{ fontSize: "0.8125rem" }}>
            Copy text
          </Button>
        )}
        {post.postUrl && !recalled && (
          <Button component="a" href={post.postUrl} target="_blank" rel="noopener noreferrer" startIcon={<ExternalLink size={14} />} sx={{ fontSize: "0.8125rem" }}>
            Open on X
          </Button>
        )}
        <Button variant="contained" onClick={onClose} sx={{ fontSize: "0.8125rem" }}>
          Close
        </Button>
      </Box>
    </Dialog>
  );
}
