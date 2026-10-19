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

function Actions({ item, saved, canAct, onOpen, onReject, compact, align = "end" }: { item: FtpNewsItem; saved: boolean; canAct: boolean; onOpen: () => void; onReject: () => void; compact?: boolean; align?: "start" | "end" }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: align === "end" ? "flex-end" : "flex-start" }} onClick={(e) => e.stopPropagation()}>
      {canAct && (
        <Tooltip title="Reject (R)">
          <IconButton size="small" aria-label={`Reject ${item.headline}`} onClick={onReject} sx={{ width: { xs: 40, md: 32 }, height: { xs: 40, md: 32 }, borderRadius: "8px", color: "text.secondary", "&:hover": { color: "error.main" } }}>
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
            sx={{ minHeight: { xs: 40, md: 32 }, borderRadius: "8px", textTransform: "none", fontSize: compact ? "0.7rem" : "0.75rem", fontWeight: 600, whiteSpace: "nowrap" }}
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
// Fits the column at any width: tag, area, files and time sit under the
// headline, the thumbnail appears from sm, status gets its own column from md,
// and on phones the actions move into the story cell.
export function QueueTable({ items, focusedId, onFocus, onOpen, onReject, isSaved, liveElsewhere, canAct }: QueueViewProps) {
  const { mode } = useThemeMode();
  const head = { fontWeight: 700, fontSize: "0.75rem", whiteSpace: "nowrap" as const };
  const fromSm = { display: { xs: "none", sm: "table-cell" } };
  const fromMd = { display: { xs: "none", md: "table-cell" } };

  return (
    <TableContainer component={Paper} sx={{ borderRadius: "12px", border: "1px solid", borderColor: "divider", boxShadow: "none" }}>
      <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: mode === "light" ? "#f9fafb" : "#1a1a1a" }}>
            <TableCell sx={{ ...head, ...fromSm, width: 92 }}>Media</TableCell>
            <TableCell sx={head}>Story</TableCell>
            <TableCell sx={{ ...head, ...fromMd, width: 124 }}>Status</TableCell>
            <TableCell align="right" sx={{ ...head, ...fromSm, width: { sm: 168 } }}>
              Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item, i) => {
            const cover = item.media[0];
            const saved = isSaved(item.id);
            const elsewhere = liveElsewhere(item.id);
            return (
              <TableRow
                key={item.id}
                hover
                selected={item.id === focusedId}
                onClick={() => onFocus(i)}
                onDoubleClick={() => canAct && onOpen(item)}
                sx={{ cursor: "pointer", verticalAlign: "top", "& > td": { py: 1.25 } }}
              >
                <TableCell sx={fromSm}>
                  <Box sx={{ position: "relative", width: 64, height: 40, borderRadius: "6px", overflow: "hidden", backgroundColor: "#111" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cover.posterUrl ?? cover.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.4, overflowWrap: "anywhere" }}>{item.headline}</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 0.5, fontSize: "0.75rem", color: "text.secondary" }}>
                    <TagChip tag={item.tag} />
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                      <MapPin size={12} /> {item.area}
                    </Box>
                    <MediaCounts item={item} />
                    <span>{timeAgo(item.receivedAt)}</span>
                    <Box sx={{ display: { xs: "inline-flex", md: "none" } }}>
                      <StatusChip saved={saved} elsewhere={elsewhere} />
                    </Box>
                  </Box>
                  <Typography sx={{ display: { xs: "none", sm: "block" }, mt: 0.5, fontSize: "0.6875rem", color: "text.disabled", fontFamily: "var(--font-mono), monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.ftpPath}</Typography>
                  <Box sx={{ display: { xs: "block", sm: "none" }, mt: 1 }}>
                    <Actions item={item} saved={saved} canAct={canAct} onOpen={() => onOpen(item)} onReject={() => onReject(item)} align="start" />
                  </Box>
                </TableCell>
                <TableCell sx={fromMd}>
                  <StatusChip saved={saved} elsewhere={elsewhere} />
                </TableCell>
                <TableCell align="right" sx={fromSm}>
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
