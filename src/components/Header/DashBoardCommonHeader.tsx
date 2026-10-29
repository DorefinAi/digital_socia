"use client";

import { BLACK_COLOR, LIGHT_GRAY } from "@/assets/colors";
import {
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Badge,
  Popover,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Tooltip,
  Collapse,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import React, { useState, useEffect } from "react";
import {
  Zap,
  Moon,
  Sun,
  Bell,
  UserRound,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  XCircle,
  Pencil,
  Sparkles,
  ClipboardList,
  Send,
  Clock,
  CircleUserRound,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SearchModal from "./SearchModal";
import { useThemeMode } from "@/providers/MuiProvider";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { mockAccess } from "@/lib/access/mockStore";
import { useMockRoles } from "@/lib/access/useMockRoles";
import { useSociaSession } from "@/providers/SociaSessionProvider";
import { CONTENT_MAX_WIDTH } from "@/constants";
import { useHeaderCollapsed } from "./useHeaderCollapsed";
import LiveActivity, { HeaderEmpty } from "./LiveActivity";

const HEADER_HEIGHT = 56;
const FOLD_MS = 220;

const focusRing = { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 } as const;

/** Quiet square icon button used for every header action; the label doubles as the tooltip. */
function HeaderAction({
  label,
  onClick,
  children,
  ...rest
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  "aria-haspopup"?: "menu";
  "aria-expanded"?: "true" | "false";
  "aria-keyshortcuts"?: string;
}) {
  return (
    <Tooltip title={label} enterDelay={300} arrow>
      <IconButton
        aria-label={label}
        onClick={onClick}
        {...rest}
        sx={{
          width: { xs: 34, sm: 36 },
          height: { xs: 34, sm: 36 },
          p: 0,
          flexShrink: 0,
          borderRadius: "10px",
          color: "text.primary",
          "&:hover": { backgroundColor: "action.hover" },
          "&:focus-visible": focusRing,
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  story_approved: <CheckCircle size={16} color="#28a745" />,
  story_rejected: <XCircle size={16} color="#dc3545" />,
  ai_caption_edited: <Pencil size={16} color="#3498db" />,
  instagram_post_ready: <Sparkles size={16} color="#E4405F" />,
  story_returned: <XCircle size={16} color="#ffc107" />,
  new_assignment: <ClipboardList size={16} color="#6c757d" />,
  ai_content_approved: <Send size={16} color="#28a745" />,
};

const DashBoardCommonHeader: React.FC = () => {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const { mode, toggleTheme } = useThemeMode();
  const { notifications, markNotificationRead, markAllNotificationsRead, unreadCount, activity } = useNewsroom();
  const [roleAnchorEl, setRoleAnchorEl] = useState<null | HTMLElement>(null);
  // On the live backend the role comes from the account; the switcher is a demo-only control
  const { live } = useSociaSession();
  const { user, roleKey, roleLabel, can, canAny } = usePermissions();
  const demoRoles = useMockRoles();
  const greetName = user?.name.split(" ")[0] ?? "there";
  const fullName = user?.name ?? "Your account";
  const canManageAccess = can("page.settings") && canAny(["roles.manage", "users.manage"]);
  const [notifAnchorEl, setNotifAnchorEl] = useState<null | HTMLElement>(null);
  const [activityAnchorEl, setActivityAnchorEl] = useState<null | HTMLElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  // Below lg the sidebar becomes a floating menu button that shares this row, so the header
  // is already at its minimum there; folding is a desktop affordance.
  const canFold = useMediaQuery(theme.breakpoints.up("lg"));
  const [storedCollapsed, setCollapsed] = useHeaderCollapsed();
  const collapsed = canFold && storedCollapsed;
  // Relative times are measured from when a panel was opened (keeps render pure).
  const [now, setNow] = useState(0);

  const getPageTitle = () => {
    const path = pathname.split("/").filter(Boolean);
    if (path.length === 0) return "Dashboard";
    const lastPart = path[path.length - 1];
    const titles: Record<string, string> = {
      dashboard: "Dashboard",
      approval: "Rejected news",
      "rejected-news": "Rejected news",
      digital: "Digital Dashboard",
      "ai-content": "Post Studio",
      "web-scraper": "Web Scraper",
      profile: "Your profile",
      access: "Access",
    };
    return titles[lastPart] || lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const formatTime = (timestamp: string) => {
    const diff = now - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const iconColor = mode === "light" ? "#374151" : "#e5e7eb";
  const muted = mode === "light" ? LIGHT_GRAY : "rgba(255,255,255,0.5)";
  const ink = mode === "light" ? BLACK_COLOR : "#fff";
  const rule = mode === "light" ? "#E5E7EB" : "#333";

  return (
    <Box
      component="header"
      sx={{
        position: "relative",
        mx: "auto",
        width: "100%",
        maxWidth: CONTENT_MAX_WIDTH,
        mt: { xs: "8px", lg: "4px" },
        mb: { xs: 1.5, lg: collapsed ? 1 : 1.5 },
        transition: `margin ${FOLD_MS}ms ease`,
      }}
    >
      <Collapse in={!collapsed} timeout={FOLD_MS} appear={false}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            height: HEADER_HEIGHT,
            // Clear the floating menu button the sidebar shows below lg (16px inset + 40px button)
            pl: { xs: "50px", lg: 0 },
            borderBottom: "1px solid",
            borderColor: rule,
          }}
        >
          <Typography
            component="p"
            noWrap
            sx={{ minWidth: 0, flex: "1 1 auto", fontSize: "0.875rem", lineHeight: 1.3, color: ink }}
          >
            <Box component="span" sx={{ color: muted, display: { xs: "none", sm: "inline" } }}>socia / </Box>
            <Box component="span" sx={{ fontWeight: 600 }}>{getPageTitle()}</Box>
            <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
              <Box component="span" aria-hidden sx={{ color: rule, mx: 1.25 }}>|</Box>
              <Box component="span" sx={{ color: muted }}>Hi </Box>
              <Box component="span" sx={{ fontWeight: 600 }}>{greetName}</Box>
            </Box>
          </Typography>

          <Box
            role="toolbar"
            aria-label="Desk tools"
            sx={{ display: "flex", alignItems: "center", gap: { xs: 0.25, sm: 0.5 }, flexShrink: 0 }}
          >
            {/* Account and role */}
            <HeaderAction
              label={roleLabel ? `${fullName}, ${roleLabel}` : fullName}
              aria-haspopup="menu"
              aria-expanded={roleAnchorEl ? "true" : "false"}
              onClick={(e) => setRoleAnchorEl(e.currentTarget)}
            >
              <UserRound size={18} color={iconColor} />
            </HeaderAction>
            <Menu
              anchorEl={roleAnchorEl}
              open={Boolean(roleAnchorEl)}
              onClose={() => setRoleAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.1)",
                    borderRadius: "12px",
                    backgroundColor: "background.paper",
                    minWidth: 220,
                  },
                },
              }}
            >
              <Box sx={{ px: 2, pt: 1, pb: 1.25 }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{fullName}</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{roleLabel}</Typography>
              </Box>
              <Divider />
              <MenuItem component={Link} href="/profile" onClick={() => setRoleAnchorEl(null)} sx={{ gap: 1.25, fontSize: "0.8125rem", mt: 0.5 }}>
                <CircleUserRound size={16} aria-hidden /> Your profile
              </MenuItem>
              {canManageAccess && (
                <MenuItem component={Link} href="/settings/access" onClick={() => setRoleAnchorEl(null)} sx={{ gap: 1.25, fontSize: "0.8125rem" }}>
                  <ShieldCheck size={16} aria-hidden /> Access and roles
                </MenuItem>
              )}
              {!live && <Divider />}
              {!live && (
                <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>
                  Switch role (demo)
                </Typography>
              )}
              {!live &&
                demoRoles.map((role) => (
                  <MenuItem
                    key={role.key}
                    selected={roleKey === role.key}
                    onClick={() => { mockAccess.setSelfRole(role.key); setRoleAnchorEl(null); }}
                    sx={{ fontWeight: roleKey === role.key ? 600 : 400, fontSize: "0.8125rem" }}
                  >
                    {role.label}
                  </MenuItem>
                ))}
            </Menu>

            {/* Activity Timeline */}
            <HeaderAction
              label="Recent activity"
              onClick={(e) => { setNow(Date.now()); setActivityAnchorEl(e.currentTarget); }}
            >
              <Clock size={18} color={iconColor} />
            </HeaderAction>
            <Popover
              open={Boolean(activityAnchorEl)}
              anchorEl={activityAnchorEl}
              onClose={() => setActivityAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.15)",
                    borderRadius: "12px",
                    backgroundColor: "background.paper",
                    width: isMobile ? 320 : 380,
                    maxHeight: 420,
                  },
                },
              }}
            >
              <Box sx={{ p: 2, pb: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Recent Activity</Typography>
              </Box>
              <Divider />
              {live && <LiveActivity formatTime={formatTime} onNavigate={() => setActivityAnchorEl(null)} />}
              {!live && !activity.length && <HeaderEmpty title="No recent activity" text="Approvals, edits and posts will show here." />}
              {!live && (
              <List sx={{ py: 0, maxHeight: 360, overflowY: "auto" }}>
                {activity.slice(0, 10).map((item) => (
                  <ListItem key={item.id} sx={{ py: 1, alignItems: "flex-start" }}>
                    <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                      {item.action === "approved" && <CheckCircle size={14} color="#28a745" />}
                      {item.action === "rejected" && <XCircle size={14} color="#dc3545" />}
                      {item.action === "edited" && <Pencil size={14} color="#3498db" />}
                      {item.action === "generated" && <Sparkles size={14} color="#9b59b6" />}
                      {item.action === "assigned" && <ClipboardList size={14} color="#6c757d" />}
                      {item.action === "published" && <Send size={14} color="#28a745" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.4 }}>
                          <strong>{item.actor}</strong> {item.action} <strong>{item.target}</strong>
                        </Typography>
                      }
                      secondary={
                        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                          {formatTime(item.timestamp)}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
              )}
            </Popover>

            {/* Notifications */}
            <HeaderAction
              label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              onClick={(e) => { setNow(Date.now()); setNotifAnchorEl(e.currentTarget); }}
            >
              <Badge badgeContent={unreadCount} color="error" variant="dot" invisible={unreadCount === 0}>
                <Bell size={18} color={iconColor} />
              </Badge>
            </HeaderAction>
            <Popover
              open={Boolean(notifAnchorEl)}
              anchorEl={notifAnchorEl}
              onClose={() => setNotifAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.15)",
                    borderRadius: "12px",
                    backgroundColor: "background.paper",
                    width: isMobile ? 320 : 380,
                    maxHeight: 420,
                  },
                },
              }}
            >
              <Box sx={{ p: 2, pb: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>Notifications</Typography>
                {unreadCount > 0 && (
                  <Typography
                    sx={{ fontSize: "0.75rem", color: "primary.main", cursor: "pointer", fontWeight: 500 }}
                    onClick={markAllNotificationsRead}
                  >
                    Mark all read
                  </Typography>
                )}
              </Box>
              <Divider />
              {!notifications.length && (
                <HeaderEmpty
                  title="No notifications"
                  text={live ? "You're all caught up. New stories show in the Post Studio queue." : "You're all caught up."}
                />
              )}
              <List sx={{ py: 0, maxHeight: 360, overflowY: "auto" }}>
                {notifications.map((notif) => (
                  <ListItem
                    key={notif.id}
                    onClick={() => markNotificationRead(notif.id)}
                    sx={{
                      py: 1.5,
                      cursor: "pointer",
                      backgroundColor: notif.read ? "transparent" : "action.hover",
                      "&:hover": { backgroundColor: "action.hover" },
                      alignItems: "flex-start",
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                      {NOTIFICATION_ICONS[notif.type] || <Bell size={16} />}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography sx={{ fontSize: "0.8125rem", fontWeight: notif.read ? 400 : 500, lineHeight: 1.4 }}>
                          {notif.message}
                        </Typography>
                      }
                      secondary={
                        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
                          {formatTime(notif.timestamp)}
                        </Typography>
                      }
                    />
                    {!notif.read && (
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#3498db", mt: 1, ml: 1, flexShrink: 0 }} />
                    )}
                  </ListItem>
                ))}
              </List>
            </Popover>

            {/* Theme Toggle */}
            <HeaderAction label={mode === "light" ? "Switch to dark theme" : "Switch to light theme"} onClick={toggleTheme}>
              {mode === "light" ? <Moon size={18} color={iconColor} /> : <Sun size={18} color={iconColor} />}
            </HeaderAction>

            {/* Quick Access; Cmd/Ctrl+K opens it from anywhere */}
            <HeaderAction label="Quick access (⌘K / Ctrl+K)" aria-keyshortcuts="Control+K Meta+K" onClick={() => setSearchOpen(true)}>
              <Zap size={18} color={mode === "light" ? "#2563eb" : "#60a5fa"} />
            </HeaderAction>

            {canFold && (
              <>
                <Box aria-hidden sx={{ width: "1px", height: 20, backgroundColor: rule, mx: 0.5 }} />
                <HeaderAction label="Hide header" aria-expanded="true" onClick={() => setCollapsed(true)}>
                  <ChevronUp size={18} color={iconColor} />
                </HeaderAction>
              </>
            )}
          </Box>
        </Box>
      </Collapse>

      {/* Folded: a hairline with a small tab where the hide chevron was */}
      <Collapse in={collapsed} timeout={FOLD_MS} appear={false} unmountOnExit>
        <Box sx={{ position: "relative", height: 14, borderTop: "1px solid", borderColor: rule }}>
          <Tooltip title="Show header" enterDelay={300} arrow>
            <IconButton
              aria-label="Show header"
              aria-expanded="false"
              onClick={() => setCollapsed(false)}
              sx={{
                position: "absolute",
                top: -1,
                right: 0,
                width: 40,
                height: 18,
                p: 0,
                borderRadius: "0 0 8px 8px",
                border: "1px solid",
                borderTop: "none",
                borderColor: rule,
                backgroundColor: "background.paper",
                "&:hover": { backgroundColor: "action.hover" },
                "&:focus-visible": focusRing,
              }}
            >
              <ChevronDown size={14} color={iconColor} />
            </IconButton>
          </Tooltip>
        </Box>
      </Collapse>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export default DashBoardCommonHeader;
