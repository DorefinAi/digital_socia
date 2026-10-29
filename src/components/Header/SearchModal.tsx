"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  Box,
  Typography,
  InputBase,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
} from "@mui/material";
import {
  Search,
  LayoutDashboard,
  ClipboardList,
  XCircle,
  BarChart3,
  Sparkles,
  Filter,
  Globe,
  UserRound,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { REJECTED_NEWS_LABEL, REJECTED_NEWS_PATH, REJECTED_NEWS_PERMISSION } from "@/lib/rejectedNews";
import { usePermissions } from "@/lib/access/usePermissions";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { useThemeMode } from "@/providers/MuiProvider";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

  const renderIcon = (type: string) => {
    switch (type) {
      case "story": return <ClipboardList size={18} />;
      case "reporter": return <Filter size={18} />;
      case "ai": return <Sparkles size={18} />;
      default: return <LayoutDashboard size={18} />;
    }
  };

const SearchModal: React.FC<SearchModalProps> = ({ open, onClose }) => {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const router = useRouter();
  const { stories, aiContent, reporters } = useNewsroom();
  const { can, canAny } = usePermissions();
  const { mode } = useThemeMode();

  const navItems = [
    { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard size={18} />, accessible: can("page.dashboard") },
    { label: REJECTED_NEWS_LABEL, path: REJECTED_NEWS_PATH, icon: <XCircle size={18} />, accessible: can(REJECTED_NEWS_PERMISSION) },
    { label: "Digital Dashboard", path: "/digital", icon: <BarChart3 size={18} />, accessible: can("page.dashboard") },
    { label: "Post Studio", path: "/ai-content", icon: <Sparkles size={18} />, accessible: canAny(["page.post_studio.x", "page.post_studio.instagram", "page.post_studio.facebook", "page.post_studio.youtube"]) },
    { label: "Web Scraper", path: "/web-scraper", icon: <Globe size={18} />, accessible: can("page.web_scraper") },
    { label: "Your profile", path: "/profile", icon: <UserRound size={18} />, accessible: true },
    { label: "Access", path: "/settings/access", icon: <ShieldCheck size={18} />, accessible: can("page.settings") && canAny(["roles.manage", "users.manage"]) },
  ];

  const filterTypes = [
    { key: "all", label: "All" },
    { key: "stories", label: "Stories" },
    { key: "reporters", label: "Reporters" },
    { key: "ai", label: "Post Studio" },
  ];

  type SearchResult = { label: string; path: string; type: "story" | "reporter" | "ai" | "nav"; icon?: React.ReactNode };

  const getFilteredResults = (): SearchResult[] => {
    const q = search.toLowerCase();
    if (!q) return navItems.filter((i) => i.accessible).map((item) => ({ label: item.label, path: item.path, type: "nav" as const, icon: item.icon }));

    const results: SearchResult[] = [];

    if (filterType === "all" || filterType === "stories") {
      stories.forEach((s) => {
        if (
          s.title.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.reporter.toLowerCase().includes(q) ||
          s.status.toLowerCase().includes(q)
        ) {
          results.push({ label: s.title, path: "/approval", type: "story" });
        }
      });
    }

    if (filterType === "all" || filterType === "reporters") {
      reporters.forEach((r) => {
        if (r.name.toLowerCase().includes(q) || r.beat.toLowerCase().includes(q)) {
          results.push({ label: r.name, path: "/approval", type: "reporter" });
        }
      });
    }

    if (filterType === "all" || filterType === "ai") {
      aiContent.forEach((c) => {
        if (
          c.caption.toLowerCase().includes(q) ||
          c.platform.toLowerCase().includes(q) ||
          c.campaign.toLowerCase().includes(q)
        ) {
          results.push({ label: c.caption.slice(0, 60) + "...", path: "/ai-content", type: "ai" });
        }
      });
    }

    if (filterType === "all") {
      navItems.forEach((item) => {
        if (item.label.toLowerCase().includes(q) && item.accessible) {
          results.push({ label: item.label, path: item.path, type: "nav" });
        }
      });
    }

    return results;
  };

  const filteredResults = getFilteredResults();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <Modal open={open} onClose={onClose}>
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "calc(100vw - 32px)",
          maxWidth: { xs: 360, sm: 460, md: 520 },
          maxHeight: "min(560px, calc(100dvh - 48px))",
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "12px",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
          outline: "none",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            px: 2,
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Search size={20} style={{ color: mode === "light" ? "#6D6E6F" : "#b0b0b0" }} />
          <InputBase
            placeholder="Search stories, reporters, content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            sx={{
              flex: 1,
              color: "text.primary",
              fontSize: "0.9375rem",
            }}
          />
        </Box>

        {/* Filter chips */}
        <Box sx={{ display: "flex", gap: 0.75, px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider" }}>
          {filterTypes.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              size="small"
              onClick={() => setFilterType(f.key)}
              sx={{
                fontSize: "0.75rem",
                fontWeight: filterType === f.key ? 600 : 400,
                backgroundColor: filterType === f.key ? "text.primary" : "action.hover",
                color: filterType === f.key ? (mode === "light" ? "#fff" : "#000") : "text.secondary",
                borderRadius: "8px",
                height: 28,
                "&:hover": {
                  backgroundColor: filterType === f.key ? "text.primary" : "action.hover",
                },
              }}
            />
          ))}
        </Box>

        <List
          sx={{
            p: 1,
            maxHeight: "calc(min(560px, calc(100dvh - 48px)) - 100px)",
            overflowY: "auto",
          }}
        >
          {filteredResults.map((item, i) => (
            <ListItem key={`${item.path}-${i}`} disablePadding>
              <ListItemButton
                onClick={() => { router.push(item.path); onClose(); }}
                sx={{ borderRadius: "8px", minHeight: 44, px: 1.5, py: 0.75 }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: "text.primary" }}>
                  {item.icon || renderIcon(item.type)}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  secondary={item.type !== "nav" ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : undefined}
                  slotProps={{
                    primary: { sx: { fontSize: "0.875rem", fontWeight: 500 } },
                    secondary: { sx: { fontSize: "0.75rem" } },
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}

          {search && filteredResults.length === 0 && (
            <Typography sx={{ p: 2, textAlign: "center", color: "text.secondary", fontSize: "0.875rem" }}>
              No results found for &quot;{search}&quot;
            </Typography>
          )}
        </List>
      </Box>
    </Modal>
  );
};

export default SearchModal;
