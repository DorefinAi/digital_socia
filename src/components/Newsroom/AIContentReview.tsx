"use client";

import React, { useState } from "react";
import {
  Box,
  Typography,
  Chip,
  Button,
  TextField,
  Modal,
  InputAdornment,
  useTheme,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import {
  Search,
  CheckCircle,
  XCircle,
  Pencil,
  Eye,
  Sparkles,
  Lock,
  RotateCcw,
  LayoutGrid,
  List,
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { useThemeMode } from "@/providers/MuiProvider";
import { AIContent, Platform } from "@/types/newsroom";

const YoutubeIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#FF0000" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const InstagramIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#E4405F" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const XIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#1DA1F2" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

export default function AIContentReview() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const platformParam = searchParams.get("platform");

  const { aiContent, updateAIContentStatus, updateAIContentCaption, addActivity } = useNewsroom();

  const { can } = usePermissions();
  const { mode } = useThemeMode();
  const theme = useTheme();

  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">((platformParam as any) || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContent, setSelectedContent] = useState<AIContent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [editCaption, setEditCaption] = useState("");

  const filteredContent = aiContent.filter((item) => {
    const matchesPlatform = platformFilter === "all" || item.platform === platformFilter;
    const matchesSearch =
      item.caption.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.campaign.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPlatform && matchesSearch;
  });

  const handleOpenPreview = (item: AIContent) => {
    setSelectedContent(item);
    setEditCaption(item.caption);
    setIsEditingCaption(false);
    setModalOpen(true);
  };

  const handleApprove = () => {
    if (!selectedContent || !can("draft.approve")) return;
    updateAIContentStatus(selectedContent.id, "approved");
    addActivity("approved", "Digital Team", `AI post for ${selectedContent.platform}`, "Content approved");
    setModalOpen(false);
  };

  const handleReject = () => {
    if (!selectedContent || !can("draft.reject")) return;
    updateAIContentStatus(selectedContent.id, "rejected");
    addActivity("rejected", "Digital Team", `AI post for ${selectedContent.platform}`, "Content rejected");
    setModalOpen(false);
  };

  const handleSaveCaption = () => {
    if (!selectedContent || !can("draft.edit")) return;
    updateAIContentCaption(selectedContent.id, editCaption);
    addActivity("edited", "Digital Team", `AI caption for ${selectedContent.platform}`, "Caption updated");
    setIsEditingCaption(false);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Sparkles size={20} color="#9b59b6" />
          <Typography sx={{ fontWeight: 600, fontSize: "1.125rem" }}>
            Post Studio Overview
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", ml: 1 }}>
            {filteredContent.length} items
          </Typography>
        </Box>

        {/* View Toggle */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, val) => val && setViewMode(val)}
          size="small"
          sx={{
            height: 36,
            "& .MuiToggleButton-root": {
              px: 1.25,
              borderRadius: "8px",
              borderColor: "divider",
              "&.Mui-selected": {
                backgroundColor: mode === "light" ? "#000" : "#fff",
                color: mode === "light" ? "#fff" : "#000",
              },
            },
          }}
        >
          <ToggleButton value="cards">
            <Tooltip title="Cards View"><Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><LayoutGrid size={15} /><Typography sx={{ fontSize: "0.75rem", textTransform: "none", fontWeight: 600 }}>Cards</Typography></Box></Tooltip>
          </ToggleButton>
          <ToggleButton value="list">
            <Tooltip title="List View"><Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><List size={15} /><Typography sx={{ fontSize: "0.75rem", textTransform: "none", fontWeight: 600 }}>List</Typography></Box></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Control Toolbar */}
      <Box sx={{ backgroundColor: "background.paper", borderRadius: "12px", p: 1.75, border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField
            placeholder="Search AI posts, captions, campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} style={{ color: "#6D6E6F" }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              flex: 1,
              minWidth: { xs: "100%", sm: 240 },
              "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.8125rem", height: 38 },
            }}
          />
        </Box>
      </Box>

      {/* VIEW MODE 1: CARDS VIEW */}
      {viewMode === "cards" && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2 }}>
          {filteredContent.map((item) => (
            <Box
              key={item.id}
              sx={{
                backgroundColor: "background.paper",
                borderRadius: "12px",
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)",
                display: "flex",
                flexDirection: "column",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": { transform: "translateY(-2px)", boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.08)" },
              }}
            >
              <Box sx={{ position: "relative", width: "100%", height: 160, backgroundColor: "#000", cursor: "pointer" }} onClick={() => handleOpenPreview(item)}>
                <img src={item.imageUrl} alt="AI Content" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <Chip
                  label={item.platform}
                  size="small"
                  sx={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    backgroundColor: "rgba(0,0,0,0.8)",
                    color: "#FFF",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}
                />
              </Box>

              <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25, flex: 1 }}>
                <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.45, fontWeight: 500 }}>
                  {item.caption}
                </Typography>

                <Box sx={{ mt: "auto", pt: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Button size="small" variant="outlined" onClick={() => handleOpenPreview(item)} startIcon={<Eye size={14} />} sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem" }}>
                    Inspect
                  </Button>
                  {item.status === "pending" && can("draft.approve") && (
                    <Button size="small" variant="contained" onClick={() => updateAIContentStatus(item.id, "approved")} sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem" }}>
                      Approve
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* VIEW MODE 2: LIST VIEW TABLE */}
      {viewMode === "list" && (
        <TableContainer component={Paper} sx={{ borderRadius: "12px", border: "1px solid", borderColor: "divider" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: mode === "light" ? "#f9fafb" : "#1a1a1a" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Media</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Platform</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Campaign</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Caption</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContent.map((item) => (
                <TableRow key={item.id} hover onClick={() => handleOpenPreview(item)} sx={{ cursor: "pointer" }}>
                  <TableCell>
                    <Box sx={{ width: 44, height: 44, borderRadius: "6px", overflow: "hidden" }}>
                      <img src={item.imageUrl} alt="AI" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", fontWeight: 700 }}>{item.platform}</TableCell>
                  <TableCell sx={{ fontSize: "0.75rem" }}>{item.campaign}</TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", maxWidth: 300 }}>{item.caption}</TableCell>
                  <TableCell>
                    <Chip label={item.status} size="small" sx={{ fontSize: "0.65rem", fontWeight: 700 }} />
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button size="small" variant="outlined" onClick={() => handleOpenPreview(item)} sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem" }}>Inspect</Button>
                      {item.status === "pending" && can("draft.approve") && (
                        <Button size="small" variant="contained" onClick={() => updateAIContentStatus(item.id, "approved")} sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem" }}>Approve</Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Modal */}
      {selectedContent && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: { xs: "90vw", sm: 540 },
              maxHeight: "85vh",
              backgroundColor: "background.paper",
              borderRadius: "16px",
              p: 3,
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: "1.125rem" }}>
              {selectedContent.platform} Content Inspection
            </Typography>
            <Box sx={{ borderRadius: "12px", overflow: "hidden", height: 200, backgroundColor: "#000" }}>
              <img src={selectedContent.imageUrl} alt="AI Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Box>
            <Typography sx={{ fontSize: "0.875rem", lineHeight: 1.5, p: 1.5, borderRadius: "10px", backgroundColor: mode === "light" ? "#f9fafb" : "#222" }}>
              {selectedContent.caption}
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
              <Button variant="outlined" color="error" size="small" onClick={handleReject} disabled={!can("draft.reject")} sx={{ borderRadius: "8px" }}>Reject</Button>
              <Button variant="contained" color="success" size="small" onClick={handleApprove} sx={{ borderRadius: "8px" }}>Approve</Button>
            </Box>
          </Box>
        </Modal>
      )}
    </Box>
  );
}
