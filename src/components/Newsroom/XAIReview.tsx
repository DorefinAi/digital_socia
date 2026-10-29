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
  Tabs,
  Tab,
  Avatar,
  LinearProgress,
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
  MessageSquare,
  Repeat,
  Heart,
  Share,
  Sparkles,
  Lock,
  LayoutGrid,
  List,
} from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { useThemeMode } from "@/providers/MuiProvider";
import { AIContent } from "@/types/newsroom";

const XIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#1DA1F2" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

export default function XAIReview() {
  const { aiContent, updateAIContentStatus, updateAIContentCaption, addActivity } = useNewsroom();
  const { can } = usePermissions();
  const { mode } = useThemeMode();
  const theme = useTheme();

  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [tab, setTab] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContent, setSelectedContent] = useState<AIContent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState("");

  const xContent = aiContent.filter((c) => c.platform === "X (Twitter)");

  const filteredContent = xContent.filter((c) => {
    const matchesSearch =
      c.caption.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.campaign.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = tab === "all" || c.status === tab;
    return matchesSearch && matchesTab;
  });

  const openPreview = (item: AIContent) => {
    setSelectedContent(item);
    setEditCaption(item.caption);
    setIsEditing(false);
    setModalOpen(true);
  };

  const handleApprove = () => {
    if (!selectedContent || !can("draft.approve")) return;
    updateAIContentStatus(selectedContent.id, "approved");
    addActivity("approved", "Digital Team", `X Tweet: ${selectedContent.campaign}`, "Tweet approved for posting");
    setModalOpen(false);
  };

  const handleReject = () => {
    if (!selectedContent || !can("draft.reject")) return;
    updateAIContentStatus(selectedContent.id, "rejected");
    addActivity("rejected", "Digital Team", `X Tweet: ${selectedContent.campaign}`, "Tweet rejected");
    setModalOpen(false);
  };

  const handleSaveCaption = () => {
    if (!selectedContent || !can("draft.edit")) return;
    updateAIContentCaption(selectedContent.id, editCaption);
    addActivity("edited", "Digital Team", `X Tweet for ${selectedContent.campaign}`, "Tweet text updated");
    setIsEditing(false);
  };

  const pendingCount = xContent.filter((c) => c.status === "pending").length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 2 }}>
      {/* Platform Screen Header Banner */}
      <Box
        sx={{
          p: 2.5,
          borderRadius: "16px",
          backgroundColor: mode === "light" ? "#F0F9FF" : "#081C26",
          border: "1px solid",
          borderColor: mode === "light" ? "#BAE6FD" : "#0F384C",
          display: "flex",
          justify: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              backgroundColor: mode === "light" ? "#000000" : "#1DA1F2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(29, 161, 242, 0.3)",
            }}
          >
            <XIcon size={22} color="#FFFFFF" />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.25rem", color: mode === "light" ? "#111827" : "#FFFFFF" }}>
              𝕏 (Twitter) AI Review Portal
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: mode === "light" ? "#6B7280" : "#9CA3AF" }}>
              AI-generated breaking tweets, thread hooks & character limit compliance
            </Typography>
          </Box>
        </Box>

        {/* Key Metrics & View Toggle */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <Box sx={{ px: 1.75, py: 0.75, borderRadius: "10px", backgroundColor: mode === "light" ? "#FFF" : "#0F2838", border: "1px solid #BAE6FD", textAlign: "center" }}>
              <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", fontWeight: 500 }}>Total</Typography>
              <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: "#0284C7" }}>{xContent.length}</Typography>
            </Box>
            <Box sx={{ px: 1.75, py: 0.75, borderRadius: "10px", backgroundColor: mode === "light" ? "#FFF" : "#0F2838", border: "1px solid #BAE6FD", textAlign: "center" }}>
              <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", fontWeight: 500 }}>Pending</Typography>
              <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: "#E65100" }}>{pendingCount}</Typography>
            </Box>
          </Box>

          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, val) => val && setViewMode(val)}
            size="small"
            sx={{
              height: 38,
              "& .MuiToggleButton-root": {
                px: 1.25,
                borderRadius: "8px",
                borderColor: "#BAE6FD",
                "&.Mui-selected": {
                  backgroundColor: mode === "light" ? "#000000" : "#1DA1F2",
                  color: "#FFF",
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
      </Box>

      {/* Control Bar: Search & Status Tabs */}
      <Box sx={{ backgroundColor: "background.paper", borderRadius: "12px", p: 1.75, border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <TextField
            placeholder="Search tweets & campaign threads..."
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
              minWidth: { xs: "100%", sm: 260 },
              "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.8125rem", height: 38 },
            }}
          />

          <Tabs
            value={tab}
            onChange={(_, val) => setTab(val)}
            sx={{
              minHeight: 38,
              "& .MuiTab-root": { minHeight: 38, textTransform: "none", fontWeight: 600, fontSize: "0.8125rem", px: 2 },
            }}
          >
            <Tab label="All Tweets" value="all" />
            <Tab label={`Pending (${pendingCount})`} value="pending" />
            <Tab label="Approved" value="approved" />
            <Tab label="Rejected" value="rejected" />
          </Tabs>
        </Box>
      </Box>

      {/* VIEW MODE 1: CARDS VIEW */}
      {viewMode === "cards" && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2.5 }}>
          {filteredContent.map((item) => {
            const charCount = item.caption.length;
            const isOverLimit = charCount > 280;

            return (
              <Box
                key={item.id}
                sx={{
                  backgroundColor: "background.paper",
                  borderRadius: "14px",
                  p: 2.25,
                  border: "1px solid",
                  borderColor: "divider",
                  boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.5,
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": { transform: "translateY(-2px)", boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.08)" },
                }}
              >
                {/* Tweet Header */}
                <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                  <Box sx={{ display: "flex", gap: 1.25, alignItems: "center" }}>
                    <Avatar sx={{ width: 36, height: 36, backgroundColor: mode === "light" ? "#000" : "#1DA1F2", fontWeight: 700, fontSize: "0.875rem" }}>
                      V
                    </Avatar>
                    <Box>
                      <Typography sx={{ fontSize: "0.875rem", fontWeight: 700, lineHeight: 1.2 }}>
                        Vartaman AI News
                      </Typography>
                      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                        @vartaman_ai
                      </Typography>
                    </Box>
                  </Box>
                  <Chip
                    label={item.status}
                    size="small"
                    sx={{
                      backgroundColor:
                        item.status === "approved"
                          ? "#E8F5E9"
                          : item.status === "rejected"
                          ? "#FFEBEE"
                          : "#FFF8E1",
                      color:
                        item.status === "approved"
                          ? "#2E7D32"
                          : item.status === "rejected"
                          ? "#C62828"
                          : "#F57F17",
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      textTransform: "capitalize",
                    }}
                  />
                </Box>

                {/* Tweet Body Text */}
                <Typography sx={{ fontSize: "0.875rem", lineHeight: 1.5, fontWeight: 500 }}>
                  {item.caption}
                </Typography>

                {/* Media Attachment */}
                <Box sx={{ borderRadius: "12px", overflow: "hidden", height: 140, width: "100%", backgroundColor: "#000", cursor: "pointer" }} onClick={() => openPreview(item)}>
                  <img src={item.imageUrl} alt="Tweet Media" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </Box>

                {/* Character Limit Indicator */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min((charCount / 280) * 100, 100)}
                    color={isOverLimit ? "error" : "info"}
                    sx={{ flex: 1, height: 5, borderRadius: "4px" }}
                  />
                  <Typography sx={{ fontSize: "0.7rem", fontWeight: 700, color: isOverLimit ? "error.main" : "text.secondary" }}>
                    {charCount}/280
                  </Typography>
                </Box>

                {/* Tweet Footer Controls */}
                <Box sx={{ mt: "auto", pt: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => openPreview(item)}
                    startIcon={<Eye size={14} />}
                    sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem" }}
                  >
                    Inspect Tweet
                  </Button>
                  {item.status === "pending" && can("draft.approve") && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => {
                        updateAIContentStatus(item.id, "approved");
                        addActivity("approved", "Digital Team", `X Tweet: ${item.campaign}`, "Tweet approved");
                      }}
                      sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", backgroundColor: mode === "light" ? "#000" : "#1DA1F2" }}
                    >
                      Approve Tweet
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* VIEW MODE 2: LIST VIEW TABLE */}
      {viewMode === "list" && (
        <TableContainer component={Paper} sx={{ borderRadius: "12px", border: "1px solid", borderColor: "divider" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: mode === "light" ? "#F0F9FF" : "#0F2838" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Media</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Campaign</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Tweet Text</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Chars</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContent.map((item) => (
                <TableRow key={item.id} hover onClick={() => openPreview(item)} sx={{ cursor: "pointer" }}>
                  <TableCell>
                    <Box sx={{ width: 44, height: 44, borderRadius: "8px", overflow: "hidden" }}>
                      <img src={item.imageUrl} alt="Tweet" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", fontWeight: 700, color: "#0284C7" }}>{item.campaign}</TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", fontWeight: 500, maxWidth: 320 }}>{item.caption}</TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", fontWeight: 600 }}>{item.caption.length}/280</TableCell>
                  <TableCell>
                    <Chip label={item.status} size="small" sx={{ fontSize: "0.65rem", fontWeight: 700 }} />
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button size="small" variant="outlined" onClick={() => openPreview(item)} sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem" }}>Inspect</Button>
                      {item.status === "pending" && can("draft.approve") && (
                        <Button size="small" variant="contained" onClick={() => updateAIContentStatus(item.id, "approved")} sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem", backgroundColor: mode === "light" ? "#000" : "#1DA1F2" }}>Approve</Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tweet Inspection & Edit Modal */}
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
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <XIcon size={20} color="#1DA1F2" />
                <Typography sx={{ fontWeight: 700, fontSize: "1.125rem" }}>
                  𝕏 Tweet Inspection
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setModalOpen(false)}>
                <XCircle size={20} />
              </IconButton>
            </Box>

            <Box sx={{ borderRadius: "12px", overflow: "hidden", height: 200, backgroundColor: "#000" }}>
              <img src={selectedContent.imageUrl} alt="Media" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: "text.secondary" }}>
                Tweet Content ({editCaption.length}/280 chars)
              </Typography>
              {isEditing ? (
                <TextField
                  multiline
                  rows={3}
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.875rem" } }}
                />
              ) : (
                <Typography sx={{ fontSize: "0.875rem", lineHeight: 1.5, p: 1.5, borderRadius: "10px", backgroundColor: mode === "light" ? "#f9fafb" : "#222" }}>
                  {selectedContent.caption}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end", mt: 1 }}>
              {isEditing ? (
                <Button variant="contained" size="small" onClick={handleSaveCaption} sx={{ borderRadius: "8px" }}>
                  Save Tweet
                </Button>
              ) : (
                <Button variant="outlined" size="small" onClick={() => setIsEditing(true)} startIcon={<Pencil size={14} />} sx={{ borderRadius: "8px" }}>
                  Edit Tweet
                </Button>
              )}
              {selectedContent.status === "pending" && can("draft.approve") && (
                <>
                  <Button variant="outlined" color="error" size="small" onClick={handleReject} disabled={!can("draft.reject")} startIcon={<XCircle size={14} />} sx={{ borderRadius: "8px" }}>
                    Reject
                  </Button>
                  <Button variant="contained" color="success" size="small" onClick={handleApprove} startIcon={<CheckCircle size={14} />} sx={{ borderRadius: "8px" }}>
                    Approve Tweet
                  </Button>
                </>
              )}
            </Box>
          </Box>
        </Modal>
      )}
    </Box>
  );
}
