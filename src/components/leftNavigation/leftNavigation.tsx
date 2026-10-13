"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Box, Typography, Drawer, IconButton, useMediaQuery, useTheme, Tooltip } from "@mui/material";
import { Menu, Lock, LayoutDashboard, CheckCircle, BarChart3, LogOut, Pin, PinOff, Globe } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { ROLE_LABELS, SocialPlatform } from "@/types/newsroom";

const YoutubeIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

const InstagramIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const XIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const DOCK_WIDTH = 60;
const OPEN_WIDTH = 248;
const INSET = 12;
const CELL = 36;
const STORAGE_KEY = "sidebar_state";
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

// The dock keeps its own dark palette in both light and dark mode
const DOCK = {
  bg: "#101012",
  line: "rgba(255,255,255,0.09)",
  text: "rgba(255,255,255,0.62)",
  strong: "#FFFFFF",
  hover: "rgba(255,255,255,0.07)",
  accent: "#D7141A",
};

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  accessible: boolean;
  badge?: number;
}

function readPinned(): boolean {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").pinned === true;
  } catch {
    return false;
  }
}

/**
 * Floating dock: rests as an icon strip, opens over the page on hover or focus,
 * and can be pinned open (Ctrl+B) so the page makes room for it.
 */
const LeftNavigation: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { permissions, currentRole, ftpNews, socialPosts } = useNewsroom();

  // Pages only render on the client, so reading storage here avoids a flash of the wrong state
  const [pinned, setPinned] = useState(readPinned);
  const [peeking, setPeeking] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinned: !prev }));
      } catch {}
      return !prev;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        togglePin();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(peekTimer.current);
    };
  }, [togglePin]);

  // Small delays stop the dock from flickering when the pointer only passes over it
  const peek = (open: boolean) => {
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeeking(open), open ? 90 : 220);
  };

  const toPost = (platform: SocialPlatform) => {
    const posted = new Set(socialPosts.filter((p) => p.platform === platform).map((p) => p.newsId));
    return ftpNews.filter((n) => !posted.has(n.id)).length;
  };

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: "Workspace",
      items: [
        { label: "Dashboard", icon: <LayoutDashboard size={18} />, path: "/dashboard", accessible: permissions.canAccessDashboard },
        { label: "Approval Portal", icon: <CheckCircle size={18} />, path: "/approval", accessible: permissions.canAccessApprovalPortal },
        { label: "Digital Dashboard", icon: <BarChart3 size={18} />, path: "/digital", accessible: permissions.canAccessDigitalDashboard },
        { label: "Web Scraper", icon: <Globe size={18} />, path: "/web-scraper", accessible: permissions.canAccessWebScraper !== false },
      ],
    },
    {
      title: "AI Content Review",
      items: [
        { label: "X (Twitter)", icon: <XIcon />, path: "/ai-content/x", accessible: permissions.canAccessAIContentReview, badge: toPost("X (Twitter)") },
        { label: "Instagram", icon: <InstagramIcon />, path: "/ai-content/instagram", accessible: permissions.canAccessAIContentReview, badge: toPost("Instagram") },
        { label: "YouTube", icon: <YoutubeIcon />, path: "/ai-content/youtube", accessible: permissions.canAccessAIContentReview },
      ],
    },
  ];

  const handleLogoutClick = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

  /** Everything is laid out for the open width; the dock clips it and fades the labels. */
  const renderContent = (open: boolean, showPin: boolean) => {
    const fade = { opacity: open ? 1 : 0, transition: `opacity ${open ? 220 : 90}ms ease ${open ? 60 : 0}ms`, whiteSpace: "nowrap" as const };
    const cell = { width: CELL, height: CELL, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "10px" };

    return (
      <Box sx={{ display: "flex", flexDirection: "column", width: OPEN_WIDTH, height: "100%", p: `${INSET}px`, color: DOCK.text }}>
        {/* Brand + pin */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2.5 }}>
          <Box sx={{ ...cell, backgroundColor: DOCK.accent, color: "#fff", fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.02em" }}>V</Box>
          <Box sx={{ ...fade, flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700, color: DOCK.strong, lineHeight: 1.2 }}>Vartaman AI</Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: DOCK.text, lineHeight: 1.3 }}>Digital desk</Typography>
          </Box>
          {showPin && (
            <Tooltip title={`${pinned ? "Unpin" : "Keep open"} (Ctrl+B)`} placement="right">
              <IconButton
                onClick={togglePin}
                tabIndex={open ? 0 : -1}
                aria-label={pinned ? "Unpin sidebar" : "Keep sidebar open"}
                aria-pressed={pinned}
                sx={{ ...fade, width: 30, height: 30, borderRadius: "8px", color: pinned ? DOCK.strong : DOCK.text, backgroundColor: pinned ? DOCK.hover : "transparent", "&:hover": { backgroundColor: DOCK.hover, color: DOCK.strong } }}
              >
                {pinned ? <PinOff size={16} /> : <Pin size={16} />}
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Navigation */}
        <Box component="nav" aria-label="Main" sx={{ display: "flex", flexDirection: "column", gap: 1.5, flexGrow: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
          {sections.map((section) => (
            <Box key={section.title}>
              <Box sx={{ position: "relative", height: 22, mb: 0.5 }}>
                <Box sx={{ position: "absolute", left: 8, top: 10, width: CELL - 16, height: "1px", backgroundColor: DOCK.line, opacity: open ? 0 : 1, transition: "opacity 120ms ease" }} />
                <Typography sx={{ ...fade, position: "absolute", left: 10, top: 3, fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)" }}>
                  {section.title}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {section.items.map((item) => {
                  const isActive = pathname === item.path;
                  const rowSx = {
                    position: "relative" as const,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    pr: 1,
                    borderRadius: "10px",
                    color: isActive ? DOCK.strong : DOCK.text,
                    backgroundColor: isActive && open ? DOCK.hover : "transparent",
                    transition: "background-color 140ms ease, color 140ms ease",
                    "&:hover": { backgroundColor: DOCK.hover, color: DOCK.strong },
                    "&:focus-visible": { outline: `2px solid ${DOCK.accent}`, outlineOffset: 1 },
                  };
                  const inner = (
                    <>
                      <Box sx={{ ...cell, position: "relative", transition: "background-color 140ms ease, color 140ms ease", ...(isActive && { backgroundColor: "#fff", color: "#101012" }) }}>
                        {item.icon}
                        {item.accessible && !!item.badge && !open && (
                          <Box sx={{ position: "absolute", top: 3, right: 3, width: 8, height: 8, borderRadius: "50%", backgroundColor: DOCK.accent, border: `2px solid ${isActive ? "#fff" : DOCK.bg}`, boxSizing: "content-box" }} />
                        )}
                      </Box>
                      <Typography sx={{ ...fade, flex: 1, minWidth: 0, fontSize: "0.8125rem", fontWeight: isActive ? 600 : 500, color: "inherit" }}>{item.label}</Typography>
                      {!item.accessible && (
                        <Box sx={{ ...fade, display: "flex" }}>
                          <Lock size={13} />
                        </Box>
                      )}
                      {item.accessible && !!item.badge && (
                        <Box sx={{ ...fade, minWidth: 20, px: 0.75, height: 18, borderRadius: "9px", backgroundColor: DOCK.accent, color: "#fff", fontSize: "0.6875rem", fontWeight: 700, display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>
                          {item.badge}
                        </Box>
                      )}
                    </>
                  );

                  return item.accessible ? (
                    <Box key={item.path} component={Link} href={item.path} aria-current={isActive ? "page" : undefined} aria-label={item.label} onClick={() => setMobileOpen(false)} sx={rowSx}>
                      {inner}
                    </Box>
                  ) : (
                    <Tooltip key={item.path} title={`Not available for ${ROLE_LABELS[currentRole]}`} placement="right">
                      <Box aria-disabled sx={{ ...rowSx, opacity: 0.38, cursor: "not-allowed", "&:hover": {} }}>
                        {inner}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>

        {/* Account */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, pt: 1.5, mt: 1.5, borderTop: `1px solid ${DOCK.line}` }}>
          <Box sx={{ ...cell, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.12)", color: DOCK.strong, fontSize: "0.75rem", fontWeight: 700 }}>AD</Box>
          <Box sx={{ ...fade, flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: DOCK.strong, lineHeight: 1.25 }}>Admin</Typography>
            <Typography sx={{ fontSize: "0.6875rem", color: DOCK.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" }}>{ROLE_LABELS[currentRole]}</Typography>
          </Box>
          <Tooltip title="Log out" placement="top">
            <IconButton onClick={handleLogoutClick} tabIndex={open ? 0 : -1} aria-label="Log out" sx={{ ...fade, width: 30, height: 30, borderRadius: "8px", color: DOCK.text, "&:hover": { backgroundColor: DOCK.hover, color: DOCK.strong } }}>
              <LogOut size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    );
  };

  if (isMobile) {
    // Mobile: thumb-reach tab bar for the daily screens, everything else behind "More"
    const all = sections.flatMap((section) => section.items);
    const tabs = ["/dashboard", "/ai-content/x", "/ai-content/instagram", "/approval"]
      .map((path) => all.find((item) => item.path === path))
      .filter((item): item is NavItem => !!item && item.accessible);
    const tabSx = {
      position: "relative" as const,
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      gap: "3px",
      border: 0,
      background: "transparent",
      fontFamily: "inherit",
      fontSize: "0.625rem",
      fontWeight: 600,
      cursor: "pointer",
      color: DOCK.text,
    };

    return (
      <>
        <Box
          component="nav"
          aria-label="Main"
          sx={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1200, display: "flex", height: "calc(60px + env(safe-area-inset-bottom))", pb: "env(safe-area-inset-bottom)", backgroundColor: DOCK.bg, borderTop: `1px solid ${DOCK.line}` }}
        >
          {tabs.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Box key={item.path} component={Link} href={item.path} aria-current={isActive ? "page" : undefined} sx={{ ...tabSx, color: isActive ? DOCK.strong : DOCK.text }}>
                <Box sx={{ position: "relative", display: "grid", placeItems: "center", width: 44, height: 26, borderRadius: "13px", backgroundColor: isActive ? "#fff" : "transparent", color: isActive ? "#101012" : "inherit" }}>
                  {item.icon}
                  {!!item.badge && <Box sx={{ position: "absolute", top: 0, right: 6, width: 7, height: 7, borderRadius: "50%", backgroundColor: DOCK.accent }} />}
                </Box>
                {item.label.replace(" (Twitter)", "").replace(" Portal", "")}
              </Box>
            );
          })}
          <Box component="button" onClick={() => setMobileOpen(true)} aria-label="More navigation" sx={tabSx}>
            <Box sx={{ display: "grid", placeItems: "center", height: 26 }}>
              <Menu size={18} />
            </Box>
            More
          </Box>
        </Box>
        <Drawer
          anchor="bottom"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{ zIndex: 1250, "& .MuiDrawer-paper": { height: "min(560px, 86dvh)", border: 0, borderRadius: "18px 18px 0 0", backgroundColor: DOCK.bg, "& > div": { width: "100%" } } }}
        >
          {renderContent(true, false)}
        </Drawer>
      </>
    );
  }

  const open = pinned || peeking;
  const reserved = (pinned ? OPEN_WIDTH : DOCK_WIDTH) + INSET;

  return (
    <Box
      component="aside"
      sx={{ position: "sticky", top: 0, height: "100vh", flexShrink: 0, width: reserved, minWidth: reserved, zIndex: 1100, transition: `width 320ms ${EASE}, min-width 320ms ${EASE}` }}
    >
      <Box
        onMouseEnter={() => peek(true)}
        onMouseLeave={() => peek(false)}
        onFocus={() => peek(true)}
        onBlur={() => peek(false)}
        sx={{
          position: "absolute",
          top: INSET,
          bottom: INSET,
          left: INSET,
          width: open ? OPEN_WIDTH : DOCK_WIDTH,
          overflow: "hidden",
          borderRadius: "20px",
          backgroundColor: DOCK.bg,
          boxShadow: open && !pinned ? "0 24px 60px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.2)" : "0 1px 2px rgba(0,0,0,0.12)",
          transition: `width 320ms ${EASE}, box-shadow 320ms ease`,
        }}
      >
        {renderContent(open, true)}
      </Box>
    </Box>
  );
};

export default LeftNavigation;
