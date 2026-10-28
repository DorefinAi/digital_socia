"use client";

import React from "react";
import { Box, Typography } from "@mui/material";
import { Film, FolderOpen, Image as ImageIcon } from "lucide-react";
import type { DraftMedia, DraftView } from "@/lib/socia/types";
import { fileUrl } from "./LiveDesk";

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const SKIPPED: Record<string, string> = {
  video_off: "Video on the FTP, not copied",
  too_big: "Too big to copy",
};

const FOOTAGE_STATE: Record<string, string> = {
  waiting: "Waiting for footage on the FTP",
  not_found: "No footage folder found on the FTP",
  not_checked: "Footage not checked yet",
};

/** The open story's files from its FTP folder: copied photos and videos, and files only seen on the FTP. */
export default function FootageList({ draft }: { draft: DraftView }) {
  const media: DraftMedia[] = draft.media ?? [];
  const external = draft.story.external;
  const state = external?.footageStatus ? FOOTAGE_STATE[external.footageStatus] : null;

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", p: 1.25 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <FolderOpen size={14} />
        <Typography sx={{ fontSize: "0.75rem", fontWeight: 700 }}>This story&apos;s footage</Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", ml: "auto", whiteSpace: "nowrap" }}>
          {media.length} {media.length === 1 ? "file" : "files"}
        </Typography>
      </Box>
      {external?.footagePath && (
        <Typography sx={{ fontSize: "0.625rem", fontFamily: "var(--font-mono), monospace", color: "text.disabled", mt: 0.5, wordBreak: "break-all" }}>{external.footagePath}</Typography>
      )}
      {media.length === 0 ? (
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.75 }}>{state ?? "No photos or videos came with this story."}</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mt: 0.75, display: "grid", gap: 0.5, maxHeight: { xs: 220, lg: 200 }, overflowY: "auto" }}>
          {media.map((m) => (
            <Box component="li" key={m.id} sx={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr)", gap: 1, alignItems: "center" }}>
              <Box sx={{ width: 40, height: 30, borderRadius: "4px", overflow: "hidden", backgroundColor: "#111", color: "#bbb", display: "grid", placeItems: "center" }}>
                {m.kind === "image" && m.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(m.url)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : m.kind === "video" ? (
                  <Film size={14} />
                ) : (
                  <ImageIcon size={14} />
                )}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.sourcePath ?? m.fileName}>
                  {m.fileName}
                </Typography>
                <Typography sx={{ fontSize: "0.625rem", color: m.copied ? "text.secondary" : "warning.main" }}>
                  {size(m.bytes)}
                  {m.copied ? "" : ` · ${SKIPPED[m.skipReason ?? ""] ?? "Not copied"}`}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
