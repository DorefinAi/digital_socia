import React from "react";
import { FacebookIcon } from "@/components/Newsroom/BreakingDesk/shared";

type IconProps = { size?: number; color?: string };

export const YoutubeIcon: React.FC<IconProps> = ({ size = 16, color = "#FF0000" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

export const InstagramIcon: React.FC<IconProps> = ({ size = 16, color = "#E4405F" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

export const XIcon: React.FC<IconProps> = ({ size = 16, color = "#1DA1F2" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export interface AiContentPlatform {
  label: string;
  /** Matches the AI Content Review page's ?platform= value */
  platformKey: string;
  path: string;
  icon: (size: number) => React.ReactNode;
  /** True where Socia's backend drafts and posts for real (X); the rest are editor-only for now */
  live: boolean;
}

/** The AI Content Review platforms, in nav order. The sidebar and the Web Scraper's "Create draft for…" both read this. */
export const AI_CONTENT_PLATFORMS: AiContentPlatform[] = [
  { label: "YouTube", platformKey: "YouTube", path: "/ai-content/youtube", icon: (s) => <YoutubeIcon size={s} />, live: false },
  { label: "Instagram", platformKey: "Instagram", path: "/ai-content/instagram", icon: (s) => <InstagramIcon size={s} />, live: false },
  { label: "X (Twitter)", platformKey: "X", path: "/ai-content/x", icon: (s) => <XIcon size={s} />, live: true },
  { label: "Facebook", platformKey: "Facebook", path: "/ai-content/facebook", icon: (s) => <FacebookIcon size={s} />, live: false },
];
