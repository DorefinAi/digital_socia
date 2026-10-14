"use client";

import React from "react";
import { Box, Typography, Button, Chip, IconButton, Tooltip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from "@mui/material";
import { Ban, CheckCircle, Film, Image as ImageIcon, Lock, MapPin, PenLine, Save } from "lucide-react";
import { useThemeMode } from "@/providers/MuiProvider";
import { FtpNewsItem } from "@/types/newsroom";
import { TagChip, timeAgo } from "./shared";

export interface QueueViewProps {
  items: FtpNewsItem[];
  focusedId?: string;
  onFocus: (index: number) => void;
  onOpen: (item: FtpNewsItem) => void;
  onReject: (item: FtpNewsItem) => void;
  isSaved: (newsId: string) => boolean;
  /** Short name of the other platform when the story is already live there */
  liveElsewhere: (newsId: string) => string | null;
  canAct: boolean;
}

const countMedia = (item: FtpNewsItem) => {
  const videos = item.media.filter((m) => m.kind === "video").length;
  return { videos, images: item.media.length - videos };
};

function MediaCounts({ item }: { item: FtpNewsItem }) {
  const { videos, images } = countMedia(item);
  return (
    <>
      {images > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
          <ImageIcon size={12} /> {images}
        </Box>
      )}
      {videos > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
          <Film size={12} /> {videos}
        </Box>
      )}
    </>
  );
}

function StatusChip({ saved, elsewhere }: { saved: boolean; elsewhere: string | null }) {
  if (saved) return <Chip icon={<Save size={11} />} label="Draft saved" size="small" sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px" }} />;
  if (elsewhere) return <Chip icon={<CheckCircle size={11} />} label={`On ${elsewhere}`} size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px" }} />;
  return <Chip label="New" size="small" sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 600, borderRadius: "6px", backgroundColor: "#FFF8E1", color: "#F57F17" }} />;
}

function Actions({ item, saved, canAct, onOpen, onReject, compact }: { item: FtpNewsItem; saved: boolean; canAct: boolean; onOpen: () => void; onReject: () => void; compact?: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
      {canAct && (
        <Tooltip title="Reject (R)">
          <IconButton size="small" aria-label={`Reject ${item.headline}`} onClick={onReject} sx={{ borderRadius: "8px", color: "text.secondary", "&:hover": { color: "error.main" } }}>
            <Ban size={15} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={canAct ? "Open in editor (Enter)" : "Your role can view posts but not publish them"}>
        <span>
          <Button
            size="small"
            variant="contained"
            onClick={onOpen}
            disabled={!canAct}
            startIcon={canAct ? <PenLine size={14} /> : <Lock size={14} />}
            sx={{ borderRadius: "8px", textTransform: "none", fontSize: compact ? "0.7rem" : "0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            {saved ? "Continue" : "Create post"}
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}

// ─── Cards ───────────────────────────────────────────────────────────────────
export function QueueCards({ items, focusedId, onFocus, onOpen, onReject, isSaved, liveElsewhere, canAct }: QueueViewProps) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)" }, gap: 2.5 }}>
      {items.map((item, i) => {
        const cover = item.media[0];
        const saved = isSaved(item.id);
        const elsewhere = liveElsewhere(item.id);
        return (
          <Box
            key={item.id}
            onClick={() => onFocus(i)}
            sx={{
              backgroundColor: "background.paper",
              borderRadius: "14px",
              overflow: "hidden",
              border: "1px solid",
              borderColor: item.id === focusedId ? "text.primary" : "divider",
              boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.03)",
              display: "flex",
              flexDirection: "column",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              "&:hover": { transform: "translateY(-2px)", boxShadow: "0px 8px 24px rgba(0, 0, 0, 0.08)" },
            }}
          >
            <Box sx={{ position: "relative", height: 150, backgroundColor: "#000", cursor: canAct ? "pointer" : "default" }} onClick={() => canAct && onOpen(item)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.posterUrl ?? cover.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <Box sx={{ position: "absolute", left: 10, top: 10 }}>
                <TagChip tag={item.tag} />
              </Box>
              {cover.kind === "video" && (
                <Box sx={{ position: "absolute", right: 10, top: 10, display: "flex", alignItems: "center", gap: 0.4, px: 0.75, py: 0.25, borderRadius: "4px", backgroundColor: "rgba(0,0,0,0.7)", color: "#fff", fontSize: "0.625rem", fontWeight: 700 }}>
                  <Film size={11} /> VIDEO
                </Box>
              )}
            </Box>
            <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.45 }}>{item.headline}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.shortText}</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap", fontSize: "0.6875rem", color: "text.secondary" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                  <MapPin size={12} /> {item.area}
                </Box>
                <MediaCounts item={item} />
                <span>{timeAgo(item.receivedAt)}</span>
              </Box>
              <Box sx={{ mt: "auto", pt: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <StatusChip saved={saved} elsewhere={elsewhere} />
                <Actions item={item} saved={saved} canAct={canAct} onOpen={() => onOpen(item)} onReject={() => onReject(item)} />
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── List (table) ────────────────────────────────────────────────────────────
export function QueueTable({ items, focusedId, onFocus, onOpen, onReject, isSaved, liveElsewhere, canAct }: QueueViewProps) {
  const { mode } = useThemeMode();
  const head = { fontWeight: 700, fontSize: "0.75rem", whiteSpace: "nowrap" as const };

  return (
    <TableContainer component={Paper} sx={{ borderRadius: "12px", border: "1px solid", borderColor: "divider", boxShadow: "none" }}>
      <Table size="small" sx={{ minWidth: 820 }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: mode === "light" ? "#f9fafb" : "#1a1a1a" }}>
            <TableCell sx={head}>Media</TableCell>
            <TableCell sx={head}>Headline</TableCell>
            <TableCell sx={head}>Tag</TableCell>
            <TableCell sx={head}>Area</TableCell>
            <TableCell sx={head}>Files</TableCell>
            <TableCell sx={head}>Received</TableCell>
            <TableCell sx={head}>Status</TableCell>
            <TableCell align="right" sx={head}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item, i) => {
            const cover = item.media[0];
            const saved = isSaved(item.id);
            return (
              <TableRow
                key={item.id}
                hover
                selected={item.id === focusedId}
                onClick={() => onFocus(i)}
                onDoubleClick={() => canAct && onOpen(item)}
                sx={{ cursor: "pointer" }}
              >
                <TableCell>
                  <Box sx={{ position: "relative", width: 64, height: 40, borderRadius: "6px", overflow: "hidden", backgroundColor: "#111" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover.posterUrl ?? cover.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </Box>
                </TableCell>
                <TableCell sx={{ maxWidth: 360 }}>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.4 }}>{item.headline}</Typography>
                  <Typography sx={{ fontSize: "0.6875rem", color: "text.disabled", fontFamily: "var(--font-mono), ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.ftpPath}</Typography>
                </TableCell>
                <TableCell>
                  <TagChip tag={item.tag} />
                </TableCell>
                <TableCell sx={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>{item.area}</TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 1, fontSize: "0.75rem", color: "text.secondary" }}>
                    <MediaCounts item={item} />
                  </Box>
                </TableCell>
                <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap" }}>{timeAgo(item.receivedAt)}</TableCell>
                <TableCell>
                  <StatusChip saved={saved} elsewhere={liveElsewhere(item.id)} />
                </TableCell>
                <TableCell align="right">
                  <Actions item={item} saved={saved} canAct={canAct} onOpen={() => onOpen(item)} onReject={() => onReject(item)} compact />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
