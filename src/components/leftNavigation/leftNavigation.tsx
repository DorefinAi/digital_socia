"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  Drawer,
  IconButton,
  useMediaQuery,
  useTheme,
  Tooltip,
  Collapse,
} from "@mui/material";
import {
  Menu,
  Lock,
  LayoutDashboard,
  CheckCircle,
  BarChart3,
  Sparkles,
  LogOut,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Globe,
} from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import NavigationLabel from "../Overview/NavigationLabel";
import { useNewsroom } from "@/providers/NewsroomProvider";

const YoutubeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#FF0000" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const InstagramIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#E4405F" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const XIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = "#1DA1F2" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const COLLAPSED_WIDTH = 60;
const EXPANDED_WIDTH = 220;
const MIN_WIDTH = 60;
const MAX_WIDTH = 280;

const LeftNavigation: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPlatform = searchParams.get("platform");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiSubmenuOpen, setAiSubmenuOpen] = useState(true);
  const { permissions, currentRole } = useNewsroom();

  // Sidebar state: collapsed or custom width
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(EXPANDED_WIDTH);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // Restore from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar_state");
      if (saved) {
        const state = JSON.parse(saved);
        setCollapsed(state.collapsed ?? false);
        setSidebarWidth(state.width ?? EXPANDED_WIDTH);
      }
    } catch {}
  }, []);

  // Save to localStorage
  const saveState = (c: boolean, w: number) => {
    try {
      localStorage.setItem("sidebar_state", JSON.stringify({ collapsed: c, width: w }));
    } catch {}
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) setSidebarWidth(COLLAPSED_WIDTH);
    else setSidebarWidth(EXPANDED_WIDTH);
    saveState(next, next ? COLLAPSED_WIDTH : EXPANDED_WIDTH);
  };

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = e.clientX - startX.current;
      let newWidth = startWidth.current + delta;
      newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      // Auto-collapse if dragged below threshold
      if (newWidth < 80) {
        setCollapsed(true);
        setSidebarWidth(COLLAPSED_WIDTH);
      } else {
        setCollapsed(false);
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Snap: if between collapsed and expanded, snap to one
      setSidebarWidth((prev) => {
        const snapThreshold = (COLLAPSED_WIDTH + EXPANDED_WIDTH) / 2;
        const snapped = prev < snapThreshold ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
        const isCollapsed = snapped === COLLAPSED_WIDTH;
        setCollapsed(isCollapsed);
        saveState(isCollapsed, snapped);
        return snapped;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/ai-content")) {
      setAiSubmenuOpen(true);
    }
  }, [pathname]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const isCollapsed = sidebarWidth < 80;

  const navItems = [
    { label: "Dashboard", icon: <LayoutDashboard size={20} />, path: "/dashboard", accessible: permissions.canAccessDashboard },
    { label: "Approval Portal", icon: <CheckCircle size={20} />, path: "/approval", accessible: permissions.canAccessApprovalPortal },
    { label: "Digital Dashboard", icon: <BarChart3 size={20} />, path: "/digital", accessible: permissions.canAccessDigitalDashboard },
    { label: "Web Scraper", icon: <Globe size={20} />, path: "/web-scraper", accessible: permissions.canAccessWebScraper !== false },
    {
      label: "AI Content Review",
      icon: <Sparkles size={20} />,
      path: "/ai-content",
      accessible: permissions.canAccessAIContentReview,
      hasSubmenu: true,
      subItems: [
        { label: "YouTube", icon: <YoutubeIcon size={16} color="#FF0000" />, platformKey: "YouTube", path: "/ai-content/youtube" },
        { label: "Instagram", icon: <InstagramIcon size={16} color="#E4405F" />, platformKey: "Instagram", path: "/ai-content/instagram" },
        { label: "X (Twitter)", icon: <XIcon size={16} color="#1DA1F2" />, platformKey: "X", path: "/ai-content/x" },
      ],
    },
  ];

  const handleLogoutClick = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

  const drawerContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        pt: 1.5,
        pb: 1,
        px: isCollapsed ? 0.75 : 1.25,
        overflowY: "auto",
        overflowX: "hidden",
        "&::-webkit-scrollbar": { display: "none" },
        msOverflowStyle: "none",
        scrollbarWidth: "none",
        transition: "padding 0.2s ease",
      }}
    >
      {/* Brand */}
      <Box sx={{ px: isCollapsed ? 0 : 0.5, py: 1, mb: 1, display: "flex", justifyContent: isCollapsed ? "center" : "flex-start", alignItems: "center", minHeight: 40 }}>
        {isCollapsed ? (
          <Tooltip title="Vartaman AI" placement="right" arrow>
            <Typography sx={{ fontSize: "1rem", fontWeight: 900, color: "text.primary", letterSpacing: "-0.03em" }}>V</Typography>
          </Tooltip>
        ) : (
          <Typography sx={{ fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.02em", color: "text.primary", whiteSpace: "nowrap" }}>
            Vartaman AI
          </Typography>
        )}
      </Box>

      {/* Nav items */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "2px", flexGrow: 1 }}>
        {navItems.map((item) => {
          const isParentActive = pathname === item.path;
          const isAIReview = item.hasSubmenu;

          return (
            <React.Fragment key={item.label}>
              <Tooltip
                title={isCollapsed ? item.label : (!item.accessible ? `${item.label} - Not available for ${currentRole.replace("_", " ")}` : "")}
                placement="right"
                arrow
              >
                <Box
                  sx={{
                    opacity: item.accessible ? 1 : 0.45,
                    pointerEvents: item.accessible ? "auto" : "none",
                    position: "relative",
                  }}
                >
                  <Box
                    onClick={() => {
                      if (item.accessible) {
                        if (isAIReview) {
                          if (isCollapsed) {
                            setCollapsed(false);
                            setSidebarWidth(EXPANDED_WIDTH);
                            saveState(false, EXPANDED_WIDTH);
                          }
                          setAiSubmenuOpen((prev) => !prev);
                        } else {
                          router.push(item.path);
                        }
                        if (isMobile && !isAIReview) setMobileOpen(false);
                      }
                    }}
                    sx={{ position: "relative" }}
                  >
                    <NavigationLabel
                      label={item.label}
                      logo={item.icon}
                      isActive={isParentActive && !currentPlatform}
                      collapsed={isCollapsed}
                    />
                    {!isCollapsed && isAIReview && item.accessible && (
                      <Box
                        sx={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "text.secondary",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {aiSubmenuOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </Box>
                    )}
                  </Box>
                  {!item.accessible && (
                    <Box
                      sx={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "text.secondary",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Lock size={14} />
                    </Box>
                  )}
                </Box>
              </Tooltip>

              {!isCollapsed && isAIReview && item.accessible && (
                <Collapse in={aiSubmenuOpen} timeout="auto" unmountOnExit>
                  <Box sx={{ pl: 2, display: "flex", flexDirection: "column", gap: "2px", mt: 0.25, mb: 0.25 }}>
                    {item.subItems?.map((sub) => {
                      const isSubActive =
                        pathname === sub.path ||
                        (pathname === "/ai-content" && currentPlatform?.toLowerCase() === sub.platformKey.toLowerCase());

                      return (
                        <Box
                          key={sub.label}
                          onClick={() => {
                            router.push(sub.path);
                            if (isMobile) setMobileOpen(false);
                          }}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            py: 0.6,
                            px: 1.25,
                            borderRadius: "6px",
                            cursor: "pointer",
                            backgroundColor: isSubActive ? (theme.palette.mode === "light" ? "#f0f0f0" : "#2a2a2a") : "transparent",
                            color: isSubActive ? "text.primary" : "text.secondary",
                            transition: "all 0.15s ease",
                            "&:hover": { backgroundColor: theme.palette.action.hover, color: "text.primary" },
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>{sub.icon}</Box>
                          <Typography sx={{ fontSize: "0.75rem", fontWeight: isSubActive ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {sub.label}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </Collapse>
              )}
            </React.Fragment>
          );
        })}
      </Box>

      {/* Bottom section */}
      <Box sx={{ mt: "auto", pt: 1, borderTop: "1px solid", borderColor: theme.palette.divider, display: "flex", flexDirection: "column", gap: 0.5 }}>
        {/* Collapse toggle */}
        <Tooltip title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right" arrow>
          <Box
            onClick={toggleCollapse}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: isCollapsed ? "center" : "flex-start",
              gap: 1,
              px: isCollapsed ? 0 : 1.25,
              py: 0.85,
              borderRadius: "8px",
              cursor: "pointer",
              color: "text.secondary",
              transition: "all 0.15s ease",
              "&:hover": { backgroundColor: theme.palette.action.hover, color: "text.primary" },
            }}
          >
            {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {!isCollapsed && (
              <Typography sx={{ fontWeight: 500, fontSize: "0.8125rem" }}>Collapse</Typography>
            )}
          </Box>
        </Tooltip>

        {/* Logout */}
        <Tooltip title={isCollapsed ? "Logout" : ""} placement="right" arrow>
          <Box
            onClick={handleLogoutClick}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: isCollapsed ? "center" : "flex-start",
              gap: 1,
              px: isCollapsed ? 0 : 1.25,
              py: 0.85,
              borderRadius: "8px",
              cursor: "pointer",
              color: theme.palette.text.secondary,
              transition: "all 0.15s ease",
              "&:hover": { backgroundColor: theme.palette.action.hover, color: "text.primary" },
            }}
          >
            <LogOut size={18} />
            {!isCollapsed && (
              <Typography sx={{ fontWeight: 500, fontSize: "0.8125rem" }}>Logout</Typography>
            )}
          </Box>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <>
      {isMobile && (
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={handleDrawerToggle}
          sx={{ position: "fixed", top: 16, left: 16, zIndex: 1201, backgroundColor: "#fff", boxShadow: 1, "&:hover": { backgroundColor: "#f5f5f5" } }}
        >
          <Menu size={20} />
        </IconButton>
      )}

      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{ "& .MuiDrawer-paper": { boxSizing: "border-box", width: 240 } }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Box
          sx={{
            width: sidebarWidth,
            minWidth: sidebarWidth,
            height: "100vh",
            position: "sticky",
            top: 0,
            flexShrink: 0,
            backgroundColor: theme.palette.background.paper,
            borderRight: "1px solid",
            borderColor: theme.palette.divider,
            transition: isResizing.current ? "none" : "width 0.2s ease, min-width 0.2s ease",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {drawerContent}

          {/* Resize handle */}
          <Box
            onMouseDown={handleResizeStart}
            sx={{
              position: "absolute",
              top: 0,
              right: -2,
              width: 4,
              height: "100%",
              cursor: "col-resize",
              zIndex: 10,
              "&:hover, &:active": {
                backgroundColor: theme.palette.primary.main,
                opacity: 0.5,
              },
            }}
          />
        </Box>
      )}
    </>
  );
};

export default LeftNavigation;
