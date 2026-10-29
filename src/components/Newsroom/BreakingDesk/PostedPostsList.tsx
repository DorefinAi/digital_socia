"use client";

import React, { useState } from "react";
import { Box, Typography, IconButton, Tooltip, Link as MuiLink, Chip, Button } from "@mui/material";
import { Check, Copy, ExternalLink, Film, Undo2 } from "lucide-react";
import { useNewsroom } from "@/providers/NewsroomProvider";
import { usePermissions } from "@/lib/access/usePermissions";
import { SocialPlatform, SocialPost } from "@/types/newsroom";
import { RecallDialog } from "./actionDialogs";
import { PLATFORM_META, PlatformIcon, timeAgo } from "./shared";
import { postToSocial, useLiveDesk } from "./live/LiveDesk";
import { LoadError, LoadingRows } from "@/components/Newsroom/SociaDesk/liveShared";

interface PostedPostsListProps {
  platform?: SocialPlatform;
  limit?: number;
  emptyHint?: string;
  /** Drop the outer border when the list sits inside a card */
  bare?: boolean;
  /** Show the Recall action on live posts */
  allowRecall?: boolean;
}

export default function PostedPostsList({ platform, limit, emptyHint, bare, allowRecall }: PostedPostsListProps) {
  const { socialPosts, recallPost } = useNewsroom();
  const { can } = usePermissions();
  const desk = useLiveDesk();
  const [recalling, setRecalling] = useState<SocialPost | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [recallError, setRecallError] = useState<string | null>(null);

  // Live: the real X posts from the server
  const source = desk ? (desk.posts.data?.items ?? []).map(postToSocial) : socialPosts;
  const canRecall = can("post.undo");
  const posts = source.filter((p) => !platform || p.platform === platform).slice(0, limit);

  if (desk && !desk.posts.data) {
    return desk.posts.error ? <LoadError error={desk.posts.error} onRetry={() => void desk.posts.refresh()} /> : <LoadingRows />;
  }

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1600);
    } catch {
      // Clipboard is unavailable on insecure origins; the link stays selectable in the row
    }
  };

  if (posts.length === 0) {
    return (
      <Box sx={{ py: 5, px: 2, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: "8px" }}>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>Nothing posted yet</Typography>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.5 }}>
          {emptyHint ?? "Posts appear here with their link as soon as they go out."}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={bare ? undefined : { backgroundColor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
      {posts.map((post, i) => (
        <Box
          key={post.id}
          sx={{
            display: "grid",
            gridTemplateColumns: "56px minmax(0, 1fr) auto",
            gap: 1.25,
            alignItems: "center",
            px: 1.25,
            py: 1,
            borderTop: i === 0 ? "none" : "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ position: "relative", width: "100%", aspectRatio: "7 / 5", borderRadius: "4px", overflow: "hidden", backgroundColor: "#111" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {post.mediaKind === "video" && (
              <Box sx={{ position: "absolute", right: 3, bottom: 3, display: "flex", p: "2px", borderRadius: "3px", backgroundColor: "rgba(0,0,0,0.7)", color: "#fff" }}>
                <Film size={11} />
              </Box>
            )}
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <PlatformIcon platform={post.platform} size={13} />
              <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: post.status === "recalled" ? "text.secondary" : "text.primary" }}>
                {post.headline}
              </Typography>
              {post.status === "recalled" && <Chip label="Recalled" size="small" color="error" variant="outlined" sx={{ height: 18, fontSize: "0.625rem", borderRadius: "5px", flexShrink: 0 }} />}
            </Box>
            <MuiLink
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{
                display: "block",
                mt: 0.25,
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono), monospace",
                color: "text.secondary",
                textDecoration: post.status === "recalled" ? "line-through" : undefined,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {post.postUrl.replace(/^https:\/\/(www\.)?/, "")}
            </MuiLink>
            <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", mt: 0.25 }}>
              {timeAgo(post.postedAt)} · {post.postedBy}
              {post.status === "recalled" && post.recallReason ? ` · recalled: ${post.recallReason}` : ""}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center" }}>
            {allowRecall && canRecall && post.status !== "recalled" && (
              <Button size="small" color="error" startIcon={<Undo2 size={13} />} onClick={() => setRecalling(post)} sx={{ minHeight: 28, fontSize: "0.75rem", px: 1, mr: 0.5 }}>
                Recall
              </Button>
            )}
            <Tooltip title={copiedId === post.id ? "Copied" : "Copy link"}>
              <IconButton size="small" onClick={() => copy(post.id, post.postUrl)} aria-label="Copy post link">
                {copiedId === post.id ? <Check size={15} /> : <Copy size={15} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Open post">
              <IconButton size="small" component="a" href={post.postUrl} target="_blank" rel="noopener noreferrer" aria-label="Open post">
                <ExternalLink size={15} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      ))}
      {recalling && (
        <RecallDialog
          open
          headline={recalling.headline}
          platformName={PLATFORM_META[recalling.platform].short}
          onClose={() => setRecalling(null)}
          onConfirm={(reason) => {
            if (desk) {
              void desk.recall(recalling.id, reason).then(setRecallError);
            } else recallPost(recalling.id, reason);
            setRecalling(null);
          }}
        />
      )}
      {recallError && (
        <Typography role="alert" sx={{ px: 1.25, py: 1, fontSize: "0.75rem", color: "error.main", borderTop: "1px solid", borderColor: "divider" }}>
          {recallError}
        </Typography>
      )}
    </Box>
  );
}
