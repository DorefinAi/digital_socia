"use client";

// The phase 1 preview: the post as it will read on @1stIndiaNews's timeline. Same account header, the
// same blue for #hashtags and @handles, X's own weighted counter (socialText.countChars) and X's
// "Show more" cut for anything past what the timeline shows.

import React, { useState } from "react";
import { Box, Typography } from "@mui/material";
import { BadgeCheck } from "lucide-react";
import { CHANNEL } from "@/constants";
import { BREAKING_RED } from "../cardRender";
import { cutAtWeight, X_LIMIT } from "../socialText";

/** X's palette, light timeline: text, secondary, link blue, hairline */
export const X_COLORS = { text: "#0F1419", muted: "#536471", blue: "#1D9BF0", line: "#EFF3F4", warn: "#FFD400", over: "#F4212E" } as const;

// A hashtag is letters, marks, digits and underscores (Devanagari tags included); a handle is X's 1-15 of A-Z, 0-9, _
const TOKEN = /(#[\p{L}\p{M}\p{N}_]+|@[A-Za-z0-9_]{1,15})/gu;

/** Post text with #hashtags and @handles in X blue. */
export function XRichText({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) =>
        i % 2 === 1 ? (
          <Box key={i} component="span" sx={{ color: X_COLORS.blue }}>
            {part}
          </Box>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * X's ring counter: fills blue, turns yellow with the last 20 left (and shows how many), red past the limit
 * (and shows how far over). Read out as "218 of 280 characters".
 */
export function XCountRing({ used, limit = X_LIMIT, size = 26 }: { used: number; limit?: number; size?: number }) {
  const left = limit - used;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const share = Math.min(1, Math.max(0, used / limit));
  const color = left < 0 ? X_COLORS.over : left <= 20 ? X_COLORS.warn : X_COLORS.blue;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      <Box component="svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden sx={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={X_COLORS.line} strokeWidth={2.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray={`${share * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Box>
      <Typography component="span" sx={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums", fontWeight: left <= 20 ? 700 : 500, color: left < 0 ? X_COLORS.over : X_COLORS.muted }}>
        <Box component="span" aria-hidden>
          {used}/{limit}
        </Box>
        <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          {used} of {limit} characters{left < 0 ? `, ${-left} over` : ""}
        </Box>
      </Typography>
    </Box>
  );
}

interface XPostPreviewProps {
  text: string;
  /** Weighted length of `text` (computed once by the caller) */
  used: number;
  /** The card under the text, when "Add card" is on */
  media?: React.ReactNode;
  /** Footer row inside the post (counter, switches, the main button) */
  footer?: React.ReactNode;
}

/** A light-timeline X post by First India News. */
export default function XPostPreview({ text, used, media, footer }: XPostPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const over = used > X_LIMIT;
  // The timeline shows up to 280 weighted characters, then "Show more"
  const shown = over && !expanded ? cutAtWeight(text, X_LIMIT) : text;
  return (
    <Box component="article" aria-label="Preview of the post on X" sx={{ display: "flex", gap: 1.5, p: 2, backgroundColor: "#fff", color: X_COLORS.text, borderRadius: "16px", border: `1px solid ${X_COLORS.line}`, fontFamily: '-apple-system, "Segoe UI", Roboto, "Noto Sans Devanagari", Helvetica, Arial, sans-serif' }}>
      <Box aria-hidden sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", backgroundColor: BREAKING_RED, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.8125rem" }}>
        1st
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", fontSize: "0.9375rem", lineHeight: 1.3 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            First India News
          </Box>
          <BadgeCheck size={17} color="#fff" fill={X_COLORS.blue} aria-label="Verified account" />
          <Box component="span" sx={{ color: X_COLORS.muted }}>
            @{CHANNEL.xHandle} · now
          </Box>
        </Box>
        <Typography component="div" lang="hi" sx={{ fontSize: "0.9375rem", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere", mt: 0.5, color: X_COLORS.text, fontFamily: "inherit" }}>
          {text.trim() ? <XRichText text={shown} /> : <Box component="span" sx={{ color: X_COLORS.muted }}>The post is empty.</Box>}
          {over && (
            <>
              {!expanded && "… "}
              <Box
                component="button"
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                sx={{ display: "inline", border: 0, p: 0, ml: expanded ? 0.5 : 0, background: "none", font: "inherit", color: X_COLORS.blue, cursor: "pointer", "&:hover": { textDecoration: "underline" }, "&:focus-visible": { outline: `2px solid ${X_COLORS.blue}`, outlineOffset: 2, borderRadius: "2px" } }}
              >
                {expanded ? "Show less" : "Show more"}
              </Box>
            </>
          )}
        </Typography>
        {media && <Box sx={{ mt: 1.5, borderRadius: "16px", overflow: "hidden", border: "1px solid #CFD9DE", lineHeight: 0 }}>{media}</Box>}
        {/* Stays in view at the bottom of the scrolling column while a tall card is below the text */}
        {footer && <Box sx={{ position: "sticky", bottom: 0, zIndex: 1, mt: 1.5, pt: 1.5, pb: 1, backgroundColor: "#fff", borderTop: `1px solid ${X_COLORS.line}` }}>{footer}</Box>}
      </Box>
    </Box>
  );
}
