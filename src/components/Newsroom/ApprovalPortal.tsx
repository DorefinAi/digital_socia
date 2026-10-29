"use client";

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
  Select,
  MenuItem,
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
import React, { useState } from "react";
import {
  Search,
  CheckCircle,
  XCircle,
  Pencil,
  Save,
  X,
  Lock,
  LayoutGrid,
  List,
  Eye,
  RotateCcw,
  Sparkles,
  User,
  Clock,
} from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { useThemeMode } from "@/providers/MuiProvider";
import { Story, StoryStatus, StoryCategory } from "@/types/newsroom";

const STATUS_COLORS: Record<StoryStatus, { bg: string; text: string }> = {
  draft: { bg: "#F5F5F5", text: "#666" },
  assigned: { bg: "#E3F2FD", text: "#1565C0" },
  pending_review: { bg: "#FFF3E0", text: "#E65100" },
  pending_approval: { bg: "#FFF8E1", text: "#F57F17" },
  approved: { bg: "#E8F5E9", text: "#2E7D32" },
  rejected: { bg: "#FFEBEE", text: "#C62828" },
  published: { bg: "#E0F2F1", text: "#00695C" },
};

const ApprovalPortal: React.FC = () => {
  const { stories, updateStoryStatus, updateStory, addActivity } = useNewsroom();
  const { can } = usePermissions();
  const { mode } = useThemeMode();
  const theme = useTheme();

  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StoryStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<StoryCategory | "all">("all");
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "week" | "month" | "all">("all");

  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editSummary, setEditSummary] = useState("");

  const filteredStories = stories.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.reporter.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || s.category === categoryFilter;

    // Date Filter Logic (Default: All Time)
    let matchesDate = true;
    const storyDate = new Date(s.createdAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 30);

    if (dateFilter === "today") {
      matchesDate = storyDate >= today;
    } else if (dateFilter === "yesterday") {
      matchesDate = storyDate >= yesterday && storyDate < today;
    } else if (dateFilter === "week") {
      matchesDate = storyDate >= lastWeek;
    } else if (dateFilter === "month") {
      matchesDate = storyDate >= lastMonth;
    }

    return matchesSearch && matchesStatus && matchesCategory && matchesDate;
  });

  const openStoryModal = (story: Story) => {
    setSelectedStory(story);
    setEditTitle(story.title);
    setEditBody(story.body);
    setEditSummary(story.aiSummary);
    setIsEditing(false);
    setModalOpen(true);
  };

  const handleApprove = (storyId?: string, title?: string) => {
    const targetId = storyId || selectedStory?.id;
    const targetTitle = title || selectedStory?.title;
    if (!targetId || !can("draft.approve")) return;
    updateStoryStatus(targetId, "approved");
    addActivity("approved", "Editor", targetTitle || "Story", "Story approved for publication");
    if (selectedStory?.id === targetId) {
      setModalOpen(false);
      setSelectedStory(null);
    }
  };

  const handleReject = (storyId?: string, title?: string) => {
    const targetId = storyId || selectedStory?.id;
    const targetTitle = title || selectedStory?.title;
    if (!targetId || !can("draft.reject")) return;
    updateStoryStatus(targetId, "rejected");
    addActivity("rejected", "Editor", targetTitle || "Story", "Story rejected from Approval Portal");
    if (selectedStory?.id === targetId) {
      setModalOpen(false);
      setSelectedStory(null);
    }
  };

  const handleSave = () => {
    if (!selectedStory || !can("draft.edit")) return;
    updateStory(selectedStory.id, {
      title: editTitle,
      body: editBody,
      aiSummary: editSummary,
    });
    addActivity("edited", "Editor", selectedStory.title, "Story content updated");
    setIsEditing(false);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
      {/* Header with Title, Count & View Switcher */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: "1.125rem" }}>
            News Approval Portal
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
            {filteredStories.length} stories
          </Typography>
        </Box>

        {/* Cards vs List View Toggle CTA */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontWeight: 500 }}>
            View:
          </Typography>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, val) => val && setViewMode(val)}
            size="small"
            sx={{
              height: 36,
              "& .MuiToggleButton-root": {
                px: 1.25,
                py: 0.5,
                borderRadius: "8px",
                borderColor: "divider",
                "&.Mui-selected": {
                  backgroundColor: mode === "light" ? "#000" : "#fff",
                  color: mode === "light" ? "#fff" : "#000",
                  "&:hover": { backgroundColor: mode === "light" ? "#222" : "#eee" },
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

      {/* Search & Dropdown Filters Toolbar */}
      <Box sx={{ backgroundColor: "background.paper", borderRadius: "12px", p: 1.75, boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)", border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", gap: 1.25, flexWrap: "wrap", alignItems: "center" }}>
          {/* Search Bar */}
          <TextField
            placeholder="Search stories by headline, reporter, category..."
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
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <X size={14} style={{ cursor: "pointer", color: "#999" }} onClick={() => setSearchQuery("")} />
                  </InputAdornment>
                ) : null,
              },
            }}
            sx={{
              flex: 1,
              minWidth: { xs: "100%", sm: 220 },
              "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.8125rem", height: 38 },
            }}
          />

          {/* Filter Dropdowns */}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            {/* Date Filter Dropdown (Default: All Time) */}
            <Select
              size="small"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              displayEmpty
              sx={{
                borderRadius: "10px",
                fontSize: "0.8125rem",
                height: 38,
                minWidth: 130,
                backgroundColor: dateFilter !== "all" ? (mode === "light" ? "#f3f4f6" : "#2a2a2a") : "transparent",
                fontWeight: 600,
              }}
            >
              <MenuItem value="all" sx={{ fontSize: "0.8125rem" }}>📅 All Time</MenuItem>
              <MenuItem value="today" sx={{ fontSize: "0.8125rem" }}>Today</MenuItem>
              <MenuItem value="yesterday" sx={{ fontSize: "0.8125rem" }}>Yesterday</MenuItem>
              <MenuItem value="week" sx={{ fontSize: "0.8125rem" }}>Last 7 Days</MenuItem>
              <MenuItem value="month" sx={{ fontSize: "0.8125rem" }}>Last 30 Days</MenuItem>
            </Select>

            {/* Status Filter Dropdown */}
            <Select
              size="small"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StoryStatus | "all")}
              displayEmpty
              sx={{
                borderRadius: "10px",
                fontSize: "0.8125rem",
                height: 38,
                minWidth: 150,
                backgroundColor: statusFilter !== "all" ? (mode === "light" ? "#f3f4f6" : "#2a2a2a") : "transparent",
                fontWeight: statusFilter !== "all" ? 600 : 400,
              }}
            >
              <MenuItem value="all" sx={{ fontSize: "0.8125rem" }}>All Statuses</MenuItem>
              <MenuItem value="pending_approval" sx={{ fontSize: "0.8125rem" }}>Pending Approval</MenuItem>
              <MenuItem value="pending_review" sx={{ fontSize: "0.8125rem" }}>Pending Review</MenuItem>
              <MenuItem value="approved" sx={{ fontSize: "0.8125rem" }}>Approved</MenuItem>
              <MenuItem value="rejected" sx={{ fontSize: "0.8125rem" }}>Rejected</MenuItem>
            </Select>

            {/* Category Dropdown */}
            <Select
              size="small"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as StoryCategory | "all")}
              displayEmpty
              sx={{
                borderRadius: "10px",
                fontSize: "0.8125rem",
                height: 38,
                minWidth: 140,
                backgroundColor: categoryFilter !== "all" ? (mode === "light" ? "#f3f4f6" : "#2a2a2a") : "transparent",
                fontWeight: categoryFilter !== "all" ? 600 : 400,
              }}
            >
              <MenuItem value="all" sx={{ fontSize: "0.8125rem" }}>All Categories</MenuItem>
              <MenuItem value="Politics" sx={{ fontSize: "0.8125rem" }}>Politics</MenuItem>
              <MenuItem value="Sports" sx={{ fontSize: "0.8125rem" }}>Sports</MenuItem>
              <MenuItem value="Business" sx={{ fontSize: "0.8125rem" }}>Business</MenuItem>
              <MenuItem value="Technology" sx={{ fontSize: "0.8125rem" }}>Technology</MenuItem>
              <MenuItem value="Entertainment" sx={{ fontSize: "0.8125rem" }}>Entertainment</MenuItem>
              <MenuItem value="Health" sx={{ fontSize: "0.8125rem" }}>Health</MenuItem>
              <MenuItem value="International" sx={{ fontSize: "0.8125rem" }}>International</MenuItem>
            </Select>

            {(statusFilter !== "all" || categoryFilter !== "all" || dateFilter !== "all" || searchQuery) && (
              <Button
                size="small"
                onClick={() => {
                  setStatusFilter("all");
                  setCategoryFilter("all");
                  setDateFilter("all");
                  setSearchQuery("");
                }}
                startIcon={<RotateCcw size={13} />}
                sx={{ textTransform: "none", fontSize: "0.75rem", height: 38, borderRadius: "10px", color: "error.main", px: 1.25 }}
              >
                Reset
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      {/* VIEW MODE 1: CARDS VIEW */}
      {viewMode === "cards" && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2 }}>
          {filteredStories.map((story) => (
            <Box
              key={story.id}
              sx={{
                backgroundColor: "background.paper",
                borderRadius: "12px",
                p: 2,
                boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)",
                border: "1px solid",
                borderColor: "divider",
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": { transform: "translateY(-2px)", boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.08)" },
              }}
              onClick={() => openStoryModal(story)}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.35, flex: 1 }}>
                  {story.title}
                </Typography>
                <Chip
                  label={story.status.replace("_", " ")}
                  size="small"
                  sx={{
                    fontSize: "0.625rem",
                    height: 22,
                    fontWeight: 600,
                    backgroundColor: STATUS_COLORS[story.status].bg,
                    color: STATUS_COLORS[story.status].text,
                    borderRadius: "6px",
                    textTransform: "capitalize",
                    flexShrink: 0,
                  }}
                />
              </Box>

              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                <Chip
                  label={story.category}
                  size="small"
                  sx={{ fontSize: "0.625rem", height: 20, backgroundColor: "action.hover", color: "text.secondary", borderRadius: "6px" }}
                />
                <Chip
                  label={story.priority}
                  size="small"
                  sx={{ fontSize: "0.625rem", height: 20, fontWeight: 600, backgroundColor: "action.selected" }}
                />
              </Box>

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontWeight: 500 }}>
                  ✍️ {story.reporter}
                </Typography>
                <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>
                  {new Date(story.createdAt).toLocaleDateString()}
                </Typography>
              </Box>

              {/* Approval Actions: Approve & Reject */}
              <Box
                sx={{ display: "flex", gap: 1, mt: "auto", pt: 1 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={!can("draft.approve") || story.status === "approved"}
                  onClick={() => handleApprove(story.id, story.title)}
                  startIcon={<CheckCircle size={14} />}
                  sx={{ flex: 1, borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", fontWeight: 600 }}
                >
                  {story.status === "approved" ? "Approved" : "Approve & Publish"}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={!can("draft.reject") || story.status === "rejected"}
                  onClick={() => handleReject(story.id, story.title)}
                  startIcon={<XCircle size={14} />}
                  sx={{ borderRadius: "8px", textTransform: "none", fontSize: "0.75rem", px: 1.25 }}
                >
                  Reject
                </Button>
                <IconButton
                  size="small"
                  onClick={() => openStoryModal(story)}
                  sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px" }}
                >
                  <Eye size={15} />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* VIEW MODE 2: LIST VIEW TABLE */}
      {viewMode === "list" && (
        <TableContainer component={Paper} sx={{ borderRadius: "12px", border: "1px solid", borderColor: "divider", boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)" }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: mode === "light" ? "#f9fafb" : "#1a1a1a" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Headline / Story</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Reporter</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Date</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>Approval Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStories.map((story) => (
                <TableRow
                  key={story.id}
                  hover
                  onClick={() => openStoryModal(story)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.8125rem", maxWidth: 300 }}>
                    {story.title}
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem" }}>{story.reporter}</TableCell>
                  <TableCell sx={{ fontSize: "0.75rem" }}>
                    <Chip label={story.category} size="small" sx={{ fontSize: "0.65rem", height: 20 }} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={story.status.replace("_", " ")}
                      size="small"
                      sx={{
                        fontSize: "0.65rem",
                        height: 20,
                        fontWeight: 600,
                        backgroundColor: STATUS_COLORS[story.status].bg,
                        color: STATUS_COLORS[story.status].text,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
                    {new Date(story.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: "flex", gap: 0.75, justifyContent: "flex-end", alignItems: "center" }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        disabled={!can("draft.approve") || story.status === "approved"}
                        onClick={() => handleApprove(story.id, story.title)}
                        startIcon={<CheckCircle size={13} />}
                        sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem", py: 0.25, px: 1 }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={!can("draft.reject") || story.status === "rejected"}
                        onClick={() => handleReject(story.id, story.title)}
                        startIcon={<XCircle size={13} />}
                        sx={{ borderRadius: "6px", textTransform: "none", fontSize: "0.7rem", py: 0.25, px: 1 }}
                      >
                        Reject
                      </Button>
                      <IconButton size="small" onClick={() => openStoryModal(story)}>
                        <Eye size={15} />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {filteredStories.length === 0 && (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary", backgroundColor: "background.paper", borderRadius: "12px" }}>
          <Typography sx={{ fontSize: "0.875rem" }}>No stories match your filters</Typography>
        </Box>
      )}

      {/* Approval Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setSelectedStory(null); setIsEditing(false); }}>
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "calc(100vw - 32px)",
            maxWidth: 720,
            maxHeight: "calc(100vh - 48px)",
            bgcolor: "background.paper",
            borderRadius: "16px",
            boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
            overflow: "hidden",
            outline: "none",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {selectedStory && (
            <>
              {/* Modal Header */}
              <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Box sx={{ flex: 1, pr: 2 }}>
                  {isEditing ? (
                    <TextField
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      fullWidth
                      sx={{ "& .MuiOutlinedInput-root": { fontSize: "1.125rem", fontWeight: 600 } }}
                    />
                  ) : (
                    <Typography sx={{ fontWeight: 600, fontSize: "1.125rem", lineHeight: 1.3 }}>
                      {selectedStory.title}
                    </Typography>
                  )}
                  <Box sx={{ display: "flex", gap: 0.75, mt: 1, flexWrap: "wrap" }}>
                    <Chip label={selectedStory.category} size="small" sx={{ fontSize: "0.625rem", height: 20, backgroundColor: "action.hover", borderRadius: "6px" }} />
                    <Chip
                      label={selectedStory.status.replace("_", " ")}
                      size="small"
                      sx={{
                        fontSize: "0.625rem",
                        height: 22,
                        fontWeight: 600,
                        backgroundColor: STATUS_COLORS[selectedStory.status].bg,
                        color: STATUS_COLORS[selectedStory.status].text,
                        borderRadius: "6px",
                        textTransform: "capitalize",
                      }}
                    />
                  </Box>
                </Box>
                <IconButton onClick={() => { setModalOpen(false); setSelectedStory(null); setIsEditing(false); }} size="small">
                  <X size={18} />
                </IconButton>
              </Box>

              {/* Modal Body */}
              <Box sx={{ p: { xs: 2, sm: 3 }, overflowY: "auto", flex: 1 }}>
                <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                    <strong>Reporter:</strong> {selectedStory.reporter}
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                    <strong>Date:</strong> {new Date(selectedStory.createdAt).toLocaleString()}
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                    <strong>Priority:</strong> {selectedStory.priority}
                  </Typography>
                </Box>

                <Box sx={{ mb: 3 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem", mb: 1, color: "text.secondary" }}>Article Body</Typography>
                  {isEditing ? (
                    <TextField
                      multiline
                      rows={4}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      fullWidth
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem" } }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.6, color: "text.primary" }}>
                      {selectedStory.body}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ mb: 3, p: 2, backgroundColor: mode === "light" ? "#f8f9fa" : "#1a1a1a", borderRadius: "8px" }}>
                  <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem", mb: 1, color: "text.secondary" }}>
                    AI Summary
                  </Typography>
                  {isEditing ? (
                    <TextField
                      multiline
                      rows={2}
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      fullWidth
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "8px", fontSize: "0.8125rem" } }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                      {selectedStory.aiSummary}
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Modal Actions */}
              <Box sx={{ p: { xs: 2, sm: 3 }, pt: 2, borderTop: "1px solid", borderColor: "divider", display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
                {isEditing ? (
                  <Button variant="contained" onClick={handleSave} startIcon={<Save size={16} />} sx={{ borderRadius: "8px" }}>
                    Save Changes
                  </Button>
                ) : (
                  can("draft.edit") && (
                    <Button variant="outlined" onClick={() => setIsEditing(true)} startIcon={<Pencil size={16} />} sx={{ borderRadius: "8px" }}>
                      Edit
                    </Button>
                  )
                )}
                <Tooltip title={!can("draft.reject") ? "No permission to reject" : ""}>
                  <span>
                    <Button
                      variant="outlined"
                      color="error"
                      disabled={!can("draft.reject") || selectedStory.status === "rejected"}
                      onClick={() => handleReject(selectedStory.id, selectedStory.title)}
                      startIcon={<XCircle size={16} />}
                      sx={{ borderRadius: "8px" }}
                    >
                      Reject
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title={!can("draft.approve") ? "No permission to approve" : ""}>
                  <span>
                    <Button
                      variant="contained"
                      color="success"
                      disabled={!can("draft.approve") || selectedStory.status === "approved"}
                      onClick={() => handleApprove(selectedStory.id, selectedStory.title)}
                      startIcon={<CheckCircle size={16} />}
                      sx={{ borderRadius: "8px", fontWeight: 700 }}
                    >
                      Approve & Publish
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            </>
          )}
        </Box>
      </Modal>
    </Box>
  );
};

export default ApprovalPortal;
