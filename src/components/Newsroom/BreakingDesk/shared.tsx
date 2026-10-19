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

export const FacebookIcon: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = "#1877F2" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971h-1.513c-1.491 0-1.956.931-1.956 1.886v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
  </svg>
);

export const PlatformIcon: React.FC<{ platform: SocialPlatform; size?: number }> = ({ platform, size }) =>
  platform === "Instagram" ? <InstagramIcon size={size} color="#D62976" /> : platform === "Facebook" ? <FacebookIcon size={size} /> : <XIcon size={size} />;

export const PLATFORM_META: Record<SocialPlatform, { short: string; handle: string; postNoun: string; path: string }> = {
  "X (Twitter)": { short: "X", handle: CHANNEL.xHandle, postNoun: "tweet", path: "/ai-content/x" },
  Instagram: { short: "Instagram", handle: CHANNEL.instagramHandle, postNoun: "caption", path: "/ai-content/instagram" },
  Facebook: { short: "Facebook", handle: CHANNEL.facebookPage, postNoun: "post", path: "/ai-content/facebook" },
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

// In the editor the tag is carried by a tint instead of a chip: yellow for Big Breaking, red for Breaking
export const TAG_TINT: Record<BreakingTag, { label: string; rgb: string; light: [number, number]; dark: [number, number] }> = {
  big_breaking: { label: "Big breaking", rgb: "255, 212, 0", light: [0.42, 0.08], dark: [0.26, 0.05] },
  breaking: { label: "Breaking", rgb: "215, 20, 26", light: [0.2, 0.04], dark: [0.32, 0.06] },
};

/** Left-to-right fade in the tag's colour; boost strengthens it for the open or hovered story. */
export const tagTint = (tag: BreakingTag, mode: "light" | "dark", boost = 1) => {
  const { rgb, [mode]: [from, to] } = TAG_TINT[tag];
  return `linear-gradient(90deg, rgba(${rgb}, ${Math.min(1, from * boost)}) 0%, rgba(${rgb}, ${Math.min(1, to * boost)}) 100%)`;
};

export const srOnly = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

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
