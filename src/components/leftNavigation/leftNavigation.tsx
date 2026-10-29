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
  XCircle,
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
import { canSeeRejectedNews, REJECTED_NEWS_LABEL, REJECTED_NEWS_PATH } from "@/lib/rejectedNews";
import NavigationLabel from "../Overview/NavigationLabel";
import SociaMark from "@/components/Login/SociaMark";
import { AI_CONTENT_PLATFORMS } from "./aiContentPlatforms";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { useSociaSession } from "@/providers/SociaSessionProvider";

const COLLAPSED_WIDTH = 60;
const EXPANDED_WIDTH = 220;
const MIN_WIDTH = 60;
const MAX_WIDTH = 280;

const LeftNavigation: React.FC = () => {
  const router = useRouter();
  const { signOut } = useSociaSession();
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
    { label: REJECTED_NEWS_LABEL, icon: <XCircle size={20} />, path: REJECTED_NEWS_PATH, accessible: canSeeRejectedNews(permissions) },
    { label: "Digital Dashboard", icon: <BarChart3 size={20} />, path: "/digital", accessible: permissions.canAccessDigitalDashboard },
    { label: "Web Scraper", icon: <Globe size={20} />, path: "/web-scraper", accessible: permissions.canAccessWebScraper !== false },
    {
      label: "AI Content Review",
      icon: <Sparkles size={20} />,
      path: "/ai-content",
      accessible: permissions.canAccessAIContentReview,
      hasSubmenu: true,
      subItems: AI_CONTENT_PLATFORMS.map((p) => ({ label: p.label, icon: p.icon(16), platformKey: p.platformKey, path: p.path })),
    },
  ];

  const handleLogoutClick = async () => {
    localStorage.removeItem("token");
    await signOut();
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
      <Box sx={{ px: isCollapsed ? 0 : 0.5, py: 1, mb: 1, display: "flex", flexDirection: isCollapsed ? "column" : "row", justifyContent: isCollapsed ? "center" : "space-between", alignItems: "center", gap: isCollapsed ? 1 : 0.5, minHeight: 40 }}>
        {isCollapsed ? (
          <Tooltip title="Socia · Digital desk" placement="right" arrow>
            <Box sx={{ display: "flex", color: "text.primary" }} role="img" aria-label="Socia digital desk">
              <SociaMark size={20} />
            </Box>
          </Tooltip>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, color: "text.primary", minWidth: 0 }}>
            <SociaMark size={22} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: "1.05rem", fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.15, whiteSpace: "nowrap" }}>Socia</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.2, whiteSpace: "nowrap" }}>Digital desk</Typography>
            </Box>
          </Box>
        )}
        {/* Collapse toggle, at the top beside the brand */}
        <Tooltip title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right" arrow>
          <IconButton
            onClick={toggleCollapse}
            size="small"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            sx={{
              flexShrink: 0,
              borderRadius: "8px",
              color: "text.secondary",
              "&:hover": { backgroundColor: theme.palette.action.hover, color: "text.primary" },
            }}
          >
            {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </IconButton>
        </Tooltip>
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
