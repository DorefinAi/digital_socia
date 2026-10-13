"use client";

import {
  Box,
  Typography,
  Button,
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
  Chip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import React, { useState, useEffect } from "react";
import {
  Search,
  Moon,
  Sun,
  Bell,
  User,
  CheckCircle,
  XCircle,
  Pencil,
  Sparkles,
  ClipboardList,
  Send,
  Clock,
} from "lucide-react";
import { usePathname } from "next/navigation";
import SearchModal from "./SearchModal";
import { useThemeMode } from "@/providers/MuiProvider";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { UserRole, ROLE_LABELS } from "@/types/newsroom";

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
  const { currentRole, setRole, notifications, markNotificationRead, markAllNotificationsRead, unreadCount, activity } = useNewsroom();
  const [roleAnchorEl, setRoleAnchorEl] = useState<null | HTMLElement>(null);
  const [notifAnchorEl, setNotifAnchorEl] = useState<null | HTMLElement>(null);
  const [activityAnchorEl, setActivityAnchorEl] = useState<null | HTMLElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const getPageTitle = () => {
    const path = pathname.split("/").filter(Boolean);
    if (path.length === 0) return "Dashboard";
    const lastPart = path[path.length - 1];
    const titles: Record<string, string> = {
      dashboard: "Dashboard",
      approval: "Approval Portal",
      digital: "Digital Dashboard",
      "ai-content": "AI Content Review",
      "web-scraper": "Web Scraper",
      x: "X breaking desk",
      instagram: "Instagram breaking desk",
      youtube: "YouTube review",
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
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", sm: "center" },
        mt: 0,
        py: { xs: 1.5, lg: 1.75 },
        position: "relative",
        mx: "auto",
        borderBottom: "1px solid",
        borderColor: "divider",
        width: "100%",
        maxWidth: "1100px",
        flexDirection: { xs: "column", sm: "row" },
        gap: { xs: 1.5, sm: 0 },
      }}
    >
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
        Digital desk <span style={{ opacity: 0.5, margin: "0 4px" }}>/</span>
        <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
          {getPageTitle()}
        </Box>
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.75, sm: 1 }, flexWrap: "wrap", minWidth: 0 }}>
        {/* Search */}
        <Box
          component="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search (Ctrl+K)"
          sx={{
            display: { xs: "none", md: "flex" },
            alignItems: "center",
            gap: 1,
            width: 240,
            height: 36,
            px: 1.25,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "8px",
            backgroundColor: "background.paper",
            color: "text.secondary",
            fontFamily: "inherit",
            fontSize: "0.8125rem",
            cursor: "pointer",
            "&:hover": { borderColor: "text.secondary" },
          }}
        >
          <Search size={15} />
          <Box component="span" sx={{ flex: 1, textAlign: "left" }}>
            Search stories and posts
          </Box>
          <Box component="kbd" sx={{ px: 0.6, fontSize: "0.6875rem", fontFamily: "inherit", fontWeight: 600, border: "1px solid", borderColor: "divider", borderRadius: "4px" }}>
            Ctrl K
          </Box>
        </Box>

        {/* Role Switcher */}
        <Button
          variant="outlined"
          startIcon={<User size={16} />}
          onClick={(e) => setRoleAnchorEl(e.currentTarget)}
          sx={{
            textTransform: "none",
            borderRadius: "8px",
            color: mode === "light" ? "#1f2937" : "#fff",
            borderColor: mode === "light" ? "#e5e7eb" : "#333",
            backgroundColor: mode === "light" ? "#fff" : "#1e1e1e",
            "&:hover": { borderColor: mode === "light" ? "#d1d5db" : "#444", backgroundColor: mode === "light" ? "#f9fafb" : "#2a2a2a" },
            minHeight: 36,
            px: { xs: 1, sm: 1.5 },
            py: 0.75,
            fontSize: "0.8125rem",
            fontWeight: 600,
          }}
        >
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            {ROLE_LABELS[currentRole]}
          </Box>
          <Box component="span" sx={{ display: { xs: "inline", sm: "none" }, fontSize: "0.75rem" }}>
            Role
          </Box>
        </Button>
        <Menu
          anchorEl={roleAnchorEl}
          open={Boolean(roleAnchorEl)}
          onClose={() => setRoleAnchorEl(null)}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.1)",
                borderRadius: "12px",
                backgroundColor: "background.paper",
                minWidth: 180,
              },
            },
          }}
        >
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
            <MenuItem
              key={role}
              onClick={() => { setRole(role); setRoleAnchorEl(null); }}
              sx={{
                fontWeight: currentRole === role ? 600 : 400,
                backgroundColor: currentRole === role ? "action.selected" : "transparent",
                fontSize: "0.8125rem",
              }}
            >
              {ROLE_LABELS[role]}
            </MenuItem>
          ))}
        </Menu>

        {/* Activity Timeline */}
        <IconButton
          onClick={(e) => setActivityAnchorEl(e.currentTarget)}
          sx={{
            border: "1px solid",
            borderColor: mode === "light" ? "#e5e7eb" : "#333",
            borderRadius: "8px",
            width: 36,
            height: 36,
            p: 0,
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          <Clock size={18} color={mode === "light" ? "#374151" : "#fff"} />
        </IconButton>
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
        </Popover>

        {/* Notifications */}
        <IconButton
          onClick={(e) => setNotifAnchorEl(e.currentTarget)}
          sx={{
            border: "1px solid",
            borderColor: mode === "light" ? "#e5e7eb" : "#333",
            borderRadius: "8px",
            width: 36,
            height: 36,
            p: 0,
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          <Badge badgeContent={unreadCount} color="error" variant="dot" invisible={unreadCount === 0}>
            <Bell size={18} color={mode === "light" ? "#374151" : "#fff"} />
          </Badge>
        </IconButton>
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
        <IconButton
          onClick={toggleTheme}
          sx={{
            border: "1px solid",
            borderColor: mode === "light" ? "#e5e7eb" : "#333",
            borderRadius: "8px",
            width: 36,
            height: 36,
            p: 0,
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          {mode === "light" ? <Moon size={18} color="#374151" /> : <Sun size={18} color="#fff" />}
        </IconButton>

        {/* Mobile search icon */}
        <IconButton
          onClick={() => setSearchOpen(true)}
          sx={{
            display: { xs: "flex", md: "none" },
            border: "1px solid",
            borderColor: mode === "light" ? "#e5e7eb" : "#333",
            borderRadius: "8px",
            width: 36,
            height: 36,
            p: 0,
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          <Search size={18} color={mode === "light" ? "#374151" : "#fff"} />
        </IconButton>
      </Box>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export default DashBoardCommonHeader;
