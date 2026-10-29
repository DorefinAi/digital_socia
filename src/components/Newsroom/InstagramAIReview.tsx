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
  Heart,
  MessageCircle,
  Share2,
  Sparkles,
  Lock,
  LayoutGrid,
  List,
} from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { useThemeMode } from "@/providers/MuiProvider";
import { AIContent } from "@/types/newsroom";

const InstagramIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = "#E4405F" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

export default function InstagramAIReview() {
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

  const instagramContent = aiContent.filter((c) => c.platform === "Instagram");

  const filteredContent = instagramContent.filter((c) => {
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
    addActivity("approved", "Digital Team", `Instagram AI Post: ${selectedContent.campaign}`, "Post approved for Instagram feed");
    setModalOpen(false);
  };

  const handleReject = () => {
    if (!selectedContent || !can("draft.reject")) return;
    updateAIContentStatus(selectedContent.id, "rejected");
    addActivity("rejected", "Digital Team", `Instagram AI Post: ${selectedContent.campaign}`, "Post rejected");
    setModalOpen(false);
  };

  const handleSaveCaption = () => {
    if (!selectedContent || !can("draft.edit")) return;
    updateAIContentCaption(selectedContent.id, editCaption);
    addActivity("edited", "Digital Team", `Instagram caption for ${selectedContent.campaign}`, "Caption updated");
    setIsEditing(false);
  };

  const pendingCount = instagramContent.filter((c) => c.status === "pending").length;
  const approvedCount = instagramContent.filter((c) => c.status === "approved").length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mt: 2 }}>
      {/* Platform Screen Header Banner */}
      <Box
        sx={{
          p: 2.5,
          borderRadius: "16px",
          backgroundColor: mode === "light" ? "#FDF2F8" : "#210A18",
          border: "1px solid",
          borderColor: mode === "light" ? "#FBCFE8" : "#4A1535",
          display: "flex",
          justifyContent: "space-between",
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
              background: "linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(228, 64, 95, 0.3)",
            }}
          >
            <InstagramIcon size={24} color="#FFFFFF" />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.25rem", color: mode === "light" ? "#111827" : "#FFFFFF" }}>
              Instagram AI Review Portal
            </Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: mode === "light" ? "#6B7280" : "#9CA3AF" }}>
              AI-generated feed posts, Reels captions & hashtag optimization for @vartaman_news
            </Typography>
          </Box>
        </Box>

        {/* Key Metrics & View Toggle */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <Box sx={{ px: 1.75, py: 0.75, borderRadius: "10px", backgroundColor: mode === "light" ? "#FFF" : "#2E0E22", border: "1px solid #FBCFE8", textAlign: "center" }}>
              <Typography sx={{ fontSize: "0.7rem", color: "text.secondary", fontWeight: 500 }}>Total</Typography>
              <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: "#BE185D" }}>{instagramContent.length}</Typography>
            </Box>
            <Box sx={{ px: 1.75, py: 0.75, borderRadius: "10px", backgroundColor: mode === "light" ? "#FFF" : "#2E0E22", border: "1px solid #FBCFE8", textAlign: "center" }}>
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
                borderColor: "#FBCFE8",
                "&.Mui-selected": {
                  backgroundColor: "#E4405F",
                  color: "#FFF",
                  "&:hover": { backgroundColor: "#C13584" },
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
            placeholder="Search Instagram posts & hashtags..."
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
            <Tab label="All Posts" value="all" />
            <Tab label={`Pending (${pendingCount})`} value="pending" />
            <Tab label="Approved" value="approved" />
            <Tab label="Rejected" value="rejected" />
          </Tabs>
        </Box>
      </Box>

      {/* VIEW MODE 1: CARDS VIEW */}
      {viewMode === "cards" && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2.5 }}>
          {filteredContent.map((item) => (
            <Box
              key={item.id}
              sx={{
                backgroundColor: "background.paper",
                borderRadius: "14px",
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
              {/* Instagram Header Mock */}
              <Box sx={{ p: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid", borderColor: "divider" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Avatar sx={{ width: 28, height: 28, background: "linear-gradient(45deg, #f09433, #dc2743)", fontSize: "0.75rem", fontWeight: 700 }}>
                    V
                  </Avatar>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>
                    vartaman_news
                  </Typography>
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

              {/* Photo / Reel Image */}
              <Box sx={{ position: "relative", width: "100%", height: 220, backgroundColor: "#000", cursor: "pointer" }} onClick={() => openPreview(item)}>
                <img src={item.imageUrl} alt="Instagram Post" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <Chip
                  label={`AI Confidence ${Math.round(item.confidenceScore * 100)}%`}
                  size="small"
                  sx={{
                    position: "absolute",
                    bottom: 10,
                    left: 10,
                    backgroundColor: "rgba(0,0,0,0.75)",
                    color: "#FFF",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    backdropFilter: "blur(4px)",
                  }}
                />
              </Box>

              {/* Instagram Action Icons Mock & Caption */}
              <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "text.secondary" }}>
                  <Heart size={18} />
                  <MessageCircle size={18} />
                  <Share2 size={18} />
                  <Typography sx={{ ml: "auto", fontSize: "0.75rem", fontWeight: 600, color: "#E4405F" }}>
                    {item.campaign}
                  </Typography>
                </Box>

                <Typography
                  sx={{
                    fontSize: "0.8125rem",
                    lineHeight: 1.45,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  <strong>vartaman_news</strong> {item.caption}
                </Typography>

                <Box sx={{ mt: "auto", pt: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => openPreview(item)}
                    startIcon={<Eye size={14} />}
                    sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", borderColor: "#FBCFE8", color: "#BE185D" }}
                  >
                    Full Preview
                  </Button>
                  {item.status === "pending" && can("draft.approve") && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => {
                        updateAIContentStatus(item.id, "approved");
                        addActivity("approved", "Digital Team", `Instagram AI Post: ${item.campaign}`, "Post approved");
                      }}
                      sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", backgroundColor: "#E4405F", "&:hover": { backgroundColor: "#C13584" } }}
                    >
                      Approve Post
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
              <TableRow sx={{ backgroundColor: mode === "light" ? "#FDF2F8" : "#2E0E22" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Post Photo</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Campaign</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Caption & Hashtags</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>AI Confidence</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContent.map((item) => (
                <TableRow key={item.id} hover onClick={() => openPreview(item)} sx={{ cursor: "pointer" }}>
                  <TableCell>
                    <Box sx={{ width: 44, height: 44, borderRadius: "8px", overflow: "hidden" }}>
                      <img src={item.imageUrl} alt="Post" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", fontWeight: 700, color: "#BE185D" }}>{item.campaign}</TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", fontWeight: 500, maxWidth: 300 }}>{item.caption}</TableCell>
                  <TableCell sx={{ fontSize: "0.75rem" }}>{Math.round(item.confidenceScore * 100)}%</TableCell>
                  <TableCell>
                    <Chip label={item.status} size="small" sx={{ fontSize: "0.65rem", fontWeight: 700 }} />
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button size="small" variant="outlined" onClick={() => openPreview(item)} sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem" }}>Inspect</Button>
                      {item.status === "pending" && can("draft.approve") && (
                        <Button size="small" variant="contained" onClick={() => updateAIContentStatus(item.id, "approved")} sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem", backgroundColor: "#E4405F" }}>Approve</Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Full Instagram Post Preview Modal */}
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
                <InstagramIcon size={22} color="#E4405F" />
                <Typography sx={{ fontWeight: 700, fontSize: "1.125rem" }}>
                  Instagram Feed Preview
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setModalOpen(false)}>
                <XCircle size={20} />
              </IconButton>
            </Box>

            <Box sx={{ borderRadius: "12px", overflow: "hidden", height: 260, backgroundColor: "#000" }}>
              <img src={selectedContent.imageUrl} alt="Instagram Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: "text.secondary" }}>
                Caption & Hashtag Stack
              </Typography>
              {isEditing ? (
                <TextField
                  multiline
                  rows={4}
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.875rem" } }}
                />
              ) : (
                <Typography sx={{ fontSize: "0.875rem", lineHeight: 1.5, p: 1.5, borderRadius: "10px", backgroundColor: mode === "light" ? "#f9fafb" : "#222" }}>
                  <strong>@vartaman_news</strong> {selectedContent.caption}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end", mt: 1 }}>
              {isEditing ? (
                <Button variant="contained" size="small" onClick={handleSaveCaption} sx={{ borderRadius: "8px" }}>
                  Save Caption
                </Button>
              ) : (
                <Button variant="outlined" size="small" onClick={() => setIsEditing(true)} startIcon={<Pencil size={14} />} sx={{ borderRadius: "8px" }}>
                  Edit Caption
                </Button>
              )}
              {selectedContent.status === "pending" && can("draft.approve") && (
                <>
                  <Button variant="outlined" color="error" size="small" onClick={handleReject} disabled={!can("draft.reject")} startIcon={<XCircle size={14} />} sx={{ borderRadius: "8px" }}>
                    Reject
                  </Button>
                  <Button variant="contained" color="success" size="small" onClick={handleApprove} startIcon={<CheckCircle size={14} />} sx={{ borderRadius: "8px" }}>
                    Approve Post
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
