"use client";

import React from "react";
import { Box, Typography } from "@mui/material";
import { BreakingTag, SocialPlatform } from "@/types/newsroom";
import { CHANNEL } from "@/constants";
import { BIG_BREAKING_YELLOW, BREAKING_RED } from "./TemplateCanvas";

export const XIcon: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const InstagramIcon: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

export const PlatformIcon: React.FC<{ platform: SocialPlatform; size?: number }> = ({ platform, size }) =>
  platform === "Instagram" ? <InstagramIcon size={size} color="#D62976" /> : <XIcon size={size} />;

export const PLATFORM_META: Record<SocialPlatform, { short: string; handle: string; postNoun: string; path: string }> = {
  "X (Twitter)": { short: "X", handle: CHANNEL.xHandle, postNoun: "tweet", path: "/ai-content/x" },
  Instagram: { short: "Instagram", handle: CHANNEL.instagramHandle, postNoun: "caption", path: "/ai-content/instagram" },
};

export const TagChip: React.FC<{ tag: BreakingTag }> = ({ tag }) => {
  const isBig = tag === "big_breaking";
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        px: 0.75,
        py: "2px",
        fontSize: "0.625rem",
        fontWeight: 800,
        letterSpacing: "0.06em",
        lineHeight: 1.5,
        borderRadius: "3px",
        whiteSpace: "nowrap",
        backgroundColor: isBig ? BIG_BREAKING_YELLOW : BREAKING_RED,
        color: isBig ? "#111" : "#fff",
      }}
    >
      {isBig ? "BIG BREAKING" : "BREAKING"}
    </Box>
  );
};

export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** Renders post text with #hashtags and @mentions picked out in the platform's link colour. */
export const RichPostText: React.FC<{ text: string; linkColor: string }> = ({ text, linkColor }) => (
  <>
    {text.split(/([#@][\p{L}\p{M}\p{N}_.]+)/gu).map((part, i) =>
      /^[#@]/.test(part) ? (
        <span key={i} style={{ color: linkColor }}>
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    )}
  </>
);

/** "13 Oct, 18:30": the spec's date format with a 24-hour clock. */
export function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Small thumbnail used by every console list. */
export const ListThumb: React.FC<{ src: string; dim?: boolean }> = ({ src, dim }) => (
  <Box sx={{ width: "100%", aspectRatio: "7 / 5", borderRadius: "4px", overflow: "hidden", backgroundColor: "#111", opacity: dim ? 0.5 : 1 }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
  </Box>
);

export const listFrameSx = { backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" };

export const EmptyState: React.FC<{ title: string; hint: string }> = ({ title, hint }) => (
  <Box sx={{ py: 5, px: 2, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "8px" }}>
    <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{title}</Typography>
    <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>{hint}</Typography>
  </Box>
);
